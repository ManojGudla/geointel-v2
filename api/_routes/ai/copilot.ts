import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";

import { getAiCompletion, type AiMessage } from "../../_lib/ai.js";
import { searchKnowledgeBase } from "../../_lib/kb.js";
import type { CopilotContext } from "../../../src/types/ai.js";

interface CopilotRequestBody {
  question?: string;
  context?: CopilotContext;
}

function buildDataBlock(context?: CopilotContext): string {
  if (!context || (!context.locationName && !context.property && !context.gis)) {
    return "No location is currently selected in the app.";
  }
  const lines: string[] = [];
  if (context.locationName) lines.push(`Location: ${context.locationName}`);
  if (context.address) lines.push(`Address: ${context.address}`);
  if (context.property) {
    lines.push(
      `Property classification: ${context.property.classification ?? "unknown"} ` +
        `(confidence ${context.property.confidence ?? 0}%, trust: ${context.property.trust ?? "unavailable"})`
    );
    if (context.property.reasoning) lines.push(`Property reasoning: ${context.property.reasoning}`);
  }
  if (context.gis) {
    if (context.gis.radiusMeters) lines.push(`GIS evidence radius: ${context.gis.radiusMeters}m`);
    if (context.gis.counts) lines.push(`GIS counts: ${JSON.stringify(context.gis.counts)}`);
    if (context.gis.scores) lines.push(`GIS scores: ${JSON.stringify(context.gis.scores)}`);
  }
  if (context.weather) lines.push(`Weather: ${context.weather.temperatureC ?? "?"}°C, ${context.weather.condition ?? "unknown"}`);
  if (context.nearbyTopCategories?.length) {
    lines.push(`Nearby: ${context.nearbyTopCategories.map((c) => `${c.count} ${c.category}`).join(", ")}`);
  }
  if (context.route) {
    lines.push(
      `Active route: ${context.route.mode ?? "?"}, ${context.route.distanceMeters ?? "?"}m, ${context.route.durationSeconds ?? "?"}s`
    );
  }
  if (context.officials?.length) {
    lines.push(
      "Officials/authorities:\n" +
        context.officials
          .map((o) =>
            o.status === "verified"
              ? `- [${o.level}] ${o.role}: ${o.name} (source: ${o.sourceLabel ?? "unknown"}${o.since ? `, since ${o.since}` : ""})`
              : `- [${o.level}] ${o.role}: Unable to verify`
          )
          .join("\n")
    );
  }
  return lines.length ? lines.join("\n") : "No location is currently selected in the app.";
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  // Durable: every call here spends real credit on OpenRouter, and an
  // in-memory counter that resets on each cold start does not bound a bill.
  // The added round trip is irrelevant next to the AI call that follows it.
  const ip = getClientIp(req);
  const rate = await checkDurableLimit("ai", ip, 60_000, 15);
  if (!rate.allowed) return err(res, 429, "Too many requests. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as CopilotRequestBody;
  const question = (body.question || "").trim();
  if (!question) return err(res, 400, "A question is required.");
  if (question.length > 500) return err(res, 400, "Question is too long (max 500 characters).");

  /**
   * The question was capped at 500 characters. `body.context` was not capped
   * at all, and every string in it goes into the system message.
   *
   * That made the 500-character limit decorative: a caller could post a few
   * megabytes of context with a one-word question and have all of it billed
   * to this project's OpenRouter key on every request. Measured on a copy of
   * this handler, a 2.9 MB body produced roughly 750,000 tokens of billed
   * input. There is no spend ceiling behind it.
   *
   * Two limits, because either alone leaves a hole: reject an oversized body
   * before doing any work, and hard-truncate what actually reaches the prompt.
   * 4,000 characters is far more than the real client ever sends.
   */
  if (JSON.stringify(body.context ?? {}).length > 20_000) {
    return err(res, 413, "Too much context sent with this question.");
  }
  const dataBlock = buildDataBlock(body.context).slice(0, 4_000);
  const kbHits = await searchKnowledgeBase(question, 3);
  const kbBlock = kbHits.length ? kbHits.map((h) => `### ${h.title}\n${h.content}`).join("\n\n") : "No knowledge base articles matched this question.";

  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are the maNOWj GeoIntel Copilot, a location-intelligence assistant embedded in a GIS app, talking with a real person in a chat bubble — not writing a document. " +
        "Reply the way a helpful person would text back: plain flowing sentences, no markdown at all — never **bold**, never *, -, or numbered list syntax, never ### headers. " +
        "If you want to list a few things, say them in a sentence ('the area has 7 petrol stations, 5 parks, and 4 hotels nearby') instead of a bulleted list. " +
        "Never show your reasoning, planning, or thinking process, and never narrate what you're about to do ('Let me analyze this', 'Step 1:', 'Based on the data provided I will...') — go straight to the answer, as if you already worked it out.\n\n" +
        "Match the person's language and style. If they write in Telugu, Hindi, Tamil, Kannada, or a mixed/transliterated form (Tenglish, Hinglish, and so on), reply the same way — same language, same casual mixing if that's how they wrote it. Otherwise reply in plain English. " +
        "If the message is just casual conversation — a greeting, 'hi', 'namaste', 'good morning', thanks, goodbye, small talk — reply warmly and briefly like any normal assistant would, in a sentence or two. Only pull in the location data below when the question actually calls for it.\n\n" +
        "For real questions about this location: answer ONLY using the CURRENT LOCATION DATA and KNOWLEDGE BASE sections below. " +
        "Never invent addresses, coordinates, prices, ratings, business names, or any fact not present in this data. " +
        "If the data doesn't cover the question, say so plainly and suggest what the user could check in the app instead. " +
        "Keep answers concise (3-6 sentences) and reference specific numbers from the data where relevant, written into the sentence naturally rather than as a list.\n\n" +
        "If asked who built, developed, or created maNOWj GeoIntel (or who your developer is), answer that it was built by Manoj Kumar Gudla. " +
        "If asked personal questions about Manoj Kumar Gudla unrelated to this app (his relationships, friends, or private life), " +
        "politely decline — say that's private and not something you have information to share — rather than guessing or inventing an answer.\n\n" +
        "If asked about a government official, president, prime minister, governor, chief minister, mayor, or any other authority figure for this location: " +
        "answer ONLY from the 'Officials/authorities' lines in the data below, if present. NEVER state a person's name for a government role from your own training data or memory, " +
        "even if you believe you know it and even if directly asked to guess — officeholders change and an unverified name could be wrong or out of date. " +
        "If the officials data doesn't include the role asked about, or shows 'Unable to verify', say plainly that it can't be verified right now and point the user to the Official / Authority Intelligence panel in the app.\n\n" +
        `CURRENT LOCATION DATA:\n${dataBlock}\n\nKNOWLEDGE BASE:\n${kbBlock}`,
    },
    { role: "user", content: question },
  ];

  const result = await getAiCompletion(messages, { maxTokens: 500 });
  if (!result.ok) return err(res, 502, result.error, "AI_UNAVAILABLE");

  ok(res, { answer: result.content, sources: kbHits.map((h) => h.title), model: result.model });
};

export default withMaintenanceGuard(handler);
