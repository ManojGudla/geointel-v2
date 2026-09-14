import type { Location } from "@/types/location";

/**
 * What an agent answer is ABOUT.
 *
 * Agent results were held in the store with no record of which place they
 * described, and nothing ever cleared them. So: run the GIS agent on
 * Hyderabad, read the answer, then search Mumbai. The map moves, every panel
 * refreshes with Mumbai's data — and the agent card still shows a confident
 * paragraph about Hyderabad, presented as the current read of the location
 * you are now looking at.
 *
 * That is the exact failure this whole product is built against: not a
 * missing answer, but a plausible answer about the wrong place. It is worse
 * than a wrong number, because a paragraph carries no units to check.
 *
 * The fix is not to throw the answer away the moment you pan — you may still
 * want to read it. It is to say plainly what it is about.
 */
export interface AgentSubject {
  lat: number | null;
  lon: number | null;
  /** What to call it in a sentence. */
  label: string;
}

export const NO_SUBJECT: AgentSubject = { lat: null, lon: null, label: "" };

/**
 * How far the map has to move before an answer stops being about the place
 * on screen.
 *
 * The evidence radius these agents reason over starts at 500m, so a marker
 * nudged across a pavement has not changed the answer, and a warning that
 * fires on that is one people learn to ignore. 40m is comfortably inside
 * one building and comfortably outside pointer jitter.
 */
export const SAME_PLACE_METRES = 40;

export function agentSubject(location: Pick<Location, "name" | "lat" | "lon"> | null | undefined): AgentSubject {
  if (!location) return NO_SUBJECT;
  return { lat: location.lat, lon: location.lon, label: location.name };
}

/**
 * Metres between two points, equirectangular.
 *
 * The first version of this rounded both coordinates to 4 decimal places and
 * compared the strings. Its own test caught that: rounding to a grid still
 * splits at the grid lines, so two points 20cm apart landed either side of a
 * boundary and were called different places. No grid size fixes that — "are
 * these the same place" is a distance question, so it is asked as one.
 *
 * Deliberately not turf, which every other distance helper here uses
 * (src/features/map/geo.ts, src/features/analysis/spatialMath.ts): turf is a
 * large dependency and this file is imported by the always-mounted AI panel,
 * where the JS payload was cut from 1550 KB to 1287 KB by keeping exactly
 * this kind of weight out. Flat-earth is wrong by well under a metre over
 * the tens of metres this threshold cares about.
 */
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const metresPerDegree = 111_320;
  const dLat = (a.lat - b.lat) * metresPerDegree;
  const dLon = (a.lon - b.lon) * metresPerDegree * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

export function isSamePlace(a: AgentSubject, b: AgentSubject): boolean {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) {
    // "Nowhere" is only the same as "nowhere".
    return a.lat === null && a.lon === null && b.lat === null && b.lon === null;
  }
  return metresBetween({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) <= SAME_PLACE_METRES;
}

/**
 * The sentence to print above an answer that is no longer about what's on
 * screen — or null when it still is.
 *
 * Returns null for an answer with no recorded subject too. An answer we
 * can't place might be stale, but saying so would be crying wolf, and a
 * warning that fires when it shouldn't is one people learn to ignore.
 */
export function stalenessNotice(answered: AgentSubject | undefined, current: AgentSubject): string | null {
  if (!answered) return null;
  if (isSamePlace(answered, current)) return null;

  const was = answered.label || "a place that is no longer selected";
  if (current.lat === null) return `This answer is about ${was}. Nothing is selected now.`;
  if (answered.lat === null) return `This answer was written before ${current.label} was selected.`;
  return `This answer is about ${was}, not ${current.label}.`;
}
