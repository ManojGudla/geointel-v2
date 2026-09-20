import { MIN_ZOOM_FOR_3D_BUILDINGS } from "@/features/map/useBuildings3D";
import type { Basemap } from "@/stores/mapStore";
import type { MeasureMode } from "@/stores/measureStore";
import type { NavState } from "@/features/routing/navigation/navStore";

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
 * copilotSuggestions.ts) and it is good, but it lives inside the Ask panel -
 * behind the very door people were not opening. So this is deliberately not
 * more questions to ask an assistant. It is a single sentence that names
 * something true about THIS place or current view, attached to a button that does it.
 *
 * Three rules keep it from becoming nagging chrome:
 *
 * 1. It only ever says one thing. A list of tips is a tutorial, and nobody
 *    reads a tutorial on a map.
 * 2. Every sentence contains a real number or a real fact about the selected
 *    place or current view. "See what's nearby" is instruction; "1,240 things
 *    mapped within 250 m" is the app noticing, and only the second one earns
 *    a click.
 * 3. Priority is strict: place-discovery suggestions first (highest value),
 *    then mode/context suggestions (basemap, measurement, navigation).
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
  /** Current basemap: "standard" | "satellite" | "dark" | "terrain" */
  basemap?: Basemap;
  /** Measurement mode: "off" | "distance" | "area" */
  measureMode?: MeasureMode;
  /** Measurement points drawn, if any */
  measurePoints?: Array<[number, number]>;
  /** Navigation state: "idle" | "locating" | "navigating" | "rerouting" */
  navState?: NavState;
}

export type NextStepAction = "show3D" | "analyse" | "widenRadius" | "imagery" | "ask" | "measure" | "navigate";

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
  const { hasLocation, evidenceCount, radiusMeters, is3D, zoom, basemap, measureMode, measurePoints, navState } = input;

  /**
   * Priority 1: Place-discovery suggestions.
   * These are the highest value - someone landed on a place and should be
   * guided through what's actually here. All other suggestions defer to these.
   */

  // Nothing selected: the row already carries its own "pick a place" hint,
  // and two prompts saying the same thing is worse than one.
  if (!hasLocation) return null;

  // Still loading. Better to show nothing for a second than to flash a
  // suggestion and replace it, which reads as the app changing its mind.
  if (evidenceCount === null) return null;

  const area = formatRadius(radiusMeters);
  const count = evidenceCount.toLocaleString();

  // Genuinely empty. This is the moment people conclude the site is broken,
  // so it is the most valuable one to answer honestly - OSM coverage varies
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
      text: "You can score this exact spot for a use: a café, a clinic, a warehouse.",
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

  /**
   * Priority 2: Basemap suggestions.
   * Only suggest after the place-discovery flow is exhausted.
   * If viewing satellite or dark imagery at a location with features,
   * suggest 3D as an alternative view.
   */
  if ((basemap === "satellite" || basemap === "dark") && evidenceCount >= 150 && !is3D && zoom >= MIN_ZOOM_FOR_3D_BUILDINGS - 2) {
    return {
      text: `Viewing on ${basemap === "satellite" ? "aerial" : "low-light"} imagery. See the buildings in 3D for better understanding.`,
      label: `View in 3D`,
      action: "show3D",
    };
  }

  /**
   * Priority 3: Measurement suggestions.
   * If measurement is active and they've drawn points, suggest completion.
   */
  if (measureMode !== "off" && measurePoints && measurePoints.length > 0) {
    const pointCount = measurePoints.length;
    const suffix = measureMode === "distance"
      ? pointCount === 1 ? "Click again to complete the distance." : `${pointCount} points. Click to finalize.`
      : pointCount < 3 ? "Click to add more points for the area." : "Click to complete the area.";

    return {
      text: `Measuring ${measureMode}. ${suffix}`,
      label: "Finish measuring",
      action: "measure",
    };
  }

  /**
   * Priority 4: Navigation suggestions.
   * If actively navigating, suggest engaging turn-by-turn mode.
   */
  if (navState === "navigating" || navState === "rerouting") {
    return {
      text: "You're navigating. Enable turn-by-turn guidance to follow the route hands-free.",
      label: "Follow route",
      action: "navigate",
    };
  }

  // Fallback: ask the assistant about this place.
  return {
    text: `${count} things mapped within ${area}. Ask anything about this place in plain English.`,
    label: "Ask me",
    action: "ask",
  };
}
