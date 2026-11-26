import type { OverpassElement } from "./overpass.js";
import { closeRing, distanceToRingM, pointInPolygon, relationPolygons, ringAreaM2, type LonLat, type PolygonRings } from "./geometry.js";
import type { PropertySite, SiteBuilding, SiteFeature } from "../../src/types/gis.js";

/**
 * What is mapped at ONE exact point: the building whose footprint contains
 * it, the businesses mapped inside that building, and the areas the point
 * lies in. analyzeProperty reads this before anything about the surroundings.
 *
 * Why this exists. Reported (25 November 2026), clicking Wave Rock Tower 2.3,
 * an office tower in Hyderabad, gave RESIDENTIAL, VERIFIED, 95%: "a
 * residential building mapped 28m from this point". Three things were wrong
 * at once:
 *  - the point was snapped to three decimal places (up to about 55 m away)
 *    before /api/gis saw it, to make the area counts cacheable;
 *  - "the thing you clicked" was the classified feature whose CENTRE was
 *    nearest, within 35 m. Wave Rock's centre was 35 m from the click (it is a
 *    big building), a small house's centre was closer, so the house won;
 *  - nothing ever checked which footprint the point was actually inside.
 *
 * So this takes the exact point, fetches the real building outlines around it
 * and tests containment. Ways and multipolygon relations both count; the
 * smallest footprint that contains the point is the building, and when no
 * footprint contains it, one whose outline is within NEXT_TO_M is accepted
 * and reported as "next to" (taps land on walls; imagery can be offset).
 */

/** How far around the point building outlines and businesses are fetched. */
export const SITE_SEARCH_RADIUS_M = 100;
/** A building whose outline is this close counts as the building at the point, said as "next to it". */
export const NEXT_TO_M = 10;

/** Tags that say what a place is: a business or facility. */
const BUSINESS_KEYS = "shop|office|amenity|craft|healthcare|tourism|leisure|historic";
/** Keys of areas that can say what land is used for. */
const AREA_KEYS = "landuse|amenity|leisure|tourism|office|shop|healthcare|aeroway|military|building|industrial|historic|railway";
/** Keys of a site drawn as its own outline: a school's grounds, a park, a hospital campus. */
const SITE_KEYS = "amenity|leisure|tourism|office|shop|healthcare|aeroway|military|industrial|historic";

/*
  How far land outlines are fetched, so the one the point is inside can be
  found by geometry. A land-use zone is usually a block or a neighbourhood:
  the residential zone around Abids that prompted this is 0.8 x 0.9 km, and
  its edge is within 500 m of anywhere inside it. Sites (a school, a park)
  are smaller. Larger zones are found by the area index when they are named.
*/
export const LANDUSE_SEARCH_RADIUS_M = 500;
export const SITE_AREA_SEARCH_RADIUS_M = 200;

export function buildPropertySiteQuery(lat: number, lon: number, radius = SITE_SEARCH_RADIUS_M): string {
  const at = `${lat},${lon}`;
  /*
    Buildings with their full geometry (`out geom`; relations need the body
    verbosity so their members come back), businesses as plain nodes, the
    land outlines around the point with their geometry, and the areas the
    server's area index says contain the point.

    Why both. The area index (`is_in`) only holds named land, and most land
    is not named: on 26 November 2026 two untagged buildings in Abids sat
    inside an unnamed landuse=residential outline and a tap near Malakpet sat
    inside an unnamed landuse=farmland one, and `is_in` returned neither, so
    both read "no land use". The outlines are now fetched and tested here,
    like the buildings. Named zones too large for that reach still come from
    the index.
  */
  return `
    [out:json][timeout:20];
    way(around:${radius},${at})[building];
    out geom;
    relation(around:${radius},${at})[building];
    out geom;
    node(around:${radius},${at})[~"^(${BUSINESS_KEYS})$"~"."];
    out tags;
    way(around:${LANDUSE_SEARCH_RADIUS_M},${at})[landuse][!building];
    out geom;
    way(around:${SITE_AREA_SEARCH_RADIUS_M},${at})[~"^(${SITE_KEYS})$"~"."][!building];
    out geom;
    is_in(${at})->.a;
    area.a[~"^(${AREA_KEYS})$"~"."];
    out tags;
  `;
}

