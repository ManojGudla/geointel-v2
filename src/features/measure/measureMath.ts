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

/**
 * Whether the closed outline crosses itself.
 *
 * turf.area adds up signed pieces of the ring, so in a figure-of-eight the
 * two loops wind opposite ways and cancel: a shape that is plainly large on
 * screen can come back as a few square metres, or as nothing. It is an easy
 * shape to make by tapping points out of order on a phone. There is no
 * single right area for such an outline, so the caller should show none and
 * ask for the shape to be fixed, rather than print the wrong figure.
 *
 * A triangle cannot cross itself, so this needs four points. Points tapped
 * twice in the same spot are dropped first: a zero-length edge is not a
 * crossing.
 */
export function outlineCrossesItself(points: Array<[number, number]>): boolean {
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const distinct = points.filter((p, i) => i === 0 || !same(p, points[i - 1]!));
  // A last tap back on the first point already closes the shape.
  if (distinct.length > 1 && same(distinct[distinct.length - 1]!, distinct[0]!)) distinct.pop();
  if (distinct.length < 4) return false;
  const ring = [...distinct, distinct[0]!];
  return turf.kinks(turf.polygon([ring])).features.length > 0;
}

/*
  formatDistance and formatArea used to live here, and that was the problem:
  a second pair of formatters with the same names as the ones in
  src/features/map/geo.ts, neither taking a unit preference. Every caller
  that imported from here silently ignored the reader's Imperial setting.

  They now live in geo.ts, which is the module that already knew about
  units. This file keeps only what it is for: the turf maths.
*/
