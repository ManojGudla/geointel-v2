import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";

import { getAiCompletion, type AiMessage } from "../../_lib/ai.js";
import { searchKnowledgeBase } from "../../_lib/kb.js";
import { fenceRules, makeFence, sanitizeField, sanitizeNumber } from "../../_lib/untrusted.js";
import type { CopilotContext } from "../../../src/types/ai.js";
import { GROUNDING_RULES, dataSourcesFor, nearbyLine, routeLine } from "../../_lib/aiGrounding.js";

interface CopilotRequestBody {
  question?: string;
  context?: CopilotContext;
  /** Earlier turns of this conversation, oldest first. See recentTurns. */
  history?: Array<{ role?: unknown; content?: unknown }>;
}

/** How much of the conversation a follow-up can see. */
const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;

/**
 * The last few turns, cleaned, so "and schools?" means something.
 *
 * The Copilot used to send only the new question, so every follow-up arrived
 * with no memory of what it followed. History comes from the browser, so it
 * is treated like any other caller input: only user and assistant roles
 * (never "system"), plain strings, each capped, the whole thing capped. It
 * goes in as ordinary chat turns, after the system message and its fenced
 * data, so it cannot rewrite the rules; and GROUNDING_RULES tells the model
 * that nothing the user writes can.
 */
function recentTurns(history: CopilotRequestBody["history"]): AiMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (t): t is { role: "user" | "assistant"; content: string } =>
        (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string" && t.content.trim().length > 0
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: sanitizeField(t.content, MAX_TURN_CHARS) }));
}

