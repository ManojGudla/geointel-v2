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

export interface AgentResult {
  kind: AgentKind;
  summary: string;
  sources: string[];
  generatedAt: string;
  model: string;
}
