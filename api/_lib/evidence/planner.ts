import type { AgentAnchor, AgentKind } from "../../../src/types/ai.js";
import { AGENT_TOOLS, snapRadius, type ToolName } from "./gather.js";

/**
 * Turns a request into the agents and sources that can answer it.
 *
 * Plain word rules, not a model: the plan must be cheap, the same every time
 * for the same words, and checkable in a test. It only decides WHICH agents
 * and sources run; every fact still comes from those sources. When nothing
 * matches, it falls back to a general look at the place and says so.
 */
export interface Plan {
  agents: AgentKind[];
  tools: ToolName[];
  /** A radius the request asked for ("within 2 km"), snapped to one the GIS route accepts. */
  radiusMeters?: number;
  /** "Route to the nearest hospital": the nearby category to route to. */
  nearest?: { category: string; label: string };
  /** One sentence, shown to the person, of what was understood. */
  understood: string;
}

const NEAREST: Array<{ pattern: RegExp; category: string; label: string }> = [
  { pattern: /hospital|clinic|doctor|emergency/, category: "hospitals", label: "hospital or clinic" },
  { pattern: /school/, category: "schools", label: "school" },
  { pattern: /pharmac|chemist|medical (shop|store)/, category: "pharmacies", label: "pharmacy" },
  { pattern: /atm|cash/, category: "atms", label: "ATM" },
  { pattern: /bank/, category: "banks", label: "bank" },
  { pattern: /petrol|fuel|gas station|bunk/, category: "petrol", label: "fuel station" },
  { pattern: /police/, category: "police", label: "police station" },
  { pattern: /park|garden/, category: "parks", label: "park" },
  { pattern: /cafe|coffee/, category: "cafes", label: "cafe" },
  { pattern: /restaurant|food|eat/, category: "restaurants", label: "restaurant" },
  { pattern: /hotel|stay|guest ?house/, category: "hotels", label: "hotel" },
  { pattern: /bus|metro|station|train|transit/, category: "publicTransport", label: "bus stop or station" },
];

const RULES: Array<{ agent: AgentKind; pattern: RegExp }> = [
  { agent: "search", pattern: /\b(find|search|where is|locate|which place|look up)\b/ },
  { agent: "gis", pattern: /\b(analy[sz]e|analysis|evaluate|assess|nearby|around|within|facilit\w*|amenit\w*|infrastructure|population|density|neighbou?rhood|surroundings?|what is (near|around))\b/ },
  { agent: "property", pattern: /\b(property|properties|home|house|flat|apartment|residential|commercial|office|suitab\w*|live|living|family|land use)\b/ },
  { agent: "navigation", pattern: /\b(route|routes|directions?|drive|driving|walk|walking|cycle|cycling|how far|how long|get to|travel time|nearest|closest)\b/ },
  { agent: "travel", pattern: /\b(weather|temperature|rain|forecast|visit|visitor|tourist|attractions?|sightseeing|travel)\b/ },
  { agent: "makeMyTrip", pattern: /\b(itinerary|day trip|day plan|plan (a|my|the) (day|trip|visit|outing)|schedule|make my trip|things to do|spend (a|the) day)\b/ },
];

const ORDER: AgentKind[] = ["search", "gis", "property", "navigation", "travel", "makeMyTrip"];

const AGENT_WORDS: Record<AgentKind, string> = {
  search: "check the search match",
  gis: "analyse what is mapped around the place",
  property: "assess the property",
  navigation: "work out the route",
  travel: "check conditions for a visit",
  makeMyTrip: "sketch a plan for the day",
};

function radiusFrom(text: string): number | undefined {
  const m = text.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*(km|kms|kilomet\w*|m|metres|meters)\b/);
  if (!m) return undefined;
  const value = Number(m[1]);
  const metres = /^k/.test(m[2]!) ? value * 1000 : value;
  return Number.isFinite(metres) && metres > 0 ? snapRadius(metres) : undefined;
}

export function planRequest(request: string, anchor: AgentAnchor): Plan {
  const text = request.toLowerCase();
  const agents = new Set<AgentKind>();
  for (const rule of RULES) if (rule.pattern.test(text)) agents.add(rule.agent);

  // "plan a route" is a route, not a trip.
  if (agents.has("makeMyTrip") && agents.has("navigation") && !/\b(itinerary|trip|day)\b/.test(text)) agents.delete("makeMyTrip");
  // Property is judged from the same mapped evidence GIS reads, and says so.
  if (agents.has("property")) agents.add("gis");
  // The place was found by searching: Search explains how good that match is.
  if (anchor.query && agents.size > 0 && /\b(this|here|location|place)\b/.test(text)) agents.add("search");

  let nearest: Plan["nearest"];
  if (/\b(nearest|closest)\b/.test(text)) {
    const after = text.slice(text.search(/\b(nearest|closest)\b/));
    const hit = NEAREST.find((n) => n.pattern.test(after));
    if (hit) {
      nearest = { category: hit.category, label: hit.label };
      agents.add("navigation");
    }
  }

  let fallback = false;
  if (agents.size === 0) {
    agents.add("gis").add("property");
    fallback = true;
  }

  const ordered = ORDER.filter((a) => agents.has(a));
  const tools = new Set<ToolName>();
  for (const agent of ordered) for (const tool of AGENT_TOOLS[agent].tools) tools.add(tool);
  if (nearest) tools.add("nearby");

  const radiusMeters = radiusFrom(text);
  const steps = ordered.map((a) => (a === "navigation" && nearest ? `route to the nearest ${nearest.label}` : AGENT_WORDS[a]));
  const understood = fallback
    ? "No specific question was recognised, so this is a general look at the place: what is mapped around it and what kind of property it is."
    : `Asked to ${steps.join(", ").replace(/, ([^,]*)$/, " and $1")}${radiusMeters ? `, within ${radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`}` : ""}.`;

  return { agents: ordered, tools: ORDER_TOOLS(tools), radiusMeters, nearest, understood };
}

/** Tools in a fixed order, so the evidence is numbered the same way every time. */
function ORDER_TOOLS(tools: Set<ToolName>): ToolName[] {
  const order: ToolName[] = ["place", "search", "gis", "property", "population", "weather", "nearby", "route", "officials"];
  return order.filter((t) => tools.has(t));
}
