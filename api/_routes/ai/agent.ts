import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";

import { getAiCompletion, type AiMessage } from "../../_lib/ai.js";
import { searchKnowledgeBase } from "../../_lib/kb.js";
import { fenceRules, makeFence, sanitizeField, sanitizeNumber } from "../../_lib/untrusted.js";
import type { AgentKind, CopilotContext } from "../../../src/types/ai.js";

const VALID_KINDS: AgentKind[] = ["search", "gis", "property", "navigation", "travel", "makeMyTrip"];

interface AgentRequestBody {
  kind?: AgentKind;
  context?: CopilotContext & { searchResults?: Array<{ name: string; displayName: string }> };
}

const AGENT_FOCUS: Record<AgentKind, string> = {
  search: "Focus on what was searched for and how strong the match is. If no location is selected, say the user should search or select a location first.",
  gis: "Focus purely on the GIS evidence counts and category scores, what kind of built environment this radius shows, and how strong or thin that evidence is. Don't restate the property classification headline verbatim; interpret the underlying numbers.",
  property: "Focus on explaining the property classification result in plain language: what it means, how confident it is, and what would make the confidence higher (more nearby evidence).",
  navigation: "Focus on the active route (if any): is this a practical trip by the chosen mode, given the distance and duration? If no route is set, say directions haven't been planned yet and suggest opening the Directions panel.",
  travel: "Focus on this location as a place to visit right now: combine the weather and nearby amenities data to say whether it's currently a comfortable, well-served place to spend time, citing the real numbers. If the user needs to actually book travel (flights, trains, buses, hotels), tell them to use the Travel tab, which opens real search pages on Google Flights, Skyscanner, IRCTC, ConfirmTkt, redBus, AbhiBus, Booking.com, and Google Hotels, never invent a price, schedule, or availability yourself.",
  makeMyTrip: "Suggest a short, realistic same-day plan anchored on this location, using ONLY the real nearby categories and weather data provided, do not name specific businesses unless they appear in the data, and do not invent opening hours, prices, or addresses. For booking a movie (BookMyShow, District), a stay (Booking.com, Google Hotels), or getting here (flights, trains, buses), point the user to the Travel tab's real provider links instead of guessing at logistics you don't have data for.",
};

