import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { checkDurableLimit } from "../../_lib/rateLimit.js";
import { getAiCompletion, type AiMessage } from "../../_lib/ai.js";
import { fenceRules, makeFence } from "../../_lib/untrusted.js";
import { GROUNDING_RULES } from "../../_lib/aiGrounding.js";
import { parseAnchor } from "../../_lib/evidence/anchor.js";
import { gatherTools } from "../../_lib/evidence/gather.js";
import { planRequest } from "../../_lib/evidence/planner.js";
import { INSUFFICIENT, checkAnswer, confidenceFor, evidenceTable, sourcesOf } from "../../_lib/evidence/grounding.js";
import type { AgentKind, AgentStep, TeamResult, TeamSection } from "../../../src/types/ai.js";

/**
 * Several agents on one request: "evaluate this place for a family home and
 * plan a route to the nearest hospital".
 *
 * 1. Understanding the request: word rules pick the agents and sources
 *    (planner.ts). No model call.
 * 2. Retrieving evidence: every source those agents use, in parallel, once
 *    each (a source two agents share is asked once).
 * 3. Calculating: the nearest place of the asked kind and the route to it.
 * 4. Verifying: each agent's confidence from which of its sources answered.
 * 5. Writing: ONE model call for the whole report, a section per agent,
 *    because the free model quota is per request, not per agent.
 * 6. Checking: each section's numbers against the evidence.
 *
 * Every step in the returned timeline is one of these, with its real time.
 */

const TAGS: Record<AgentKind, string> = {
  search: "SEARCH",
  gis: "GIS",
  property: "PROPERTY",
  navigation: "NAVIGATION",
  travel: "TRAVEL",
  makeMyTrip: "TRIP",
};

const FOCUS: Record<AgentKind, string> = {
  search: "how well the search matched the selected place",
  gis: "what is mapped around the place and where the gaps are",
  property: "the property classification, its confidence and what it rests on (never value, ownership, zoning or legal status)",
  navigation: "the route: distance and time from the provider, and where it goes (never traffic or closures)",
  travel: "the weather and what a visitor would find nearby (never prices, availability or opening hours)",
  makeMyTrip: "a short, ordered plan using only named nearby places (never prices, tickets or bookings)",
};

/** Splits "GIS: ... PROPERTY: ..." into sections by agent. Text before the first tag is dropped. */
export function splitSections(text: string, agents: AgentKind[]): Map<AgentKind, string> {
  const byTag = new Map(agents.map((a) => [TAGS[a], a] as const));
  const pattern = new RegExp(`(?:^|\\n)\\s*\\**(${agents.map((a) => TAGS[a]).join("|")})\\**\\s*:`, "g");
  const marks = [...text.matchAll(pattern)].map((m) => ({ agent: byTag.get(m[1]!)!, start: m.index! + m[0].length, at: m.index! }));
  const out = new Map<AgentKind, string>();
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1]!.at : text.length;
    const body = text.slice(mark.start, end).trim();
    if (body && !out.has(mark.agent)) out.set(mark.agent, body);
  });
  return out;
}

