/**
 * Small, dependency-free geometry for building footprints: is a point inside
 * a footprint, how far is it from one, how big is one, and how to turn a
 * multipolygon relation's member ways into closed rings.
 *
 * Coordinates are [lon, lat], the GeoJSON order. Distances and areas use a
 * flat-earth projection around the point, which is accurate to well under a
 * metre across the hundred metres or so these are used over, and keeps this
 * out of a geometry library in a serverless function.
 */

export type LonLat = [number, number];
export type Ring = LonLat[];
/** An outer ring and its holes (courtyards). */
export interface PolygonRings {
  outer: Ring;
  holes: Ring[];
}

const METRES_PER_DEGREE = 111_320;

function project(pt: LonLat, originLat: number): [number, number] {
  return [pt[0] * METRES_PER_DEGREE * Math.cos((originLat * Math.PI) / 180), pt[1] * METRES_PER_DEGREE];
}

/** Ray casting. A point exactly on an edge may land either side, which is fine at map precision. */
export function pointInRing(pt: LonLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(pt: LonLat, polygon: PolygonRings): boolean {
  return pointInRing(pt, polygon.outer) && !polygon.holes.some((hole) => pointInRing(pt, hole));
}

/** Area of a ring in square metres (holes not subtracted). */
export function ringAreaM2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lat = ring[0]![1];
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = project(ring[i]!, lat);
    const [bx, by] = project(ring[(i + 1) % ring.length]!, lat);
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

/** Shortest distance in metres from a point to a ring's outline. */
export function distanceToRingM(pt: LonLat, ring: Ring): number {
  const [px, py] = project(pt, pt[1]);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = project(ring[i]!, pt[1]);
    const [bx, by] = project(ring[i + 1]!, pt[1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/** Metres between two points. */
export function metresBetween(a: LonLat, b: LonLat): number {
  const [ax, ay] = project(a, (a[1] + b[1]) / 2);
  const [bx, by] = project(b, (a[1] + b[1]) / 2);
  return Math.hypot(ax - bx, ay - by);
}

const same = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];

/** Closes a ring that is not closed. Returns null for one too short to be an area. */
export function closeRing(points: LonLat[]): Ring | null {
  if (points.length < 3) return null;
  const ring = [...points];
  if (!same(ring[0]!, ring[ring.length - 1]!)) ring.push(ring[0]!);
  return ring.length >= 4 ? ring : null;
}

/**
 * Joins a multipolygon's member ways into closed rings.
 *
 * A large building's outline is often split into several ways that only
 * make a ring end to end, in any order and either direction. Ways that
 * never close are dropped rather than guessed at.
 */
export function assembleRings(ways: LonLat[][]): Ring[] {
  const open = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: Ring[] = [];
  while (open.length) {
    let current = open.shift()!;
    let grew = true;
    while (!same(current[0]!, current[current.length - 1]!) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const next = open[i]!;
        const end = current[current.length - 1]!;
        if (same(end, next[0]!)) current = [...current, ...next.slice(1)];
        else if (same(end, next[next.length - 1]!)) current = [...current, ...[...next].reverse().slice(1)];
        else if (same(current[0]!, next[next.length - 1]!)) current = [...next, ...current.slice(1)];
        else if (same(current[0]!, next[0]!)) current = [...[...next].reverse(), ...current.slice(1)];
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (current.length >= 4 && same(current[0]!, current[current.length - 1]!)) rings.push(current);
  }
  return rings;
}

/** A relation member as Overpass returns it with `out geom`. */
export interface GeomMember {
  type: string;
  role?: string;
  geometry?: Array<{ lat: number; lon: number }>;
}

/** The polygons of a multipolygon relation: outer rings, each with the inner rings that fall inside it. */
export function relationPolygons(members: GeomMember[]): PolygonRings[] {
  const toLonLat = (m: GeomMember): LonLat[] => (m.geometry ?? []).map((p) => [p.lon, p.lat]);
  const ways = members.filter((m) => m.type === "way" && (m.geometry?.length ?? 0) >= 2);
  const outers = assembleRings(ways.filter((m) => m.role !== "inner").map(toLonLat));
  const inners = assembleRings(ways.filter((m) => m.role === "inner").map(toLonLat));
  return outers.map((outer) => ({ outer, holes: inners.filter((hole) => pointInRing(hole[0]!, outer)) }));
}
