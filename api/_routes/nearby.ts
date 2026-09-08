import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQuery, normalizeElement, type OverpassElement } from "../_lib/overpass.js";

interface TagFilter {
  key: string;
  /** Omitted = "has this key, any value" (an Overpass `[key]` presence filter). */
  value?: string;
}

// Reported bug: "Nearby" showed no results for real, populated locations.
// Root cause — every category here used to require an EXACT single tag
// value (e.g. amenity=restaurant only), built from a hand-parsed regex over
// strings like "[amenity=restaurant]". That missed two things constantly
// present in real-world OSM data: (1) common synonym tags real mappers use
// (amenity=fast_food, tourism=motel, healthcare=hospital, leisure=garden,
// railway=station...), and (2) "shopping" only matched shop=mall/
// supermarket/department_store — it never matched the far more common case
// of individual small shops (shop=clothes, shop=convenience, shop=bakery,
// ...), even though the GIS evidence scorer (api/gis.ts) already treats ANY
// shop=* tag as real commercial evidence. A `{ key }` filter with no value
// now means "has this key, any value" so "Shopping" and "Transit" match the
// same way the evidence scorer already does, instead of a narrow allowlist.
const CATEGORY_FILTERS: Record<string, TagFilter[]> = {
  restaurants: [{ key: "amenity", value: "restaurant" }, { key: "amenity", value: "fast_food" }],
  cafes: [{ key: "amenity", value: "cafe" }],
  hotels: [{ key: "tourism", value: "hotel" }, { key: "tourism", value: "guest_house" }, { key: "tourism", value: "motel" }],
  hospitals: [{ key: "amenity", value: "hospital" }, { key: "amenity", value: "clinic" }, { key: "healthcare", value: "hospital" }],
  schools: [{ key: "amenity", value: "school" }],
  atms: [{ key: "amenity", value: "atm" }],
  banks: [{ key: "amenity", value: "bank" }],
  petrol: [{ key: "amenity", value: "fuel" }],
  shopping: [{ key: "shop" }],
  parks: [{ key: "leisure", value: "park" }, { key: "leisure", value: "garden" }],
  pharmacies: [{ key: "amenity", value: "pharmacy" }],
  police: [{ key: "amenity", value: "police" }],
  publicTransport: [{ key: "highway", value: "bus_stop" }, { key: "public_transport" }, { key: "railway", value: "station" }],
};

// OSM's built environment — buildings, shops, amenities, POIs — changes over
// days and weeks, not minutes, so a short TTL bought nothing and cost a great
// deal: every repeat view re-queried Overpass's free public mirrors, which are
// the least reliable dependency in this app and were actively rate-limiting us.
// Six hours matches what officials.ts already uses for similarly slow-moving
// data. This is a per-instance in-memory cache on serverless (see cache.ts), so
// it evaporates on a cold start — it reduces load and speeds up repeat views,
// it is not a durability guarantee.
const cache = new TtlCache<OverpassElement[]>(6 * 60 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** `{key:"amenity",value:"restaurant"}` -> `[amenity=restaurant]`; `{key:"shop"}` -> `[shop]` (any value). */
function overpassClause(f: TagFilter): string {
  return f.value !== undefined ? `[${f.key}=${f.value}]` : `[${f.key}]`;
}

function matchesFilter(tags: Record<string, string>, f: TagFilter): boolean {
  return f.value !== undefined ? tags[f.key] === f.value : !!tags[f.key];
}

function categoryOf(tags: Record<string, string>): string | null {
  for (const [cat, filterList] of Object.entries(CATEGORY_FILTERS)) {
    if (filterList.some((f) => matchesFilter(tags, f))) return cat;
  }
  return null;
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const radius = Number(getQueryParam(req, "radius") ?? "1000");
  const category = getQueryParam(req, "category");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return err(res, 400, "'lat' and 'lon' are required numbers.");
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return err(res, 400, "'lat' and 'lon' are out of range.");
  /**
   * The radius cap. This route had none, while /api/gis capped at 5000 and
   * /api/poi-evidence at 150.
   *
   * Without it, `?radius=20000000` with no category built 21 Overpass clauses
   * each searching a 20,000 km circle, and sent that to the volunteer-run
   * public mirrors. Repeat it and the mirrors ban this deployment's IP — which
   * takes out GIS evidence, Nearby, click-to-inspect, Property Intelligence
   * and every AI agent that reads them. Not a data leak; an outage, caused by
   * a query string.
   */
  if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
    return err(res, 400, "'radius' must be between 1 and 5000 metres.");
  }
  /**
   * `Object.hasOwn`, not `CATEGORY_FILTERS[category]`.
   *
   * A plain lookup walks the prototype chain, so `?category=constructor` and
   * `?category=toString` returned something truthy, passed this check, and
   * then produced a garbage Overpass clause that threw where nothing caught
   * it. Same class of bug as the route dispatcher in api/[...path].ts.
   */
  if (category && !Object.hasOwn(CATEGORY_FILTERS, category)) return err(res, 400, `Unknown category '${category}'.`);

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many nearby requests. Please slow down.", "RATE_LIMITED");

  const categories = category ? [category] : Object.keys(CATEGORY_FILTERS);
  const filters = categories.flatMap((c) => CATEGORY_FILTERS[c]!);

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${categories.join(",")}`;
  let elements = cache.get(cacheKey);

  if (!elements) {
    try {
      const clauses = filters.map((f) => `nwr(around:${radius},${lat},${lon})${overpassClause(f)};`).join("\n");
      const query = `[out:json][timeout:20];(${clauses});out center tags;`;
      elements = await runOverpassQuery(query);
      cache.set(cacheKey, elements);
    } catch (error) {
      console.error("[api/nearby]", error);
      const reason = error instanceof Error ? error.message : "unknown reason";
      return err(res, 502, `Nearby places are temporarily unavailable (${reason}).`, "PROVIDER_UNAVAILABLE");
    }
  }

  const items = elements
    .map((el) => {
      const coords = normalizeElement(el);
      if (!coords) return null;
      const tags = el.tags || {};
      const cat = categoryOf(tags);
      if (!cat) return null;
      return {
        id: `${el.type}/${el.id}`,
        name: tags.name || cat,
        category: cat,
        lat: coords.lat,
        lon: coords.lon,
        distanceMeters: Math.round(haversineMeters({ lat, lon }, coords)),
        tags,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 60);

  ok(res, { items, source: "OpenStreetMap / Overpass", radiusMeters: radius });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
