export interface CopilotContext {
  locationName?: string;
  address?: string;
  property?: {
    classification?: string;
    confidence?: number;
    trust?: string;
    reasoning?: string;
  };
  gis?: {
    radiusMeters?: number;
    counts?: Record<string, number>;
    scores?: Record<string, number>;
  };
  weather?: {
    temperatureC?: number;
    condition?: string;
  };
  nearbyTopCategories?: Array<{ category: string; count: number }>;
  /** How far the nearby search actually looked (it widens where mapping is sparse). */
  nearbyRadiusMeters?: number;
  /** True when the nearby list hit the server's cap, so the counts are a sample. */
  nearbyCapped?: boolean;
  route?: {
    mode?: string;
    distanceMeters?: number;
    durationSeconds?: number;
  };
  /**
   * Official / Authority Intelligence - current officeholders tied to this
   * location's administrative levels, sourced live from Wikidata (see
   * api/officials.ts). Every entry is either "verified" (with a name and
   * source) or "unavailable" - the AI layer must treat this the same way
   * the panel does: never state a name that isn't in this list, and never
   * fill an "unavailable" entry from its own training-data memory.
   */
  officials?: Array<{
    level: string;
    role: string;
    name: string | null;
    status: "verified" | "unavailable";
    since?: string | null;
    sourceLabel?: string;
  }>;
}

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  isError?: boolean;
  /**
   * For an assistant answer: the model that actually wrote it, as the
   * provider reported it, and when. Absent on the user's own messages and on
   * error messages, which the app wrote itself.
   */
  model?: string;
  generatedAt?: string;
  /** The facts the server fetched for this answer (assistant answers about a place). */
  evidence?: EvidenceItem[];
  /** Sentences the number check removed from this answer. */
  removedSentences?: number;
}

export type AgentKind = "search" | "gis" | "property" | "navigation" | "travel" | "makeMyTrip";

export interface AgentDefinition {
  kind: AgentKind;
  label: string;
  icon: string;
  description: string;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  { kind: "search", label: "Search Intelligence", icon: "🔎", description: "Summarizes what was found for this search and how confident that match is." },
  { kind: "gis", label: "GIS Intelligence", icon: "🗺️", description: "Explains the GIS evidence pattern around this location." },
  { kind: "property", label: "Property Intelligence", icon: "🏢", description: "Gives a plain-language read of the property classification." },
  { kind: "navigation", label: "Navigation", icon: "🚗", description: "Assesses the current route's practicality." },
  { kind: "travel", label: "Travel Intelligence", icon: "✈️", description: "Weighs weather, nearby amenities, and access for a visitor to this spot." },
  { kind: "makeMyTrip", label: "Make My Trip", icon: "🧭", description: "Suggests a same-day plan around this location using real, already-loaded data." },
];

/**
 * What an agent is asked about. Only places and settings, never facts: the
 * server fetches every fact itself from the providers, so nothing the
 * browser says can become "verified" in an answer.
 */
export interface AgentAnchor {
  lat: number;
  lon: number;
  /** The evidence radius the visitor picked (the server clamps it). */
  radiusMeters?: number;
  /** The route the visitor planned: its two ends and the travel mode. */
  route?: { fromLat: number; fromLon: number; toLat: number; toLon: number; mode: "car" | "walk" | "bike" };
  /** What the visitor typed in search, for the Search agent. */
  query?: string;
}

/**
 * One fact an answer may rest on.
 *
 * - retrieved: a provider's own value (a count, a temperature, a route time)
 * - computed: worked out by this app from retrieved values, with the method
 *   in `note`
 * - unavailable: asked for and not obtained; `note` says why
 */
export interface EvidenceItem {
  id: string;
  label: string;
  value: string;
  kind: "retrieved" | "computed" | "unavailable";
  source: string;
  /** When the provider answered (ISO 8601), when known. */
  retrievedAt?: string;
  note?: string;
}

/** One sentence of an answer and the evidence it cites. Empty = interpretation. */
export interface AgentFinding {
  text: string;
  evidenceIds: string[];
}

/** How sure an answer can be, from which sources answered, not from the model. */
export interface AgentConfidence {
  level: "high" | "medium" | "low" | "insufficient";
  reason: string;
}

/** One real server step behind an answer, in order, with how long it took. */
export interface AgentStep {
  step: string;
  status: "ok" | "partial" | "failed";
  ms: number;
}

export interface AgentResult {
  kind: AgentKind;
  summary: string;
  sources: string[];
  generatedAt: string;
  model: string;
  /** Present on answers from the evidence-first agents (v3.5 and later). */
  findings?: AgentFinding[];
  evidence?: EvidenceItem[];
  confidence?: AgentConfidence;
  steps?: AgentStep[];
  /** Sentences removed because they stated a number the evidence does not hold. */
  removedSentences?: number;
}

/** One agent's part of a team answer (the orchestrator, /api/ai/ask). */
export interface TeamSection {
  agent: AgentKind;
  summary: string;
  findings: AgentFinding[];
  confidence: AgentConfidence;
}

/**
 * Several agents answering one request together. Every step is a real
 * server step with its time; every section says which agent wrote it.
 */
export interface TeamResult {
  request: string;
  /** What the planner understood the request to ask for. */
  understood: string;
  agents: AgentKind[];
  sections: TeamSection[];
  evidence: EvidenceItem[];
  steps: AgentStep[];
  /** For "route to the nearest X": where the route goes, to draw it on the map. */
  route?: { name: string; lat: number; lon: number; mode: "car" | "walk" | "bike" };
  sources: string[];
  model: string;
  generatedAt: string;
  removedSentences: number;
}
