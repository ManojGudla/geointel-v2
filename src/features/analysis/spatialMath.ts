import * as turf from "@turf/turf";

/**
 * Pure spatial functions behind the analysis tools. No network, no map, no
 * React — so the arithmetic that produces numbers people will quote in
 * meetings can be tested directly against known values.
 */

export interface Point {
  lat: number;
  lon: number;
}

/**
 * The minimum a thing needs for `within`/`nearest` to work on it: where it
 * is and how far away. Deliberately not requiring a name — the callers pass
 * differently-shaped records (API results carry `name`, analysis points
 * carry `label`) and neither function reads one, so demanding a particular
 * spelling would force pointless conversions at every call site.
 */
export interface Located extends Point {
  id: string;
  distanceMeters: number;
}

/** Great-circle distance in metres. */
export function distanceMeters(from: Point, to: Point): number {
  return turf.distance(turf.point([from.lon, from.lat]), turf.point([to.lon, to.lat]), { units: "meters" });
}

/** Initial bearing from `from` to `to`, normalised to 0–360° clockwise from north. */
export function bearingDegrees(from: Point, to: Point): number {
  const raw = turf.bearing(turf.point([from.lon, from.lat]), turf.point([to.lon, to.lat]));
  return (raw + 360) % 360;
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** "NNE", "SW" — the 16-point compass sector a bearing falls in. */
export function compassPoint(degrees: number): string {
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalised / 22.5) % 16]!;
}

/**
 * A circular buffer as a GeoJSON polygon, in the projection the map draws in.
 * turf's circle takes a step count; 64 keeps the edge visually smooth at
 * city zoom levels without producing a polygon so dense it slows rendering.
 */
export function bufferPolygon(centre: Point, radiusMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  return turf.circle([centre.lon, centre.lat], radiusMeters, { steps: 64, units: "meters" }) as GeoJSON.Feature<GeoJSON.Polygon>;
}

/** Everything strictly inside the radius, nearest first. */
export function within<T extends Located>(items: T[], radiusMeters: number): T[] {
  return items.filter((item) => item.distanceMeters <= radiusMeters).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** The single closest item, or null when there are none. */
export function nearest<T extends Located>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) => (item.distanceMeters < best.distanceMeters ? item : best));
}

/**
 * Maps a raw count onto 0–100 against a reference value that represents
 * "plenty of this".
 *
 * Deliberately saturating rather than linear-to-the-maximum-seen: with a
 * linear scale, the highest value in any given search becomes 100 by
 * definition, so a location with two hospitals nearby would score identically
 * to one with fifty as long as it was the best in view. Saturation means the
 * score says something about the place itself, not about its competition.
 */
export function saturatingScore(count: number, plenty: number): number {
  if (plenty <= 0) return 0;
  const score = 100 * (1 - Math.exp((-2.5 * count) / plenty));
  return Math.round(Math.min(100, Math.max(0, score)));
}

/** Same scale, inverted: used where MORE of something makes a site worse (competition). */
export function invertedScore(count: number, plenty: number): number {
  return 100 - saturatingScore(count, plenty);
}

export interface SuitabilityFactor {
  id: string;
  label: string;
  /** Relative importance. Weights are normalised, so they need not sum to 1. */
  weight: number;
  /** 0–100. */
  score: number;
  /** Exactly what this number was computed from — shown in the UI, never hidden. */
  basis: string;
}

/**
 * Weighted mean of the factor scores, 0–100.
 *
 * Weights are normalised rather than required to sum to 1, so the user can
 * drag one slider without every other one silently shifting underneath them.
 * A set of all-zero weights returns 0 rather than dividing by zero.
 */
export function weightedScore(factors: SuitabilityFactor[]): number {
  const totalWeight = factors.reduce((sum, f) => sum + Math.max(0, f.weight), 0);
  if (totalWeight <= 0) return 0;
  const weighted = factors.reduce((sum, f) => sum + f.score * Math.max(0, f.weight), 0);
  return Math.round(weighted / totalWeight);
}

/** Plain-language band for a score, so the number is never presented alone. */
export function scoreBand(score: number): "Strong" | "Moderate" | "Weak" | "Poor" {
  if (score >= 75) return "Strong";
  if (score >= 55) return "Moderate";
  if (score >= 35) return "Weak";
  return "Poor";
}
