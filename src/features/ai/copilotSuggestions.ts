import type { GISLayerId } from "@/types/gis";

/**
 * Suggested questions that depend on what the user is actually looking at.
 *
 * A fixed list of prompts is a decoration - it says the same thing whether
 * you have selected a place or not, whether the restaurant layer is on or
 * off. These are derived from the live state, so the Copilot appears to know
 * where you are because it does: the same context object it is given to
 * answer with is the one these are built from.
 *
 * Every suggestion here is answerable from data the app already has. Nothing
 * suggests a question the Copilot would have to invent an answer for.
 */
export interface CopilotContext {
  placeName: string | null;
  radiusMeters: number;
  activeLayers: GISLayerId[];
  hasAnalysis: boolean;
  analysisTitle: string | null;
  is3D: boolean;
}

export function copilotSuggestions(context: CopilotContext): string[] {
  const suggestions: string[] = [];

  if (!context.placeName) {
    return [
      "What can this app do?",
      "How do I analyse an area?",
      "What data sources does this use?",
      "How accurate is the location intelligence score?",
    ];
  }

  const place = context.placeName;

  // Anchored on what's on screen right now.
  suggestions.push(`What kind of area is ${place}?`);
  suggestions.push(`What's within ${context.radiusMeters >= 1000 ? `${context.radiusMeters / 1000} km` : `${context.radiusMeters} m`} of here?`);

  if (context.hasAnalysis && context.analysisTitle) {
    suggestions.push(`Explain the "${context.analysisTitle}" result`);
  }

  // Layer-aware: if the user has switched something on, they're interested
  // in it, and the obvious next question is about that thing.
  if (context.activeLayers.includes("restaurants")) suggestions.push("How much restaurant competition is there here?");
  if (context.activeLayers.includes("hospitals")) suggestions.push("How well served is this area by healthcare?");
  if (context.activeLayers.includes("schools")) suggestions.push("What schools are in this area?");
  if (context.activeLayers.includes("residential") || context.activeLayers.includes("buildings")) {
    suggestions.push("What property types dominate this area?");
  }
  if (context.is3D) suggestions.push("What does the building density here tell me?");

  suggestions.push(`Is ${place} a good place for a coffee shop?`);
  suggestions.push("How accessible is this area?");

  // Six is about as many as reads as a helpful shortlist rather than a menu.
  return [...new Set(suggestions)].slice(0, 6);
}

/** One line telling the user exactly what the Copilot is looking at, so its context is never a mystery. */
export function contextSummary(context: CopilotContext): string {
  // It only has data for the selected place, so it must not invite questions
  // about "any place": those were answered from the model's memory.
  if (!context.placeName) return "No place selected yet. Search for one or click the map, then ask about it.";
  const radius = context.radiusMeters >= 1000 ? `${context.radiusMeters / 1000} km` : `${context.radiusMeters} m`;
  const layers = context.activeLayers.length;
  return `Looking at ${context.placeName}, ${radius} around it, with ${layers} data layer${layers === 1 ? "" : "s"} on.`;
}
