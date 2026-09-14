import type { ContextPending } from "./useCopilotContext";
import type { AgentKind } from "@/types/ai";

/**
 * What each agent actually needs before it is worth asking.
 *
 * Seen on the live site: the GIS agent, run on Banjara Hills, answered "no
 * GIS evidence counts, POI categories, or built-environment scores available
 * to analyze" — beside a map reading "161 things mapped within 250 m". The
 * evidence was seconds away, from Overpass, while the weather had already
 * arrived from Open-Meteo. The agent was asked in the gap and reported
 * honestly on a context that was still half-empty, and that answer then sat
 * on the card for good.
 *
 * So the requirement is per-agent, not global. Making every card wait for
 * every source would let one slow or failing dependency — officials from
 * Wikidata, say — block an agent that never reads it.
 */
export type ContextSource = keyof ContextPending;

export const AGENT_NEEDS: Record<AgentKind, ContextSource[]> = {
  // Reads only the location and the search results, both already in hand by
  // the time a card can be clicked.
  search: [],
  gis: ["gis"],
  // The property classification is computed from the GIS evidence
  // (analyzeProperty in useCopilotContext), so no evidence means no
  // classification to explain.
  property: ["gis"],
  // "No route set" is a real and useful answer from this agent, and a
  // disabled query never reads as loading — so this only waits when a route
  // is genuinely being fetched.
  navigation: ["route"],
  travel: ["weather", "nearby"],
  makeMyTrip: ["weather", "nearby"],
};

const SOURCE_LABELS: Record<ContextSource, string> = {
  gis: "the map evidence",
  weather: "the weather",
  nearby: "nearby places",
  route: "the route",
  officials: "the officials data",
};

/** The sources this agent is still waiting on, in a stable order. */
export function waitingFor(kind: AgentKind, pending: ContextPending): ContextSource[] {
  return AGENT_NEEDS[kind].filter((source) => pending[source]);
}

/**
 * What to show instead of a Run button, or null when the agent has what it
 * needs. Names the thing being waited for: "Loading…" with no subject is
 * indistinguishable from a card that is simply broken.
 */
export function readinessNotice(kind: AgentKind, pending: ContextPending): string | null {
  const waiting = waitingFor(kind, pending);
  if (waiting.length === 0) return null;
  const names = waiting.map((source) => SOURCE_LABELS[source]);
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Loading ${joined}…`;
}