const KEEP_BUILDING_TAG =
  /^(building|building:use|building:levels|roof:levels|building:levels:underground|height|building:height|min_height|name|name:en|addr:housenumber|addr:street|addr:place|addr:city|shop|office|amenity|tourism|healthcare|craft|leisure|historic|religion|operator|brand|start_date|public_transport|railway|construction)$/;
const KEEP_FEATURE_TAG =
  /^(name|name:en|shop|office|amenity|tourism|healthcare|craft|leisure|historic|religion|operator|brand|landuse|aeroway|military|building|industrial|railway|public_transport|level)$/;

function keep(tags: Record<string, string> | undefined, pattern: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags ?? {})) if (pattern.test(key)) out[key] = String(value).slice(0, 120);
  return out;
}

const osmUrl = (type: string, id: number) => `https://www.openstreetmap.org/${type}/${id}`;

/** An element's footprint as polygons with holes, or [] when it has no usable geometry. */
export function footprintOf(el: OverpassElement): PolygonRings[] {
  if (el.type === "way" && el.geometry) {
    const ring = closeRing(el.geometry.map((p): LonLat => [p.lon, p.lat]));
    return ring ? [{ outer: ring, holes: [] }] : [];
  }
  if (el.type === "relation" && el.members) return relationPolygons(el.members);
  return [];
}

const footprintArea = (polygons: PolygonRings[]) =>
  polygons.reduce((sum, p) => sum + ringAreaM2(p.outer) - p.holes.reduce((h, hole) => h + ringAreaM2(hole), 0), 0);

/** Overpass area ids encode what they came from: 2400000000 + way id, 3600000000 + relation id. */
function areaRef(id: number): { osmType: "way" | "relation"; id: number } | null {
  if (id >= 3_600_000_000) return { osmType: "relation", id: id - 3_600_000_000 };
  if (id >= 2_400_000_000) return { osmType: "way", id: id - 2_400_000_000 };
  return null;
}

/** Most specific first: a campus or a site says more about a building than a land-use zone does. */
function areaRank(tags: Record<string, string>): number {
  if (tags.building) return 0;
  if (tags.amenity || tags.healthcare || tags.office || tags.shop || tags.tourism || tags.historic) return 1;
  if (tags.aeroway || tags.military || tags.industrial || tags.railway || tags.leisure) return 2;
  if (tags.landuse) return 3;
  return 4;
}

/** A way drawn as a closed outline. An unclosed one is a line (or broken data), never an area. */
function isClosedWay(el: OverpassElement): boolean {
  const g = el.geometry;
  if (!g || g.length < 4) return false;
  const a = g[0]!;
  const b = g[g.length - 1]!;
  return a.lat === b.lat && a.lon === b.lon;
}

const LAND_KEY = new RegExp(`^(landuse|${SITE_KEYS})$`);
const sizeForSort = (areaM2: number | undefined) => areaM2 ?? Number.MAX_SAFE_INTEGER;
const isLandWay = (el: OverpassElement) =>
  el.type === "way" && !el.tags?.building && Object.keys(el.tags ?? {}).some((key) => LAND_KEY.test(key)) && isClosedWay(el);

