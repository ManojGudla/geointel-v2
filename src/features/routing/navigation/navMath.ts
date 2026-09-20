/**
 * The maths behind live turn-by-turn navigation.
 *
 * Pure functions, no browser APIs, so the whole thing is testable without a
 * GPS: given a route and a position, work out where you are on it, which turn
 * is next, how far to it, how far to the end, and whether you've left the
 * route badly enough to need a new one.
 *
 * What this can and cannot do, stated plainly because it matters:
 *  - It CAN track your real position, follow you, advance the instruction as
 *    you pass each turn, and fetch a fresh route when you go off course.
 *  - It CANNOT account for live traffic. No free routing provider exposes it,
 *    so the arrival time is a free-flow estimate. The UI says so rather than
 *    printing a number that implies traffic was considered.
 */

export type Coord = [number, number]; // [lon, lat]

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceMeters(a: Coord, b: Coord): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, 0-360, where 0 is north. */
export function bearingDegrees(a: Coord, b: Coord): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Nearest point on the segment a→b to point p, in local metres.
 *
 * Projects to a flat metre grid around p before doing the algebra. Over a
 * single road segment - tens to hundreds of metres - the error from ignoring
 * the earth's curvature is far below GPS noise, and it avoids dragging in a
 * full geodesic library for the sake of a few metres.
 */
export function projectOntoSegment(p: Coord, a: Coord, b: Coord): { point: Coord; distanceMeters: number; t: number } {
  const latScale = 111_320;
  const lonScale = 111_320 * Math.cos(toRad(p[1]));

  const toXy = (c: Coord) => [(c[0] - p[0]) * lonScale, (c[1] - p[1]) * latScale] as const;
  const [ax, ay] = toXy(a);
  const [bx, by] = toXy(b);

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  // Degenerate segment (duplicate coordinates appear in real geometries).
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));

  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return {
    point: [p[0] + cx / lonScale, p[1] + cy / latScale],
    distanceMeters: Math.hypot(cx, cy),
    t,
  };
}

export interface SnapResult {
  /** The position snapped onto the route line. */
  point: Coord;
  /** How far the raw position was from the route, in metres. */
  offRouteMeters: number;
  /** Index of the geometry vertex the snapped point sits at or just after. */
  index: number;
  /** Distance travelled along the route to the snapped point, in metres. */
  travelledMeters: number;
}

/**
 * Finds where on the route you are.
 *
 * Searches from `fromIndex` onward rather than the whole line, because a
 * route that doubles back on itself (a U-turn, a loop, a road you drive both
 * ways) has two points equally close to you, and picking the wrong one throws
 * the instruction and the remaining distance far off. Progress only moves
 * forward - which is what a real navigator does.
 */
export function snapToRoute(position: Coord, geometry: Coord[], fromIndex = 0): SnapResult | null {
  if (geometry.length < 2) return null;

  // Cumulative lengths so travelled distance is computed once per call.
  let best: SnapResult | null = null;
  let travelled = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const a = geometry[i]!;
    const b = geometry[i + 1]!;
    const segmentLength = distanceMeters(a, b);

    if (i >= fromIndex) {
      const projected = projectOntoSegment(position, a, b);
      if (!best || projected.distanceMeters < best.offRouteMeters) {
        best = {
          point: projected.point,
          offRouteMeters: projected.distanceMeters,
          index: i,
          travelledMeters: travelled + segmentLength * projected.t,
        };
      }
    }
    travelled += segmentLength;
  }

  return best;
}

/** Total length of a route geometry, in metres. */
export function routeLengthMeters(geometry: Coord[]): number {
  let total = 0;
  for (let i = 0; i < geometry.length - 1; i++) total += distanceMeters(geometry[i]!, geometry[i + 1]!);
  return total;
}

/**
 * How far off the route counts as "you're not on it any more".
 *
 * Generous on purpose. Consumer GPS is routinely 10-30 m out and much worse
 * between tall buildings, so a tight threshold would announce a wrong turn
 * every time you stopped at a traffic light next to an office block. The
 * accuracy the device reports is added on top, so a fix that admits it's
 * vague is treated as vague rather than as evidence you left the road.
 */
export const OFF_ROUTE_BASE_METERS = 45;

export function isOffRoute(offRouteMeters: number, accuracyMeters: number | null): boolean {
  const tolerance = OFF_ROUTE_BASE_METERS + Math.min(ACCURACY_ALLOWANCE_CAP_METERS, accuracyMeters ?? 0);
  return offRouteMeters > tolerance;
}

