import type { BuildingDto } from "@/services/buildings";

/**
 * Pure conversion from the /api/buildings DTOs to a GeoJSON FeatureCollection
 * of Polygons, carrying height + estimate-flag as feature properties for the
 * fill-extrusion layer's data-driven paint expressions. Kept pure/exported so
 * it's testable without a map instance.
 */
export function buildingsToGeoJSON(buildings: BuildingDto[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: buildings.map((b) => ({
      type: "Feature",
      id: b.id,
      // Courtyards are holes in the footprint, so they stay open in 3D.
      geometry: { type: "Polygon", coordinates: [b.polygon, ...(b.holes ?? [])] },
      properties: { heightMeters: b.heightMeters, heightIsEstimated: b.heightIsEstimated, name: b.name ?? null },
    })),
  };
}

/** Rounds a bbox to a coarse grid so small pans within the same tile don't refetch. */
export function roundBbox(bbox: { south: number; west: number; north: number; east: number }, precision = 3) {
  const r = (n: number) => Number(n.toFixed(precision));
  return { south: r(bbox.south), west: r(bbox.west), north: r(bbox.north), east: r(bbox.east) };
}

/**
 * The fixed grid that 3D buildings are fetched in.
 *
 * Buildings used to be fetched for the exact visible rectangle, which went
 * wrong three ways at once, all reported as "some buildings load and some
 * don't, and more appear when I move the map":
 *
 *  - The server returns at most 1,500 buildings per request, in whatever
 *    order Overpass lists them. A whole tilted view of a dense city has more
 *    than that, so an arbitrary scatter of buildings was simply dropped.
 *  - Every pan asked for a new rectangle and replaced the old result, so the
 *    set on screen changed with every move.
 *  - A tilted view looks far towards the horizon, so its rectangle easily
 *    passed the server's 3 km limit and returned nothing at all.
 *
 * Fixed cells about a kilometre across fix all three: each one is small
 * enough to stay under the cap, a cell fetched once stays on the map while
 * the camera moves around it, and every visitor asks for the same cells, so
 * the CDN answers repeat requests instead of Overpass.
 */
export const BUILDING_CELL_DEGREES = 0.01;
/** Cells either side of the one under the map centre: 1 means a 3x3 block. Used when the view is not known. */
export const BUILDING_CELL_REACH = 1;
/**
 * Cells either side when the view IS known, and the most fetched at once.
 *
 * A fixed 3x3 block (about 3.3 km) was too small for a wide screen at zoom
 * 16, and much too small for a tilted view looking towards the horizon: the
 * far buildings stayed flat. Reported (25 November 2026) as "some buildings
 * are showing 3D and some are not". Now every cell the view touches is
 * fetched, out to five either side, nearest first, up to 16 cells.
 */
export const BUILDING_VIEW_REACH = 5;
export const MAX_BUILDING_CELLS = 16;

export interface BuildingCell {
  key: string;
  south: number;
  west: number;
  north: number;
  east: number;
}

const fixed = (n: number) => Number(n.toFixed(4));

export function buildingCells(
  center: { lat: number; lon: number },
  view: { south: number; west: number; north: number; east: number } | null,
  size = BUILDING_CELL_DEGREES,
  reach = view ? BUILDING_VIEW_REACH : BUILDING_CELL_REACH
): BuildingCell[] {
  const row = Math.floor(center.lat / size);
  const col = Math.floor(center.lon / size);
  const cells: Array<BuildingCell & { order: number }> = [];
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const south = fixed((row + dr) * size);
      const west = fixed((col + dc) * size);
      const north = fixed((row + dr + 1) * size);
      const east = fixed((col + dc + 1) * size);
      // Skip cells wholly outside what is on screen. The centre cell is always
      // kept: it is the one the person is looking at.
      const visible =
        !view || (dr === 0 && dc === 0) || (north > view.south && south < view.north && east > view.west && west < view.east);
      if (!visible) continue;
      cells.push({ key: `${south},${west}`, south, west, north, east, order: dr * dr + dc * dc });
    }
  }
  // Nearest first, so the buildings under the centre arrive before the edges,
  // and the cap drops the farthest.
  return cells
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_BUILDING_CELLS)
    .map(({ order: _order, ...cell }) => cell);
}

/**
 * A point inside a building's footprint, for a click on its 3D shape.
 *
 * A click on the side or roof of an extruded building in a tilted view hits
 * the ground BEHIND it: the map reports where the line of sight meets the
 * ground. So a click on a tower selected whatever stood behind the tower,
 * and its property type was that building's. The click is kept when it is
 * inside the footprint (a view from straight above); otherwise the
 * footprint's centre, or for an L- or U-shaped building whose centre is
 * outside it, a point just inside one of its corners.
 */
export function pointInsideFootprint(ring: Array<[number, number]>, preferred: [number, number]): [number, number] {
  const inside = (pt: [number, number]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  if (ring.length < 4 || inside(preferred)) return preferred;
  const corners = ring.slice(0, -1);
  const centre: [number, number] = [corners.reduce((s, p) => s + p[0], 0) / corners.length, corners.reduce((s, p) => s + p[1], 0) / corners.length];
  if (inside(centre)) return centre;
  for (let i = 0; i < corners.length; i++) {
    const prev = corners[(i + corners.length - 1) % corners.length]!;
    const here = corners[i]!;
    const next = corners[(i + 1) % corners.length]!;
    // A tenth of the way from a corner towards its two neighbours' midpoint.
    const candidate: [number, number] = [here[0] + (((prev[0] + next[0]) / 2) - here[0]) * 0.1, here[1] + (((prev[1] + next[1]) / 2) - here[1]) * 0.1];
    if (inside(candidate)) return candidate;
  }
  return preferred;
}

/** Buildings from several cells as one list. A building on a cell edge comes back from both cells; it is kept once. */
export function mergeBuildingCells(lists: Array<BuildingDto[] | undefined>): BuildingDto[] {
  const seen = new Set<number>();
  const merged: BuildingDto[] = [];
  for (const list of lists) {
    for (const building of list ?? []) {
      if (seen.has(building.id)) continue;
      seen.add(building.id);
      merged.push(building);
    }
  }
  return merged;
}

/**
 * Building colour by height, shared by the map layer and its legend so the
 * two cannot disagree. Sand for one or two storeys, through amber and orange
 * to red and deep purple for towers: a tall building has to look different
 * from its neighbours at a glance, which the old ramp (five close blues) did
 * not manage. Heights that are estimated from the building type rather than
 * tagged in OpenStreetMap use paler versions of the same colours.
 */
export const BUILDING_HEIGHT_RAMP: Array<[metres: number, stated: string, estimated: string]> = [
  [0, "#efe3c2", "#ece6d8"],
  [8, "#f4c062", "#efd6a6"],
  [18, "#ee8a3c", "#ebb48b"],
  [35, "#d8463a", "#d99a93"],
  [70, "#a3286c", "#bf8aa8"],
  [150, "#4b2383", "#9f8cbd"],
];

export function buildingColorExpression(): unknown[] {
  const ramp = (column: 1 | 2) => ["interpolate", ["linear"], ["get", "heightMeters"], ...BUILDING_HEIGHT_RAMP.flatMap((stop) => [stop[0], stop[column]])];
  return ["case", ["get", "heightIsEstimated"], ramp(2), ramp(1)];
}
