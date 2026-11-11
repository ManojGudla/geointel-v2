import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQuery, type OverpassElement } from "../_lib/overpass.js";

/**
 * What is on the ground here, and what is being built.
 *
 * Asked for as "site plans, road names, construction status". Two of those
 * three are real and one is not, and it is worth writing down which is which
 * so nobody wires this up expecting the third.
 *
 * REAL, and what this endpoint returns:
 *   - Road names. Every named way in OpenStreetMap, grouped by name so a road
 *     mapped as fourteen segments appears once.
 *   - Roads under construction (highway=construction) and roads someone has
 *     proposed but not started (proposed:highway).
 *   - Building sites (building=construction) and the wider construction areas
 *     around them (landuse=construction). Both are queried, because the wiki
 *     itself warns that many mappers tag the building and never draw the area.
 *   - Land whose development status is recorded: brownfield (was developed,
 *     now vacant or awaiting redevelopment) and greenfield (never developed,
 *     scheduled for it).
 *
 * NOT REAL, and deliberately absent:
 *   - Approved site plans, building permits, plot-level zoning. These are not
 *     in OpenStreetMap and are not in any free global dataset. They sit with
 *     municipal authorities, mostly as PDF sheets, and in India almost always
 *     behind a district/tehsil/village dropdown with no coordinate lookup at
 *     all. The app links to those authorities instead (see
 *     src/features/site/portals.ts) and says plainly that it is a handoff.
 *
 * Fabricating the second list would have been easy and would have been the
 * worst thing this project could do: a plot's legal status is something people
 * spend money on the strength of.
 */

/** Defaults chosen so a single query covers a walkable area without timing out. */
const DEFAULT_RADIUS = 600;
const MAX_RADIUS = 2000;
/*
  The wider search. When nothing is being built inside the radius somebody
  chose, the panel asks again for construction only, over 5 km, so it can say
  "nothing here, but the nearest site is 1.8 km that way" instead of leaving
  them with an empty list. It can afford the bigger circle because it skips the
  roads, which are the heavy half of the normal query.
*/
const MAX_WIDE_RADIUS = 5000;

/*
  OSM's built environment moves over weeks. Six hours matches nearby.ts and
  officials.ts, and matters more here than anywhere else in the app: this
  query is heavier than the POI ones (every named way in the radius, not a
  short tag allowlist), and the free Overpass mirrors are the least reliable
  dependency this project has.
*/
const cache = new TtlCache<SiteResult>(6 * 60 * 60 * 1000);
const limiter = new RateLimiter(60_000, 15);

interface RoadGroup {
  name: string;
  /** The OSM highway class, e.g. "residential", "primary". */
  kind: string;
  /** How many separate ways carry this name here. */
  segments: number;
  /** Set when the road carries a reference like "NH 44" or "SH 1". */
  ref?: string;
  surface?: string;
  lanes?: string;
}

interface SiteFeature {
  kind: "road-works" | "road-proposed" | "building-site" | "construction-area" | "brownfield" | "greenfield";
  name: string | null;
  /** What it is becoming, where OSM records it (construction=motorway etc). */
  becoming?: string;
  startDate?: string;
  endDate?: string;
  operator?: string;
  lat?: number;
  lon?: number;
  osm: string;
  /** When this record was last edited in OpenStreetMap. How fresh the claim is. */
  updatedAt?: string;
}

interface SiteResult {
  roads: RoadGroup[];
  features: SiteFeature[];
  /** Straight counts, so the panel can lead with a number before the lists. */
  counts: { roads: number; underConstruction: number; awaitingDevelopment: number };
  radiusMeters: number;
  /** When this answer was fetched from OpenStreetMap. Kept with a cached answer, so it never claims to be newer than it is. */
  fetchedAt: string;
}

