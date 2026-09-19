import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";

export function circlePolygon(lat: number, lon: number, radiusMeters: number): Feature<Polygon> {
  return turf.circle([lon, lat], radiusMeters / 1000, { units: "kilometers", steps: 64 });
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return turf.distance([a.lon, a.lat], [b.lon, b.lat], { units: "kilometers" }) * 1000;
}

/**
 * The one distance formatter.
 *
 * There were two, both exported as `formatDistance`, and the other one took
 * no units at all: metres and kilometres to two decimal places, no imperial
 * branch. Three files imported this version and four imported that one, and
 * nothing at a call site told you which you had got. The result was that a
 * reader who chose Imperial in Settings got miles in Directions and metres
 * in the measurement tool, analysis results and the command bar, which is
 * the half of the product where a unit preference matters most.
 *
 * That is a correctness bug wearing the costume of a tidiness one, and it
 * survived because both functions were individually correct.
 */
export function formatDistance(
  meters: number,
  units: "metric" | "imperial" = "metric",
  /**
   * An extra decimal place, for a figure the reader is measuring rather than
   * travelling.
   *
   * The two formatters this replaces disagreed on precision as well as on
   * units, and unifying them exposed that only one of those disagreements
   * was a bug. Somebody dragging a line across a plot wants 10m resolution;
   * a route that reported "12.40 km" would look broken. So the unit SYSTEM
   * is now global and consistent, and precision stays a property of the
   * question being asked.
   */
  precise = false
): string {
  const dp = precise ? 2 : 1;
  if (units === "imperial") {
    const feet = meters * 3.28084;
    return feet < 1000 ? `${Math.round(feet)} ft` : `${(feet / 5280).toFixed(dp)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(dp)} km`;
}

/**
 * Area, in the units the reader chose.
 *
 * Moved here from measureMath.ts alongside its distance counterpart, and
 * given the imperial branch it never had. Acres rather than square feet at
 * the middle of the range: nobody reads "218,000 sq ft" as a size, and
 * acres are what land is actually quoted in.
 */
export function formatArea(squareMeters: number, units: "metric" | "imperial" = "metric"): string {
  if (units === "imperial") {
    const squareFeet = squareMeters * 10.7639;
    if (squareFeet < 10_000) return `${Math.round(squareFeet)} sq ft`;
    const acres = squareMeters / 4046.86;
    if (acres < 640) return `${acres.toFixed(2)} acres`;
    return `${(squareMeters / 2_589_988).toFixed(2)} sq mi`;
  }
  if (squareMeters >= 1_000_000) return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
  if (squareMeters >= 10_000) return `${(squareMeters / 10_000).toFixed(2)} ha`;
  return `${Math.round(squareMeters)} m²`;
}