function buildDataBlock(context: AgentRequestBody["context"] | undefined, kind: AgentKind): string {
  if (!context) return "No location is currently selected in the app.";
  const lines: string[] = [];
  /*
    Every value here comes off a caller-controlled HTTP body, and all of it is
    about to sit inside the system message. See api/_lib/untrusted.ts.
  */
  const name = sanitizeField(context.locationName, 200);
  if (name) lines.push(`Location: ${name}`);
  const address = sanitizeField(context.address, 300);
  if (address) lines.push(`Address: ${address}`);
  if (context.searchResults?.length) {
    lines.push(`Search results shown: ${context.searchResults.slice(0, 10).map((r) => sanitizeField(r.displayName, 160)).join(" | ")}`);
  }
  if (context.property) {
    lines.push(
      `Property classification: ${sanitizeField(context.property.classification, 60) || "unknown"} (confidence ${sanitizeNumber(context.property.confidence ?? 0)}%, trust: ${sanitizeField(context.property.trust, 30) || "unavailable"})`
    );
    const reasoning = sanitizeField(context.property.reasoning, 600);
    if (reasoning) lines.push(`Property reasoning: ${reasoning}`);
  }
  if (context.gis) {
    if (context.gis.radiusMeters) lines.push(`GIS evidence radius: ${sanitizeNumber(context.gis.radiusMeters)}m`);
    if (context.gis.counts) lines.push(`GIS counts: ${sanitizeField(JSON.stringify(context.gis.counts), 600)}`);
    if (context.gis.scores) lines.push(`GIS scores: ${sanitizeField(JSON.stringify(context.gis.scores), 600)}`);
  }
  if (context.weather)
    lines.push(`Weather: ${sanitizeNumber(context.weather.temperatureC)}°C, ${sanitizeField(context.weather.condition, 60) || "unknown"}`);
  if (context.nearbyTopCategories?.length) {
    lines.push(
      `Nearby: ${context.nearbyTopCategories.slice(0, 12).map((c) => `${sanitizeNumber(c.count)} ${sanitizeField(c.category, 40)}`).join(", ")}`
    );
  }
  // Only mention the route at all when it's actually relevant: the
  // navigation agent's whole focus is the active route, so it always needs
  // to know (including "none set", which is a valid answer it's supposed to
  // give). Every other agent (gis, property, search, ...) has nothing to do
  // with directions, previously this pushed "Active route: none set." into
  // EVERY agent's data block regardless of kind, and the model would latch
  // onto that stray unrelated line and start commenting on routing even
  // when asked about GIS/property data. Non-navigation agents now only see
  // a route line when one is genuinely set (real, relevant context), and
  // stay silent about it otherwise.
  if (context.route) {
    lines.push(`Active route: ${context.route.mode ?? "?"}, ${context.route.distanceMeters ?? "?"}m, ${context.route.durationSeconds ?? "?"}s`);
  } else if (kind === "navigation") {
    lines.push("Active route: none set.");
  }
  if (context.officials?.length) {
    /*
      The highest-stakes field in the block.

      The system prompt below tells the model this list is the ONLY source of
      truth for an official's name. That instruction is what made an unescaped
      version dangerous: a forged entry would not merely be repeated, it would
      be laundered into an authoritative claim about a real public office, with
      the guardrail itself vouching for it.
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

  // Same durable counter and the same "ai" scope as the Copilot route, so the
  // two cannot be alternated to get twice the budget.
  const ip = getClientIp(req);
  const rate = await checkDurableLimit("ai", ip, 60_000, 15);
  if (!rate.allowed) return err(res, 429, "Too many agent requests. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as AgentRequestBody;
  const kind = body.kind;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return err(res, 400, `'kind' must be one of: ${VALID_KINDS.join(", ")}.`);
  }

  /**
   * Same cap as the Copilot route, and it matters more here: an agent request
   * carries no question at all, so `body.context` IS the entire prompt. It was
   * accepted unvalidated and billed to this project's OpenRouter key.
   */
  if (JSON.stringify(body.context ?? {}).length > 20_000) {
    return err(res, 413, "Too much context sent with this request.");
  }
  const dataBlock = buildDataBlock(body.context, kind).slice(0, 4_000);
  /*
    Matters more here than on the Copilot route: an agent request carries no
    question at all, so this block IS the entire prompt. See untrusted.ts.
  */
  const fence = makeFence("DATA");
  const kbHits = await searchKnowledgeBase(AGENT_FOCUS[kind], 2);
  const kbBlock = kbHits.length ? kbHits.map((h) => `### ${h.title}\n${h.content}`).join("\n\n") : "";

  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        `You are the ${kind} intelligence agent inside maNOWj GeoIntel, writing a short result card for a real person to read, not a document or a report. ${AGENT_FOCUS[kind]} ` +
        "Write 3-5 plain, flowing sentences, never markdown of any kind (no **bold**, no *, -, or numbered list syntax, no ### headers). If you want to mention several numbers, weave them into a sentence ('7 petrol stations, 5 parks, and 4 hotels nearby') instead of a list. Never use an em dash. Use a comma, a colon, a full stop, or brackets instead. " +
        "Never show your reasoning, planning, or thinking process, and never narrate what you're about to do ('Let me analyze this', 'Step 1: Analyze user input', 'As the X agent I will...'), respond with ONLY the final answer, as if you already worked it out. " +
        "Match the person's language if the location data or question gives you a signal to (Telugu, Hindi, Tamil, Kannada, or a mixed/transliterated form like Tenglish or Hinglish are all fine); otherwise write in plain English. " +
        "Use ONLY the CURRENT LOCATION DATA below (and the knowledge base, if relevant), never invent facts, businesses, prices, or numbers that aren't there. " +
        "If the data is insufficient for this agent's focus, say so directly, in one plain sentence. " +
        "If asked who built or developed this app, say Manoj Kumar Gudla built it. If asked personal questions about him unrelated to this app, " +
        "politely decline rather than guessing. If the data includes an 'Officials/authorities' section, treat those as the ONLY source of truth for " +
        "government officials' names, never state such a name from your own memory, and say 'Unable to verify' if a role isn't listed there.\n\n" +
        `${fenceRules(fence)}\n\nCURRENT LOCATION DATA:\n${fence.wrap(dataBlock)}` +
        (kbBlock ? `\n\nRELEVANT KNOWLEDGE BASE:\n${kbBlock}` : ""),
    },
    { role: "user", content: `Run the ${kind} intelligence agent on the current data.` },
  ];

  const result = await getAiCompletion(messages, { maxTokens: 400 });
  if (!result.ok) return err(res, 502, result.error, "AI_UNAVAILABLE");

  ok(res, {
    result: {
      kind,
      summary: result.content,
      sources: kbHits.map((h) => h.title),
      generatedAt: new Date().toISOString(),
      model: result.model,
    },
  });
};

export default withMaintenanceGuard(handler);
