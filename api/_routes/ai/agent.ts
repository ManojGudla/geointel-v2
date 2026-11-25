import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";
import { getAiCompletion, type AiMessage } from "../../_lib/ai.js";
import { fenceRules, makeFence } from "../../_lib/untrusted.js";
import { GROUNDING_RULES } from "../../_lib/aiGrounding.js";
import { gatherForAgent } from "../../_lib/evidence/gather.js";
import { INSUFFICIENT, checkAnswer, confidenceFor, evidenceTable, sourcesOf } from "../../_lib/evidence/grounding.js";
import type { AgentAnchor, AgentKind, AgentResult, AgentStep } from "../../../src/types/ai.js";

const VALID_KINDS: AgentKind[] = ["search", "gis", "property", "navigation", "travel", "makeMyTrip"];
const MODES = ["car", "walk", "bike"] as const;

/**
 * What each agent explains. The facts come only from the evidence table;
 * these sentences say which of them matter to this agent.
 */
const AGENT_FOCUS: Record<AgentKind, string> = {
  search:
    "Explain what the search found: the best match, whether the selected place is that match, and whether other matches make the search ambiguous. If nothing was searched, describe the selected place from the evidence and suggest searching.",
  gis:
    "Explain what the mapped features around this point show: which kinds dominate, which are absent, how strong or thin the evidence is, and what the population figures say about the wider place. Point out data gaps (zero counts can mean unmapped).",
  property:
    "Explain the property classification in plain language: what it is based on, how confident it is and why, and what evidence would make it stronger. Never discuss value, ownership, zoning or legal status.",
  navigation:
    "Explain the planned route: how far and how long by the chosen mode, how it compares with the straight-line distance, and whether other routes were offered. Never mention traffic, closures or delays: there is no live traffic data.",
  travel:
    "Explain this place for a visitor right now: the weather and forecast, and what is nearby (food, stays, transport, parks, health). For booking flights, trains, buses or hotels, point to the Travel tab, which opens real booking sites. Never state prices, schedules, availability or opening hours.",
  makeMyTrip:
    "Suggest a short same-day plan around this place using only the nearby places and weather in the evidence, naming a place only if its name appears there, in a sensible order by distance. For tickets, stays or getting here, point to the Travel tab. Never state prices, opening hours or bookings.",
};

/** What to say, without asking the model, when the evidence cannot carry an answer. */
const INSUFFICIENT_FOR: Partial<Record<AgentKind, string>> = {
  navigation: "No route is planned yet. Choose a start and an end in Directions, then run this agent again.",
};

function finiteIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * The anchor, checked. Coordinates must be on the globe; everything else is
 * optional and dropped when malformed rather than failing the request.
 */
export function parseAnchor(raw: unknown): AgentAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const lat = finiteIn(a.lat, -90, 90);
  const lon = finiteIn(a.lon, -180, 180);
  if (lat === null || lon === null) return null;
  const anchor: AgentAnchor = { lat, lon };
  const radius = finiteIn(a.radiusMeters, 1, 5_000);
  if (radius !== null) anchor.radiusMeters = radius;
  if (typeof a.query === "string" && a.query.trim()) anchor.query = a.query.trim().slice(0, 200);
  const r = a.route as Record<string, unknown> | undefined;
  if (r && typeof r === "object") {
    const fromLat = finiteIn(r.fromLat, -90, 90);
    const fromLon = finiteIn(r.fromLon, -180, 180);
    const toLat = finiteIn(r.toLat, -90, 90);
    const toLon = finiteIn(r.toLon, -180, 180);
    const mode = MODES.find((m) => m === r.mode);
    if (fromLat !== null && fromLon !== null && toLat !== null && toLon !== null && mode) {
      anchor.route = { fromLat, fromLon, toLat, toLon, mode };
    }
  }
  return anchor;
}