/**
 * One request, but two separate result sets, and the separation is a bug fix
 * rather than tidiness.
 *
 * The first version put all seven clauses in one union and capped the output
 * at 400 elements. Overpass applies that cap to the union as a whole, ordered
 * by element id - not by the order the clauses are written. Named road
 * segments outnumber construction sites by a wide margin in any built-up area,
 * and a single street is routinely mapped as a dozen ways, so in a dense city
 * the road segments alone can exceed the cap. The construction and land-status
 * records would then be silently truncated away.
 *
 * That failure is invisible and it is the worst possible one for this feature:
 * the panel would confidently report "0 under construction" for a street with
 * three tower cranes on it, because the answer was cut off rather than empty.
 *
 * So development gets its own `out` with its own budget, and roads get theirs.
 * Still one round trip, which is what actually matters to the free mirrors.
 *
 * `out tags center` gives the tags plus a representative point without the
 * full geometry - this panel lists things, it does not draw them, and asking
 * for geometry would multiply the payload for nothing.
 */
const DEVELOPMENT_CLAUSES = (a: string) => `  way["highway"="construction"]${a};
  way["proposed:highway"]${a};
  way["building"="construction"]${a};
  relation["building"="construction"]${a};
  way["landuse"~"^(construction|brownfield|greenfield)$"]${a};
  relation["landuse"~"^(construction|brownfield|greenfield)$"]${a};`;

export function buildSiteQuery(lat: number, lon: number, radius: number): string {
  const a = `(around:${radius},${lat},${lon})`;
  // `out meta` on the development records only: it adds the last-edited time,
  // which is what tells a reader how current "under construction" is. The
  // roads stay on `out tags`; nobody needs to know when a street name was typed.
  return `[out:json][timeout:30];
(
${DEVELOPMENT_CLAUSES(a)}
);
out meta center 250;
way["highway"]["name"]${a};
out tags center 600;`;
}

/**
 * Construction and development records only, for the wider search. No roads.
 *
 * Written with plain tag equality rather than the regular expression the
 * normal query uses: over a circle this size Overpass answers equality
 * noticeably faster, and the first live run of the 5 km search took 8.4 s
 * against a 9 s limit. Relations are left out for the same reason; a site
 * mapped as a relation is rare, and the normal query still finds it close by.
 */
export function buildConstructionQuery(lat: number, lon: number, radius: number): string {
  const a = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:25];
(
  way["highway"="construction"]${a};
  way["building"="construction"]${a};
  way["landuse"="construction"]${a};
  way["landuse"="brownfield"]${a};
  way["landuse"="greenfield"]${a};
  way["proposed:highway"]${a};
);
out meta center 150;`;
}

const ROAD_RANK: Record<string, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
  living_street: 7,
  pedestrian: 8,
  road: 9,
};

const ROAD_LABEL: Record<string, string> = {
  motorway: "Motorway",
  trunk: "Trunk road",
  primary: "Primary road",
  secondary: "Secondary road",
  tertiary: "Tertiary road",
  unclassified: "Minor road",
  residential: "Residential street",
  living_street: "Living street",
  pedestrian: "Pedestrian street",
  road: "Road",
};

export function classify(el: OverpassElement): SiteFeature | null {
  const tags = (el.tags ?? {}) as Record<string, string>;
  const osm = `${el.type}/${el.id}`;
  const base = {
    name: tags.name ?? tags["construction:name"] ?? null,
    startDate: tags.start_date,
    endDate: tags.end_date,
    operator: tags.operator,
    lat: el.center?.lat ?? el.lat,
    lon: el.center?.lon ?? el.lon,
    osm,
    updatedAt: el.timestamp,
  };

  if (tags.highway === "construction") {
    // `construction=*` carries the class the road will be once it opens. It is
    // the difference between "a road is being built" and "a motorway is being
    // built", and it is the single most useful tag in this whole set.
    return { ...base, kind: "road-works", becoming: tags.construction ?? undefined };
  }
  if (tags["proposed:highway"]) {
    return { ...base, kind: "road-proposed", becoming: tags["proposed:highway"] };
  }
  if (tags.building === "construction") {
    return { ...base, kind: "building-site", becoming: tags["construction"] ?? undefined };
  }
  if (tags.landuse === "construction") return { ...base, kind: "construction-area" };
  if (tags.landuse === "brownfield") return { ...base, kind: "brownfield" };
  if (tags.landuse === "greenfield") return { ...base, kind: "greenfield" };
  return null;
}

/**
 * Groups named ways into roads.
 *
 * A single street is routinely mapped as a dozen ways - split at every
 * junction, every surface change, every bridge. Listing the raw ways would
 * show the same street name a dozen times and make a quiet lane look like a
 * network. Grouping by name plus class is what makes the list read like the
 * roads a person would actually name if you asked them.
 */
export function groupRoads(elements: OverpassElement[]): RoadGroup[] {
  const byKey = new Map<string, RoadGroup>();

  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const name = tags.name;
    const kind = tags.highway;
    if (!name || !kind) continue;
    if (kind === "construction" || !(kind in ROAD_RANK)) continue;

    const key = `${name}\u0000${kind}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.segments += 1;
      // Fill in detail from whichever segment happens to carry it; a road
      // mapped in pieces often records lanes on one piece and surface on
      // another.
      existing.ref ??= tags.ref;
      existing.surface ??= tags.surface;
      existing.lanes ??= tags.lanes;
      continue;
    }
    byKey.set(key, {
      name,
      kind,
      segments: 1,
      ref: tags.ref,
      surface: tags.surface,
      lanes: tags.lanes,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = (ROAD_RANK[a.kind] ?? 99) - (ROAD_RANK[b.kind] ?? 99);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });
}

