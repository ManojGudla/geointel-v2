import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQuery, buildEvidenceQuery, normalizeElement, type OverpassElement } from "../_lib/overpass.js";

const ALLOWED_RADII = [100, 250, 500, 1000, 2000, 5000];
const MAX_CUSTOM_RADIUS = 5000;

export interface GISFeatureDto {
  id: number;
  osmType: "node" | "way" | "relation";
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

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

export function classifyFeatures(elements: OverpassElement[]) {
  const counts = {
    buildings: 0,
    shops: 0,
    offices: 0,
    residential: 0,
    industrial: 0,
    institutional: 0,
    amenities: 0,
    tourism: 0,
    transport: 0,
  };

  for (const el of elements) {
    const tags = el.tags || {};
    if (tags.building) {
      counts.buildings += 1;
      if (["residential", "house", "apartments", "detached", "terrace"].includes(tags.building)) counts.residential += 1;
      if (["industrial", "warehouse", "factory"].includes(tags.building)) counts.industrial += 1;
      if (["school", "hospital", "college", "university", "government", "civic"].includes(tags.building)) counts.institutional += 1;
      // A building's own `building=*` subtype can directly say "this is a
      // commercial building" (building=commercial/retail/supermarket/kiosk/
      // shop) or "this is an office building" (building=office), even when
      // nothing else on that same way carries a separate shop=/office= tag.
      // Before this, only residential/industrial/institutional building
      // subtypes fed their matching score — a building tagged
      // building=commercial or building=retail contributed NOTHING to the
      // commercial score below, so a genuinely 100% commercial property
      // sitting anywhere near ordinary residential buildings (true of
      // almost every real address) lost to Residential purely because
      // commercial building subtypes were invisible to the scorer while
      // residential ones weren't. Reported bug: a real commercial property
      // was classified Residential.
      if (["commercial", "retail", "supermarket", "kiosk", "shop"].includes(tags.building)) counts.shops += 1;
      if (tags.building === "office") counts.offices += 1;
    }
    if (tags.shop) counts.shops += 1;
    if (tags.office) counts.offices += 1;
    if (tags.landuse === "residential") counts.residential += 1;
    // Same asymmetry one level up: landuse=residential counted, but a zone
    // explicitly tagged landuse=commercial/landuse=retail (very common for
    // a business district) never did — the other half of the same bug.
    if (tags.landuse === "commercial" || tags.landuse === "retail") counts.shops += 1;
    if (tags.landuse === "industrial" || tags.industrial) counts.industrial += 1;
    if (tags.amenity) {
      counts.amenities += 1;
      if (["school", "college", "university", "hospital", "place_of_worship", "police", "townhall"].includes(tags.amenity)) {
        counts.institutional += 1;
      }
    }
    // buildEvidenceQuery already fetches tourism=* (attractions, monuments,
    // museums, viewpoints, hotels, ...) and transit infrastructure
    // (railway=*, public_transport=*, highway=bus_stop) alongside
    // buildings/shops/offices/amenities, but until now nothing ever counted
    // them. A landmark like the Eiffel Tower is tagged tourism=attraction
    // with no building/shop/office/amenity tag on its own node at all — so
    // its own OSM entry contributed ZERO evidence, and the location came
    // back "Vacant / Unknown" despite Overpass returning real data for
    // exactly the thing being looked up. Same blind spot for a location
    // dominated by a transit hub. See analyzeProperty() in
    // propertyAnalyzer.ts, which is the other half of this fix.
    if (tags.tourism) counts.tourism += 1;
    if (tags.railway || tags.public_transport || tags.highway === "bus_stop") counts.transport += 1;
  }

  const commercial = counts.shops * 3 + counts.offices * 2 + counts.amenities * 0.5;
  const residential = counts.residential * 2;
  const industrial = counts.industrial * 3;
  const institutional = counts.institutional * 2.5;
  const landmark = counts.tourism * 2.5;
  const transport = counts.transport * 2;

  const round = (n: number) => Math.round(n);

  return {
    counts,
    scores: {
      commercial: round(commercial),
      residential: round(residential),
      industrial: round(industrial),
      institutional: round(institutional),
      landmark: round(landmark),
      transport: round(transport),
    },
  };
}

/**
 * How much real evidence Overpass actually returned, across every bucket
 * classifyFeatures tracks — used to decide "Vacant / Unknown" (api/gis.ts's
 * GIS Evidence panel and analyzeProperty() both need this same number, so it
 * lives here once rather than drifting between two hand-copied sums, which
 * is exactly how the Eiffel Tower bug above happened: totalEvidence used to
 * only sum 4 of the (now 9) count buckets, so real evidence sitting in the
 * other buckets read as zero.
 */
export function totalEvidenceCount(counts: ReturnType<typeof classifyFeatures>["counts"]): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const radius = Number(getQueryParam(req, "radius") ?? "250");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return err(res, 400, "Query parameters 'lat' and 'lon' are required numbers.");
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_CUSTOM_RADIUS) {
    return err(res, 400, `Radius must be between 1 and ${MAX_CUSTOM_RADIUS} meters.`);
  }

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many GIS requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;
  let elements = cache.get(cacheKey);

  if (!elements) {
    try {
      elements = await runOverpassQuery(buildEvidenceQuery(lat, lon, radius));
      cache.set(cacheKey, elements);
    } catch (error) {
      console.error("[api/gis]", error);
      const reason = error instanceof Error ? error.message : "unknown reason";
      return err(res, 502, `GIS evidence is temporarily unavailable (${reason}).`, "PROVIDER_UNAVAILABLE");
    }
  }

  const features: GISFeatureDto[] = elements
    .map((el) => {
      const coords = normalizeElement(el);
      if (!coords) return null;
      return { id: el.id, osmType: el.type, lat: coords.lat, lon: coords.lon, tags: el.tags || {} };
    })
    .filter((f): f is GISFeatureDto => f !== null);

  const { counts, scores } = classifyFeatures(elements);

  ok(res, {
    evidence: {
      trust: "verified" as const,
      radiusMeters: radius,
      counts,
      scores,
      features,
      source: "OpenStreetMap / Overpass",
      fetchedAt: new Date().toISOString(),
    },
    allowedRadii: ALLOWED_RADII,
  });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