/** The client gives up at 40 s; everything here has to fit inside that. */
const REQUEST_BUDGET_MS = 37_000;

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  // Same durable counter and the same "ai" scope as the Copilot route, so the
  // two cannot be alternated to get twice the budget.
  const ip = getClientIp(req);
  const rate = await checkDurableLimit("ai", ip, 60_000, 15);
  if (!rate.allowed) return err(res, 429, "Too many agent requests. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as { kind?: AgentKind; anchor?: unknown };
  const kind = body.kind;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return err(res, 400, `'kind' must be one of: ${VALID_KINDS.join(", ")}.`);
  }
  if (JSON.stringify(body).length > 20_000) {
    return err(res, 413, "Too much data sent with this request.");
  }
  /*
    The browser used to send the facts themselves ("context"), and the
    answer repeated them as verified. Now it sends only where to look; a
    request without that is from a page loaded before the change.
  */
  const anchor = parseAnchor(body.anchor);
  if (!anchor) {
    return err(res, 400, "Reload the page to use the agents: they now check every fact on the server, and need the selected place to do it.", "ANCHOR_REQUIRED");
  }

  const started = Date.now();
  const gathered = await gatherForAgent(kind, anchor, req);
  const confidence = confidenceFor(kind, gathered.outcomes);
  const steps: AgentStep[] = [...gathered.steps];
  const base = { kind, evidence: gathered.items, confidence, sources: sourcesOf(gathered.items) };

  if (confidence.level === "insufficient") {
    // Nothing to explain, so no model call: it would only spend the day's quota.
    const result: AgentResult = {
      ...base,
      summary: INSUFFICIENT_FOR[kind] ?? `${INSUFFICIENT} ${confidence.reason}`.trim(),
      findings: [],
      steps,
      generatedAt: new Date().toISOString(),
      model: "none: not enough evidence to ask a model",
      removedSentences: 0,
    };
    return ok(res, { result });
  }

  const fence = makeFence("EVIDENCE");
  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        `You are the ${kind} intelligence agent inside maNOWj GeoIntel, writing a short result card for a real person. ${AGENT_FOCUS[kind]} ` +
        "Write 3 to 5 plain sentences. No markdown, no lists, no headings, no em dashes. " +
        "Never show your reasoning or narrate what you are doing; give only the final answer. " +
        "Match the person's language only if the evidence signals one (Telugu, Hindi, Tamil, Kannada, Tenglish or Hinglish); otherwise write plain English. " +
        "Use ONLY the EVIDENCE table below. After every sentence that states a fact, cite the ids of the evidence it uses in square brackets, like [E2] or [E2, E5]. " +
        "Copy numbers exactly as the evidence writes them: never convert units, add up, average or estimate, because any sentence with a number that is not in the evidence is deleted before anyone sees it. " +
        "Items marked 'unavailable' were not obtained: say so plainly where it matters, and never fill them in. " +
        "When you give your own reading of the facts, say so ('this suggests'), and give no citation for it. " +
        `If the evidence does not cover what this agent explains, write exactly: ${INSUFFICIENT} ` +
        `${GROUNDING_RULES} ` +
        "If asked who built this app, say Manoj Kumar Gudla built it; decline personal questions about him.\n\n" +
        `${fenceRules(fence)}\n\nEVIDENCE (id | what | value | kind | source | as of | note):\n${fence.wrap(evidenceTable(gathered.items))}`,
    },
    { role: "user", content: `Run the ${kind} intelligence agent on the evidence.` },
  ];

  const aiStarted = Date.now();
  const remaining = REQUEST_BUDGET_MS - (aiStarted - started);
  const completion = await getAiCompletion(messages, { maxTokens: 1600, deadlineMs: Math.max(12_000, Math.min(30_000, remaining)) });
  steps.push({ step: "Writing the explanation (AI model)", status: completion.ok ? "ok" : "failed", ms: Date.now() - aiStarted });
  if (!completion.ok) return err(res, 502, completion.error, "AI_UNAVAILABLE");

  const checked = checkAnswer(completion.content, gathered.items);
  steps.push({ step: "Checking every number against the evidence", status: checked.removed ? "partial" : "ok", ms: 0 });

  const result: AgentResult = {
    ...base,
    summary: checked.findings.length ? checked.summary : INSUFFICIENT,
    findings: checked.findings,
    steps,
    generatedAt: new Date().toISOString(),
    model: completion.model,
    removedSentences: checked.removed,
  };
  ok(res, { result });
};

export default withMaintenanceGuard(handler);