export function roadLabel(kind: string): string {
  return ROAD_LABEL[kind] ?? "Road";
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const radiusRaw = Number(getQueryParam(req, "radius") ?? DEFAULT_RADIUS);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return err(res, 400, "lat and lon are required and must be valid coordinates");
  }
  const constructionOnly = getQueryParam(req, "scope") === "construction";
  const maxRadius = constructionOnly ? MAX_WIDE_RADIUS : MAX_RADIUS;
  const radius = Number.isFinite(radiusRaw) ? Math.min(maxRadius, Math.max(100, radiusRaw)) : DEFAULT_RADIUS;

  const rate = limiter.check(getClientIp(req));
  if (!rate.allowed) {
    return err(res, 429, "Too many site requests. Please slow down.", "RATE_LIMITED");
  }

  // Rounded to about 100m, so panning a few metres reuses the cached answer
  // instead of firing another Overpass query for the same street.
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${radius}${constructionOnly ? ",c" : ""}`;
  const cached = cache.get(key);
  if (cached) return ok(res, cached);

  let elements: OverpassElement[];
  try {
    elements = await runOverpassQuery(
      constructionOnly ? buildConstructionQuery(lat, lon, radius) : buildSiteQuery(lat, lon, radius)
    );
  } catch {
    // Honest failure. The free Overpass mirrors go through rough patches and
    // the panel says "couldn't reach OpenStreetMap" rather than "nothing here",
    // because those two mean completely different things to someone deciding
    // whether a plot is being built on.
    return err(res, 503, "OpenStreetMap's servers didn't answer. This usually clears in a minute.");
  }

  const roads = groupRoads(elements);
  const features = elements.map(classify).filter((f): f is SiteFeature => f !== null);

  const underConstruction = features.filter(
    (f) => f.kind === "road-works" || f.kind === "building-site" || f.kind === "construction-area"
  ).length;
  const awaitingDevelopment = features.filter(
    (f) => f.kind === "brownfield" || f.kind === "greenfield" || f.kind === "road-proposed"
  ).length;

  const result: SiteResult = {
    roads,
    features,
    counts: { roads: roads.length, underConstruction, awaitingDevelopment },
    radiusMeters: radius,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(key, result);
  return ok(res, result);
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
