import * as turf from "@turf/turf";

/** Total length of the path through `points`, in meters. 0 below 2 points. */
export function computeDistanceMeters(points: Array<[number, number]>): number {
  if (points.length < 2) return 0;
  return turf.length(turf.lineString(points), { units: "meters" });
}

/** Area of the polygon formed by `points` (auto-closed), in square meters. 0 below 3 points. */
export function computeAreaSquareMeters(points: Array<[number, number]>): number {
  if (points.length < 3) return 0;
  const ring = [...points, points[0]!];
  return turf.area(turf.polygon([ring]));
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function formatArea(squareMeters: number): string {
  if (squareMeters >= 1_000_000) return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
  if (squareMeters >= 10_000) return `${(squareMeters / 10_000).toFixed(2)} ha`;
  return `${Math.round(squareMeters)} m²`;
}