/*
  Every value below arrives in an HTTP body the caller controls, and every one
  of them used to be pasted into the SYSTEM message unchanged. See
  api/_lib/untrusted.ts for why that is the one place untrusted text must never
  go, and what the fence around this block now does.

  sanitizeField also caps each value. The overall block is sliced to 4000
  characters afterwards, but a per-field cap matters on its own: without it a
  single enormous location name could push every other fact out of the block,
  which is a quieter way to manipulate the answer than injecting an order.
*/
function buildDataBlock(context?: CopilotContext): string {
  if (!context || (!context.locationName && !context.property && !context.gis)) {
    return "No location is currently selected in the app.";
  }
  const lines: string[] = [];
  const name = sanitizeField(context.locationName, 200);
  if (name) lines.push(`Location: ${name}`);
  const address = sanitizeField(context.address, 300);
  if (address) lines.push(`Address: ${address}`);
  if (context.property) {
    lines.push(
      `Property classification: ${sanitizeField(context.property.classification, 60) || "unknown"} ` +
        `(${context.property.trust === "unavailable" ? "no confidence: not enough mapped evidence to classify" : `confidence ${sanitizeNumber(context.property.confidence ?? 0)}%`}, trust: ${sanitizeField(context.property.trust, 30) || "unavailable"})`
    );
    const reasoning = sanitizeField(context.property.reasoning, 600);
    if (reasoning) lines.push(`Property reasoning: ${reasoning}`);
  }
  if (context.gis) {
    if (context.gis.radiusMeters) lines.push(`GIS evidence radius: ${sanitizeNumber(context.gis.radiusMeters)}m`);
    // JSON.stringify of a plain counts/scores object cannot carry a role
    // marker past the fence, but it can carry arbitrary keys, so it is capped.
    if (context.gis.counts) lines.push(`GIS counts: ${sanitizeField(JSON.stringify(context.gis.counts), 600)}`);
    if (context.gis.scores) lines.push(`GIS scores: ${sanitizeField(JSON.stringify(context.gis.scores), 600)}`);
  }
  if (context.weather)
    lines.push(`Weather: ${sanitizeNumber(context.weather.temperatureC)}\u00b0C, ${sanitizeField(context.weather.condition, 60) || "unknown"}`);
  const nearby = nearbyLine(context);
  if (nearby) lines.push(nearby);
  const route = routeLine(context);
  if (route) lines.push(route);
  if (context.officials?.length) {
    /*
      The highest-stakes field in the whole block.

      The system prompt tells the model these are the only source of truth for
      an official's name, so a forged entry here would be laundered into an
      authoritative-sounding claim about a real public office. Fencing and
      sanitising both apply, and the list is capped at twenty.
    */
    lines.push(
      "Officials/authorities:\n" +
        context.officials
          .slice(0, 20)
          .map((o) =>
            o.status === "verified"
              ? `- [${sanitizeField(o.level, 40)}] ${sanitizeField(o.role, 80)}: ${sanitizeField(o.name, 120)} (source: ${sanitizeField(o.sourceLabel, 80) || "unknown"}${o.since ? `, since ${sanitizeField(o.since, 20)}` : ""})`
              : `- [${sanitizeField(o.level, 40)}] ${sanitizeField(o.role, 80)}: Unable to verify`
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
  // Same reasoning for the conversation: recentTurns trims what reaches the
  // prompt, and this refuses a body that was never a real conversation.
  if (JSON.stringify(body.history ?? []).length > 10_000) {
    return err(res, 413, "Too much conversation history sent with this question.");
  }
  const dataBlock = buildDataBlock(body.context).slice(0, 4_000);
  /*
    A fresh, unguessable fence per request.

    The block above is assembled from fields the caller controls. Sanitising
    removes the obvious tricks; this is what stops the text escaping its
    container and being read as a new set of rules. See api/_lib/untrusted.ts.
  */
  const fence = makeFence("DATA");
  const kbHits = await searchKnowledgeBase(question, 3);
  const kbBlock = kbHits.length ? kbHits.map((h) => `### ${h.title}\n${h.content}`).join("\n\n") : "No knowledge base articles matched this question.";

  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are the maNOWj GeoIntel Copilot, a location-intelligence assistant embedded in a GIS app, talking with a real person in a chat bubble, not writing a document. " +
        "Reply the way a helpful person would text back: plain flowing sentences, no markdown at all, never **bold**, never *, -, or numbered list syntax, never ### headers. Never use an em dash. Use a comma, a colon, a full stop, or brackets instead. " +
        "If you want to list a few things, say them in a sentence ('the area has 7 petrol stations, 5 parks, and 4 hotels nearby') instead of a bulleted list. " +
        "Never show your reasoning, planning, or thinking process, and never narrate what you're about to do ('Let me analyze this', 'Step 1:', 'Based on the data provided I will...'), go straight to the answer, as if you already worked it out.\n\n" +
        "Match the person's language and style. If they write in Telugu, Hindi, Tamil, Kannada, or a mixed/transliterated form (Tenglish, Hinglish, and so on), reply the same way, same language, same casual mixing if that's how they wrote it. Otherwise reply in plain English. " +
        "If the message is just casual conversation, a greeting, 'hi', 'namaste', 'good morning', thanks, goodbye, small talk, reply warmly and briefly like any normal assistant would, in a sentence or two, without stating facts about any place. Only pull in the location data below when the question actually calls for it.\n\n" +
        "For real questions about this location: answer ONLY using the CURRENT LOCATION DATA and KNOWLEDGE BASE sections below. " +
        "Never invent addresses, coordinates, prices, ratings, business names, or any fact not present in this data. " +
        "If the data doesn't cover the question, say so plainly and suggest what the user could check in the app instead. " +
        "Keep answers concise (3-6 sentences) and reference specific numbers from the data where relevant, written into the sentence naturally rather than as a list.\n\n" +
        `${GROUNDING_RULES}\n\n` +
       "If asked who built, developed, or created maNOWj GeoIntel (or who your developer is), answer that it was built by Manoj Kumar Gudla. " +

"If asked when Manoj Kumar Gudla's birthday is, answer that his birthday is September 25. " +

"If asked who the co-founder of maNOWj is, answer that there is currently no co-founder. If the user is interested in joining the team, tell them they can use the 'Join My Team' option in the app. " +

"If asked who Manoj Kumar Gudla's best friends are, answer that currently he does not have any best friends and is feeling alone. Do not invent, guess, or provide names of friends. " +

"If asked about Manoj Kumar Gudla's future goals or ambitions, answer that one of his personal goals is to marry a financially successful woman, and his future dreams are to become a content creator and build a startup called maNOWj. " +

"If asked about any other personal information about Manoj Kumar Gudla, including his relationships, family, private life, or other personal matters, politely decline and say that personal information is private and not something you can share. Never guess or invent personal information. " +

"If asked about a government official, president, prime minister, governor, chief minister, mayor, or any other authority figure for this location: " +

"answer ONLY from the 'Officials/authorities' lines in the data below, if present. NEVER state a person's name for a government role from your own training data or memory, " +

"even if you believe you know it and even if directly asked to guess, officeholders change and an unverified name could be wrong or out of date. " +

"If the officials data doesn't include the role asked about, or shows 'Unable to verify', say plainly that it can't be verified right now and point the user to the Official / Authority Intelligence panel in the app.\n\n"+

        `${fenceRules(fence)}\n\nCURRENT LOCATION DATA:\n${fence.wrap(dataBlock)}\n\nKNOWLEDGE BASE:\n${kbBlock}`,
    },
    ...recentTurns(body.history),
    { role: "user", content: question },
  ];

  const result = await getAiCompletion(messages, { maxTokens: 500 });
  if (!result.ok) return err(res, 502, result.error, "AI_UNAVAILABLE");

  // `model` is the model that ACTUALLY answered (see api/_lib/ai.ts), with
  // the default `openrouter/free` router that is a different model run to
  // run, so it is the only honest thing to put under an answer.
  ok(res, {
    answer: result.content,
    sources: [...dataSourcesFor(body.context), ...kbHits.map((h) => `Help article: ${h.title}`)],
    model: result.model,
    generatedAt: new Date().toISOString(),
  });
};

export default withMaintenanceGuard(handler);
