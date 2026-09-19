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

/*
  formatDistance and formatArea used to live here, and that was the problem:
  a second pair of formatters with the same names as the ones in
  src/features/map/geo.ts, neither taking a unit preference. Every caller
  that imported from here silently ignored the reader's Imperial setting.

  They now live in geo.ts, which is the module that already knew about
  units. This file keeps only what it is for: the turf maths.
*/
