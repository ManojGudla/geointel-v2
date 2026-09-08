import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getClientIp } from "../_lib/http.js";
import { checkDurableLimit } from "../_lib/rateLimit.js";
import { getAiCompletion } from "../_lib/ai.js";

/**
 * Translates a question the local parser couldn't handle into a spatial
 * operation. Nothing more.
 *
 * The model is deliberately given the narrowest possible job: pick one
 * operation and its parameters from a fixed list. It is never asked to
 * count anything, estimate anything, or describe a place — the app runs the
 * operation itself against real data and reports real numbers. A language
 * model asked "how many hospitals are within 5 km of here" will happily
 * produce a confident number, and that number is fiction; asked "which of
 * these four operations is this question", it is doing the one thing it is
 * actually reliable at.
 *
 * Most questions never reach this endpoint at all — src/features/ai/
 * mapCommands.ts parses the common shapes locally, which keeps the free
 * tier's fifty-a-day quota for the questions that genuinely need it.
 */

/**
 * Durable, and sharing the "ai" scope with copilot and agent.
 *
 * This was an in-memory RateLimiter, which on Vercel is per serverless
 * instance and resets on every cold start — so parallel connections each got
 * a fresh budget and the endpoint had no real ceiling at all. Its two sibling
 * AI routes were moved to the Postgres limiter precisely because a counter
 * that resets does not bound a bill; this one was missed.
 *
 * Same scope string as the others on purpose: three separate budgets would
 * let a caller alternate between the routes for triple the spend.
 */
const AI_LIMIT_WINDOW_MS = 60_000;
const AI_LIMIT_MAX = 15;

const CATEGORIES = [
  "hospitals",
  "schools",
  "pharmacies",
  "police",
  "banks",
  "atms",
  "petrol",
  "restaurants",
  "cafes",
  "hotels",
  "shopping",
  "parks",
  "publicTransport",
] as const;

const PRESETS = ["hospital", "school", "retail", "restaurant", "hotel", "warehouse"] as const;

const SYSTEM_PROMPT = `You convert a user's question about a map location into ONE spatial operation.

Reply with ONLY a JSON object, no prose, no code fences. Use exactly this shape:
{"operation":"within|nearest|buffer|suitability","category":<category or null>,"presetId":<preset or null>,"radiusMeters":<number or null>,"confident":true|false}

Rules:
- "within": find all places of one category inside a distance. Needs category. radiusMeters defaults to 2000 if unstated.
- "nearest": find the single closest place of one category. Needs category. radiusMeters is ignored.
- "buffer": draw a ring and count everything inside. Needs radiusMeters, category is null.
- "suitability": score the site for building/opening something. Needs presetId.
- category must be one of: ${CATEGORIES.join(", ")}
- presetId must be one of: ${PRESETS.join(", ")}
- If the question is not about finding places, distances or site assessment, set "confident": false and leave the other fields null.
- Never invent counts, names or distances. You are only choosing an operation.`;

interface Intent {
  operation?: string;
  category?: string | null;
  presetId?: string | null;
  radiusMeters?: number | null;
  confident?: boolean;
}

/**
 * Models wrap JSON in prose or code fences often enough that failing on it
 * would make the feature look broken when the answer was actually there.
 * Extract the first balanced-looking object rather than trusting the whole
 * reply to be JSON.
 */
function extractJson(raw: string): Intent | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1)) as Intent;
  } catch {
    return null;
  }
}

/** Anything the model returns is treated as untrusted input and validated against the allowed values. */
function validate(intent: Intent | null): {
  operation: string;
  category: string | null;
  presetId: string | null;
  radiusMeters: number | null;
} | null {
  if (!intent || intent.confident === false) return null;

  const operation = intent.operation;
  if (operation !== "within" && operation !== "nearest" && operation !== "buffer" && operation !== "suitability") return null;

  const category = CATEGORIES.includes(intent.category as (typeof CATEGORIES)[number]) ? (intent.category as string) : null;
  const presetId = PRESETS.includes(intent.presetId as (typeof PRESETS)[number]) ? (intent.presetId as string) : null;

  const rawRadius = typeof intent.radiusMeters === "number" && Number.isFinite(intent.radiusMeters) ? intent.radiusMeters : null;
  // Clamped: a model that returns 5000000 would otherwise ask Overpass for
  // a query spanning half a continent.
  const radiusMeters = rawRadius === null ? null : Math.min(50_000, Math.max(100, Math.round(rawRadius)));

  if ((operation === "within" || operation === "nearest") && !category) return null;
  if (operation === "suitability" && !presetId) return null;
  if (operation === "buffer" && radiusMeters === null) return null;

  return { operation, category, presetId, radiusMeters };
}

const handler: ApiHandler = async (req, res) => {
  const body = req.body as { question?: unknown } | undefined;
  const question = typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) return err(res, 400, "A 'question' string is required.");
  if (question.length > 300) return err(res, 400, "That question is too long to interpret — try a shorter one.");

  const rate = await checkDurableLimit("ai", getClientIp(req), AI_LIMIT_WINDOW_MS, AI_LIMIT_MAX);
  if (!rate.allowed) return err(res, 429, "Too many AI requests. Please slow down.", "RATE_LIMITED");

  const completion = await getAiCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    // Small budget and zero temperature: this is a classification, and a
    // creative one is a wrong one.
    { maxTokens: 160, temperature: 0 }
  );

  if (!completion.ok) {
    return err(res, 502, completion.error, "AI_UNAVAILABLE");
  }

  const intent = validate(extractJson(completion.content));
  if (!intent) {
    return err(
      res,
      422,
      "That question couldn't be turned into a map operation. Try naming what to find and how far — for example, \"hospitals within 5 km\".",
      "NOT_UNDERSTOOD"
    );
  }

  ok(res, { intent, model: completion.model });
};

export default withMaintenanceGuard(handler);
