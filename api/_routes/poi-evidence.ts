import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQuery, buildEvidenceQuery, normalizeElement, type OverpassElement } from "../_lib/overpass.js";
import { classifyFeatures, totalEvidenceCount, type GISFeatureDto } from "./gis.js";

/**
 * Powers "click a building/POI on the map" - a tight-radius version of
 * api/gis.ts's evidence query, so clicking one spot answers "what's right
 * here" instead of re-running the whole analysis-radius query. Reuses
 * classifyFeatures so the Commercial/Residential/Institutional/Industrial
 * breakdown is computed with the exact same rules as the main Evidence tab,
 * just scoped tighter (default 60m, capped at 150m).
 */
const POI_RADIUS_METERS = 60;
const MAX_POI_RADIUS_METERS = 150;

// OSM's built environment - buildings, shops, amenities, POIs - changes over
// days and weeks, not minutes, so a short TTL bought nothing and cost a great
// deal: every repeat view re-queried Overpass's free public mirrors, which are
// the least reliable dependency in this app and were actively rate-limiting us.
// Six hours matches what officials.ts already uses for similarly slow-moving
// data. This is a per-instance in-memory cache on serverless (see cache.ts), so
// it evaporates on a cold start - it reduces load and speeds up repeat views,
// it is not a durability guarantee.
const cache = new TtlCache<OverpassElement[]>(6 * 60 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

/**
 * Real great-circle distance in meters (not a raw lat/lon degree diff, which
 * distorts badly outside the equator and isn't in any human-readable unit).
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * OSM's floor/level tagging is inconsistent, so this checks the tags that
 * actually carry it in rough order of reliability. Returns null (never a
 * guess) when nothing usable is present - the caller/UI is responsible for
 * rendering that as "Unknown".
 */
function floorsFromTags(tags: Record<string, string>): string | null {
  const levels = tags["building:levels"];
  if (levels && Number.isFinite(Number(levels))) {
    const n = Number(levels);
    return `${n} floor${n === 1 ? "" : "s"}`;
  }
  if (tags.level && Number.isFinite(Number(tags.level))) return `Level ${tags.level}`;
  if (tags["addr:floor"]) return `Floor ${tags["addr:floor"]}`;
  return null;
}

/** A short human category label from whichever OSM key is actually present. */
function categoryLabel(tags: Record<string, string>): string {
  if (tags.amenity) return tags.amenity.replace(/_/g, " ");
  if (tags.shop) return tags.shop === "yes" ? "shop" : `${tags.shop.replace(/_/g, " ")} shop`;
  if (tags.office) return tags.office === "yes" ? "office" : `${tags.office.replace(/_/g, " ")} office`;
  if (tags.tourism) return tags.tourism.replace(/_/g, " ");
  if (tags.leisure) return tags.leisure.replace(/_/g, " ");
  if (tags.building && tags.building !== "yes") return `${tags.building.replace(/_/g, " ")} building`;
  if (tags.building) return "building";
  if (tags.landuse) return `${tags.landuse.replace(/_/g, " ")} land`;
  return "feature";
}

function labelFeature(tags: Record<string, string>): string {
  return tags.name || tags.shop || tags.amenity || tags.office || tags.building || tags.landuse || "Unnamed feature";
}

/**
 * Finds the closest feature to the exact click point, named or not - a
 * clicked bare building still deserves "here's what we found," not nothing.
 */
function nearestFeature(elements: OverpassElement[], lat: number, lon: number) {
  let best: { name: string; distanceMeters: number; tags: Record<string, string>; floors: string | null } | null = null;
  for (const el of elements) {
    const tags = el.tags || {};
    const coords = normalizeElement(el);
    if (!coords) continue;
    const distanceMeters = haversineMeters(lat, lon, coords.lat, coords.lon);
    if (best && distanceMeters >= best.distanceMeters) continue;
    best = { name: labelFeature(tags), distanceMeters, tags, floors: floorsFromTags(tags) };
  }
  return best;
}

const NEARBY_LIMIT = 12;

/**
 * Named, human-relevant features near the click point (shops, offices,
 * amenities, tourism, notable buildings) - "we need to be able to see
 * nearby POIs," not just the single closest feature. Bare unnamed
 * buildings/landuse polygons are excluded here since a list of 40
 * anonymous "building" entries isn't useful; they're still counted in
 * poi.counts and browsable via "Show raw OSM tags" on the nearest feature.
 */
function nearbyPois(elements: OverpassElement[], lat: number, lon: number) {
  const candidates: Array<{ name: string; category: string; distanceMeters: number; floors: string | null; tags: Record<string, string> }> = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const isNotable = !!(tags.name || tags.shop || tags.amenity || tags.office || tags.tourism || tags.leisure);
    if (!isNotable) continue;
    const coords = normalizeElement(el);
    if (!coords) continue;
    candidates.push({
      name: labelFeature(tags),
      category: categoryLabel(tags),
      distanceMeters: haversineMeters(lat, lon, coords.lat, coords.lon),
      floors: floorsFromTags(tags),
      tags,
    });
  }
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const seen = new Set<string>();
  const deduped = candidates.filter((c) => {
    const key = `${c.name}|${Math.round(c.distanceMeters)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, NEARBY_LIMIT);
}

async function fetchElements(lat: number, lon: number, radius: number): Promise<OverpassElement[]> {
  const cacheKey = `poi:${lat.toFixed(5)},${lon.toFixed(5)},${radius}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const elements = await runOverpassQuery(buildEvidenceQuery(lat, lon, radius));
  cache.set(cacheKey, elements);
  return elements;
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const requestedRadius = Math.min(Number(getQueryParam(req, "radius") ?? String(POI_RADIUS_METERS)), MAX_POI_RADIUS_METERS);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return err(res, 400, "'lat' and 'lon' are required numbers.");

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many map-click requests. Please slow down.", "RATE_LIMITED");

  let radius = requestedRadius;
  let elements: OverpassElement[];
  try {
    elements = await fetchElements(lat, lon, radius);
    // A tight click radius (60m default) can genuinely land on a spot with
    // nothing mapped right there - a road centroid, a gap between building
    // footprints, a corner of a large campus - even when real evidence
    // exists just a bit further out. Rather than reporting "Vacant /
    // Unknown" off a single tight, possibly-unlucky radius, automatically
    // widen to the max once before giving up. Real click-to-inspect
    // precision is preserved (still tried first, still what's returned
    // when it DOES find something); this only fires on a genuine
    // zero-element result.
    if (elements.length === 0 && radius < MAX_POI_RADIUS_METERS) {
      const widened = await fetchElements(lat, lon, MAX_POI_RADIUS_METERS);
      if (widened.length > 0) {
        elements = widened;
        radius = MAX_POI_RADIUS_METERS;
      }
    }
  } catch (error) {
    console.error("[api/poi-evidence]", error);
    const reason = error instanceof Error ? error.message : "unknown reason";
    return err(res, 502, `Evidence for this exact spot is temporarily unavailable (${reason}).`, "PROVIDER_UNAVAILABLE");
  }

  const { counts, scores } = classifyFeatures(elements);
  const nearest = nearestFeature(elements, lat, lon);
  const totalEvidence = totalEvidenceCount(counts);

  const features: GISFeatureDto[] = elements
    .map((el) => {
      const coords = normalizeElement(el);
      if (!coords) return null;
      return { id: el.id, osmType: el.type, lat: coords.lat, lon: coords.lon, tags: el.tags || {} };
    })
    .filter((f): f is GISFeatureDto => f !== null)
    .slice(0, 200);

  ok(res, {
    poi: {
      lat,
      lon,
      radiusMeters: radius,
      trust: totalEvidence === 0 ? ("unavailable" as const) : totalEvidence < 3 ? ("inferred" as const) : ("verified" as const),
      counts,
      scores,
      features,
      nearestFeature: nearest
        ? { name: nearest.name, distanceMeters: nearest.distanceMeters, tags: nearest.tags, floors: nearest.floors }
        : null,
      nearbyPois: nearbyPois(elements, lat, lon),
      source: "OpenStreetMap / Overpass",
      fetchedAt: new Date().toISOString(),
    },
  });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