export function extractSite(
  elements: OverpassElement[],
  point: { lat: number; lon: number },
  meta: { dataAsOf: string | null; fetchedAt: string }
): PropertySite {
  const pt: LonLat = [point.lon, point.lat];

  const candidates = elements
    .filter((el) => (el.type === "way" || el.type === "relation") && el.tags?.building)
    .map((el) => {
      const polygons = footprintOf(el);
      return { el, polygons, area: footprintArea(polygons) };
    })
    .filter((c) => c.polygons.length > 0);

  const containing = candidates.filter((c) => c.polygons.some((p) => pointInPolygon(pt, p))).sort((a, b) => a.area - b.area);
  let chosen = containing[0];
  let containsPoint = !!chosen;
  let distance = 0;
  if (!chosen) {
    const nearest = candidates
      .map((c) => ({ c, d: Math.min(...c.polygons.map((p) => distanceToRingM(pt, p.outer))) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d <= NEXT_TO_M) {
      chosen = nearest.c;
      containsPoint = false;
      distance = Math.round(nearest.d);
    }
  }

  const areaElements = elements
    .filter((el) => (el.type as string) === "area")
    .map((el) => ({ el, ref: areaRef(el.id) }))
    .filter((a): a is { el: OverpassElement; ref: { osmType: "way" | "relation"; id: number } } => a.ref !== null);

  let building: SiteBuilding | null = null;
  let inside: SiteFeature[] = [];
  if (chosen) {
    const type = chosen.el.type as "way" | "relation";
    building = {
      osmType: type,
      id: chosen.el.id,
      url: osmUrl(type, chosen.el.id),
      tags: keep(chosen.el.tags, KEEP_BUILDING_TAG),
      containsPoint,
      distanceMeters: distance,
      footprintM2: Math.round(chosen.area),
    };
    const polygons = chosen.polygons;
    inside = elements
      .filter((el) => el.type === "node" && el.lat !== undefined && el.lon !== undefined)
      .filter((el) => polygons.some((p) => pointInPolygon([el.lon!, el.lat!], p)))
      .map((el) => ({ osmType: "node" as const, id: el.id, url: osmUrl("node", el.id), tags: keep(el.tags, KEEP_FEATURE_TAG) }));
  } else {
    /*
      A building far larger than the search radius (a mall, a terminal) has
      no outline near the point, so the geometry test cannot see it. The area
      index can: if it says the point is inside a building, that building is
      the answer, without a footprint size.
    */
    const fromIndex = areaElements.find((a) => a.el.tags?.building);
    if (fromIndex) {
      building = {
        osmType: fromIndex.ref.osmType,
        id: fromIndex.ref.id,
        url: osmUrl(fromIndex.ref.osmType, fromIndex.ref.id),
        tags: keep(fromIndex.el.tags, KEEP_BUILDING_TAG),
        containsPoint: true,
        distanceMeters: 0,
        footprintM2: 0,
      };
    }
  }

  /*
    Land the point is inside, by geometry: unnamed outlines included, with
    their size, since a 0.8 km² zone says less about one building than a
    plot-sized one does. Then whatever the area index adds that the outlines
    did not already cover (named zones too big to fetch), size unknown.
  */
  const outlined = elements
    .filter(isLandWay)
    .map((el) => ({ el, polygons: footprintOf(el) }))
    .filter((c) => c.polygons.some((p) => pointInPolygon(pt, p)))
    .map((c) => ({
      ref: { osmType: "way" as const, id: c.el.id },
      tags: c.el.tags ?? {},
      areaM2: Math.round(footprintArea(c.polygons)),
    }));
  const seen = new Set(outlined.map((a) => `way/${a.ref.id}`));
  const indexed = areaElements
    .filter((a) => !a.el.tags?.building && !seen.has(`${a.ref.osmType}/${a.ref.id}`))
    .map((a) => ({ ref: a.ref, tags: a.el.tags ?? {}, areaM2: undefined as number | undefined }));

  const areas: SiteFeature[] = [...outlined, ...indexed]
    // Most specific kind first; within a kind, the smaller (closer-fitting) area first, unknown sizes last.
    .sort((a, b) => areaRank(a.tags) - areaRank(b.tags) || sizeForSort(a.areaM2) - sizeForSort(b.areaM2))
    .map((a) => ({
      osmType: a.ref.osmType,
      id: a.ref.id,
      url: osmUrl(a.ref.osmType, a.ref.id),
      tags: keep(a.tags, KEEP_FEATURE_TAG),
      ...(a.areaM2 !== undefined ? { areaM2: a.areaM2 } : {}),
    }));

  return {
    lat: point.lat,
    lon: point.lon,
    building,
    inside,
    areas,
    source: "OpenStreetMap / Overpass",
    dataAsOf: meta.dataAsOf,
    fetchedAt: meta.fetchedAt,
  };
}