const REQUEST_BUDGET_MS = 37_000;

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");

  // The same "ai" budget as the Copilot and the agents.
  const rate = await checkDurableLimit("ai", getClientIp(req), 60_000, 15);
  if (!rate.allowed) return err(res, 429, "Too many requests. Please slow down.", "RATE_LIMITED");

  const body = (req.body ?? {}) as { request?: unknown; anchor?: unknown };
  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (!request) return err(res, 400, "Say what you want the agents to do.");
  if (request.length > 500) return err(res, 400, "That request is too long (500 characters at most).");
  if (JSON.stringify(body).length > 20_000) return err(res, 413, "Too much data sent with this request.");
  const anchor = parseAnchor(body.anchor);
  if (!anchor) return err(res, 400, "Pick a place on the map first: the agents work on the selected place.", "ANCHOR_REQUIRED");

  const started = Date.now();
  const plan = planRequest(request, anchor);
  const steps: AgentStep[] = [{ step: `Understanding the request: ${plan.agents.length} agent${plan.agents.length === 1 ? "" : "s"} chosen`, status: "ok", ms: Date.now() - started }];

  const gathered = await gatherTools(plan.tools, { ...anchor, radiusMeters: plan.radiusMeters ?? anchor.radiusMeters }, req, { nearest: plan.nearest });
  steps.push(...gathered.steps);

  const confidence = new Map(plan.agents.map((a) => [a, confidenceFor(a, gathered.outcomes)] as const));
  const answerable = plan.agents.filter((a) => confidence.get(a)!.level !== "insufficient");
  steps.push({
    step: `Verifying the evidence: ${answerable.length} of ${plan.agents.length} agents have enough to answer`,
    status: answerable.length === plan.agents.length ? "ok" : answerable.length ? "partial" : "failed",
    ms: 0,
  });

  const fixedSection = (agent: AgentKind): TeamSection => ({
    agent,
    summary:
      agent === "navigation" && !anchor.route && !plan.nearest
        ? "No route is planned yet. Choose a start and an end in Directions, or ask for a route to the nearest place of a kind."
        : `${INSUFFICIENT} ${confidence.get(agent)!.reason}`.trim(),
    findings: [],
    confidence: confidence.get(agent)!,
  });

  const base = {
    request,
    understood: plan.understood,
    agents: plan.agents,
    evidence: gathered.items,
    route: gathered.routeTarget,
    sources: sourcesOf(gathered.items),
  };

  if (answerable.length === 0) {
    const result: TeamResult = { ...base, sections: plan.agents.map(fixedSection), steps, model: "none: not enough evidence to ask a model", generatedAt: new Date().toISOString(), removedSentences: 0 };
    return ok(res, { result });
  }

  const fence = makeFence("EVIDENCE");
  const messages: AiMessage[] = [
    {
      role: "system",
      content:
        "You are the maNOWj GeoIntel intelligence team: several specialist agents answering ONE request about the selected place, together. " +
        `Write one section per agent below, in this order, each starting on a new line with its tag and a colon: ${answerable.map((a) => `${TAGS[a]}: (${FOCUS[a]})`).join("; ")}. ` +
        "Each section is 2 or 3 plain sentences, no markdown, no lists, no em dashes. Answer the request; do not narrate your reasoning. " +
        "Use ONLY the EVIDENCE table. After every sentence that states a fact, cite the evidence ids in square brackets, like [E2] or [E2, E5]. " +
        "Copy numbers exactly as the evidence writes them: never convert units, add up or estimate; any sentence with a number not in the evidence or the request is deleted. " +
        "Items marked 'unavailable' were not obtained: say so where it matters and never fill them in. Mark your own reading of the facts as such ('this suggests'). " +
        `If the evidence cannot support a section, write exactly: ${INSUFFICIENT} ` +
        `${GROUNDING_RULES}\n\n` +
        `${fenceRules(fence)}\n\nEVIDENCE (id | what | value | kind | source | as of | note):\n${fence.wrap(evidenceTable(gathered.items))}`,
    },
    { role: "user", content: `Request: ${request}` },
  ];

  const aiStarted = Date.now();
  const completion = await getAiCompletion(messages, {
    maxTokens: 2000,
    temperature: 0.2,
    deadlineMs: Math.max(12_000, Math.min(30_000, REQUEST_BUDGET_MS - (aiStarted - started))),
  });
  steps.push({ step: "Writing the report (AI model, one request for all agents)", status: completion.ok ? "ok" : "failed", ms: Date.now() - aiStarted });
  if (!completion.ok) return err(res, 502, completion.error, "AI_UNAVAILABLE");

  const texts = splitSections(completion.content, answerable);
  let removed = 0;
  const sections = plan.agents.map((agent): TeamSection => {
    const text = texts.get(agent);
    if (!text) return confidence.get(agent)!.level === "insufficient" ? fixedSection(agent) : { agent, summary: INSUFFICIENT, findings: [], confidence: confidence.get(agent)! };
    const checked = checkAnswer(text, gathered.items, [request]);
    removed += checked.removed;
    return { agent, summary: checked.findings.length ? checked.summary : INSUFFICIENT, findings: checked.findings, confidence: confidence.get(agent)! };
  });
  steps.push({ step: "Checking every number against the evidence", status: removed ? "partial" : "ok", ms: 0 });

  const result: TeamResult = { ...base, sections, steps, model: completion.model, generatedAt: new Date().toISOString(), removedSentences: removed };
  ok(res, { result });
};

export default withMaintenanceGuard(handler);