export interface NavStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  location: Coord;
  type: string;
  modifier?: string;
}

export interface NavProgress {
  /** Index of the step whose instruction you should be following now. */
  currentStep: number;
  /** Metres to the next manoeuvre. */
  metresToNextTurn: number;
  /** Metres from here to the destination, along the route. */
  metresRemaining: number;
  /** Seconds remaining, scaled from the route's own free-flow estimate. */
  secondsRemaining: number;
  /** True once you're within ARRIVAL_METERS of the destination. */
  arrived: boolean;
}

/** Close enough to the destination to call it arrived. */
export const ARRIVAL_METERS = 30;
/** Past a turn by this much and the next instruction takes over. */
export const STEP_ADVANCE_METERS = 20;

/**
 * Off-route tolerance is widened by the GPS accuracy, and this used to cap the
 * widening at 60 m - which meant the allowance stopped growing exactly when
 * the fix got bad enough to need it. At the 124 m accuracy seen in the field
 * the tolerance was 105 m, narrower than the noise, so a parked phone
 * re-routed itself roughly every 30 seconds. Each reroute overwrote the user's
 * typed starting point and reset their chosen alternative route.
 */
export const ACCURACY_ALLOWANCE_CAP_METERS = 150;

/**
 * Which instruction to show, and the numbers beside it.
 *
 * The current step is chosen by proximity to each manoeuvre point in order,
 * never by a timer, so pausing at a junction or crawling in traffic doesn't
 * make the instruction skip ahead of where you actually are.
 */
export function navProgress(
  snapped: SnapResult,
  geometry: Coord[],
  steps: NavStep[],
  totalDurationSeconds: number
): NavProgress {
  const totalLength = routeLengthMeters(geometry);
  const metresRemaining = Math.max(0, totalLength - snapped.travelledMeters);

  /**
   * Where along the route each manoeuvre actually happens.
   *
   * This is the fix for a bug that made the whole banner wrong for an entire
   * trip. OSRM gives `step.distance` as the length you travel ALONG step i,
   * while `step.maneuver` sits at the START of step i. The old loop added
   * step i's length before testing, so the distance it computed was to
   * manoeuvre i+1 while the instruction it displayed was step i's - the turn
   * you had already made.
   *
   * On the road that read: "Now - Head east" at the exact moment you had to
   * turn left, and standing on the turn, "In 1.1 km - Turn left". The turn you
   * actually needed was demoted to the small grey "then …" line underneath. It
   * is precisely what the reported screenshot shows.
   *
   * So: manoeuvre i is at the sum of the lengths of steps BEFORE it, and the
   * instruction to show is the first manoeuvre still ahead.
   */
  const manoeuvreAt: number[] = [];
  let sum = 0;
  for (const step of steps) {
    manoeuvreAt.push(sum);
    sum += step.distanceMeters;
  }

  let currentStep = steps.length > 0 ? steps.length - 1 : 0;
  let metresToNextTurn = metresRemaining;

  for (let i = 0; i < steps.length; i++) {
    // Strictly ahead, minus a tolerance, so the instruction flips just AFTER
    // the junction rather than just before it. The old code subtracted the
    // same constant from the other side of the comparison, which flipped it
    // 20 m EARLY - the opposite of what its own comment promised.
    if (manoeuvreAt[i]! > snapped.travelledMeters - STEP_ADVANCE_METERS) {
      currentStep = i;
      metresToNextTurn = Math.max(0, manoeuvreAt[i]! - snapped.travelledMeters);
      break;
    }
  }

  // Scale the provider's free-flow duration by how much of the route is left.
  // Honest about what it is: an estimate from the same numbers the route came
  // with, not a traffic-aware prediction.
  const fraction = totalLength > 0 ? metresRemaining / totalLength : 0;

  return {
    currentStep,
    metresToNextTurn,
    metresRemaining,
    secondsRemaining: Math.round(totalDurationSeconds * fraction),
    arrived: metresRemaining <= ARRIVAL_METERS,
  };
}

/** "In 200 m", "In 1.2 km", "Now" - how a navigator announces a turn. */
export function announceDistance(metres: number): string {
  if (metres < 25) return "Now";
  if (metres < 1000) return `In ${Math.round(metres / 10) * 10} m`;
  return `In ${(metres / 1000).toFixed(1)} km`;
}
