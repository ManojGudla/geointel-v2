import { MIN_ZOOM_FOR_3D_BUILDINGS } from "@/features/map/useBuildings3D";

/**
 * The one thing worth doing next, chosen from what is actually on screen.
 *
 * The problem this solves, reported twice: people land on the site, look at
 * a map, and leave without finding anything. The toolbar under the search
 * box already lists five things you can do, but every one of them is named
 * for WHAT IT IS rather than why you would press it, and a row of neutral
 * labels gives a first-time visitor no reason to press any particular one.
 *
 * There is already a suggestion engine in the app (features/ai/
 * copilotSuggestions.ts) and it is good, but it lives inside the Ask panel —
 * behind the very door people were not opening. So this is deliberately not
 * more questions to ask an assistant. It is a single sentence that names
 * something true about THIS place, attached to a button that does it.
 *
 * Two rules keep it from becoming nagging chrome:
 *
 * 1. It only ever says one thing. A list of tips is a tutorial, and nobody
 *    reads a tutorial on a map.
 * 2. Every sentence contains a real number or a real fact about the selected
 *    place. "See what's nearby" is instruction; "1,240 things mapped within
 *    250 m" is the app noticing, and only the second one earns a click.
 *
 * Pure and exported so the priority order is testable without a map, a
 * network call or a rendered component.
 */

export interface NextStepInput {
  hasLocation: boolean;
  /** Total mapped features Overpass returned, or null while it is still loading. */
  evidenceCount: number | null;
  radiusMeters: number;
  is3D: boolean;
  zoom: number;
}

export type NextStepAction = "show3D" | "analyse" | "widenRadius" | "imagery" | "ask";

export interface NextStep {
  /** The sentence. Contains a fact about this place, not a generic instruction. */
  text: string;
  /** What the button says. A verb, matching what happens. */
  label: string;
  action: NextStepAction;
}

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

export function nextStep(input: NextStepInput): NextStep | null {
  const { hasLocation, evidenceCount, radiusMeters, is3D, zoom } = input;

  // Nothing selected: the row already carries its own "pick a place" hint,
  // and two prompts saying the same thing is worse than one.
  if (!hasLocation) return null;

  // Still loading. Better to show nothing for a second than to flash a
  // suggestion and replace it, which reads as the app changing its mind.
  if (evidenceCount === null) return null;

  const area = formatRadius(radiusMeters);
  const count = evidenceCount.toLocaleString();

  // Genuinely empty. This is the moment people conclude the site is broken,
  // so it is the most valuable one to answer honestly — OSM coverage varies
  // enormously, and the app has something real to offer instead.
  if (evidenceCount === 0) {
    return {
      text: `Nothing is mapped within ${area} of here in OpenStreetMap. Coverage varies a lot by area.`,
      label: "See it from space",
      action: "imagery",
    };
  }

  // A dense place, flat, and close enough in that footprints would load.
  // This is the app's most striking feature and the one nobody finds.
  if (!is3D && evidenceCount >= 150 && zoom >= MIN_ZOOM_FOR_3D_BUILDINGS - 2) {
    return {
      text: `${count} things mapped within ${area}. Many of them are buildings with real heights.`,
      label: "Show them in 3D",
      action: "show3D",
    };
  }

  // Already looking at 3D, so they have seen what is here. The next question
  // a person actually has about a place is whether it is any good for
  // something, which is what the analysis tools answer.
  if (is3D) {
    return {
      text: "You can score this exact spot for a use — a café, a clinic, a warehouse.",
      label: "Score this spot",
      action: "analyse",
    };
  }

  // Something is here, but the default 250 m keeps a lot of it out of frame.
  if (radiusMeters <= 250) {
    return {
      text: `${count} things within ${area}. Widen the area to 1 km to see the neighbourhood.`,
      label: "Widen to 1 km",
      action: "widenRadius",
    };
  }

  return {
    text: `${count} things mapped within ${area}. Ask anything about this place in plain English.`,
    label: "Ask maNOWj",
    action: "ask",
  };
}
