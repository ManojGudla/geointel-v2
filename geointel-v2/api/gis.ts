import type { ApiHandler } from "./_lib/http";
import { ok, err, getQueryParam, getClientIp } from "./_lib/http";
import { TtlCache, RateLimiter } from "./_lib/cache";
import { runOverpassQuery, buildEvidenceQuery, normalizeElement, type OverpassElement } from "./_lib/overpass";

const ALLOWED_RADII = [100, 250, 500, 1000, 2000, 5000];
const MAX_CUSTOM_RADIUS = 5000;

export interface GISFeatureDto {
  id: number;
  osmType: "node" | "way" | "relation";
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

const cache = new TtlCache<OverpassElement[]>(10 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

export function classifyFeatures(elements: OverpassElement[]) {
  const counts = { buildings: 0, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0 };

  for (const el of elements) {
    const tags = el.tags || {};
    if (tags.building) {
      counts.buildings += 1;
      if (["residential", "house", "apartments", "detached", "terrace"].includes(tags.building)) counts.residential += 1;
      if (["industrial", "warehouse", "factory"].includes(tags.building)) counts.industrial += 1;
      if (["school", "hospital", "college", "university", "government", "civic"].includes(tags.building)) counts.institutional += 1;
    }
    if (tags.shop) counts.shops += 1;
    if (tags.office) counts.offices += 1;
    if (tags.landuse === "residential") counts.residential += 1;
    if (tags.landuse === "industrial" || tags.industrial) counts.industrial += 1;
    if (tags.amenity) {
      counts.amenities += 1;
      if (["school", "college", "university", "hospital", "place_of_worship", "police", "townhall"].includes(tags.amenity)) {
        counts.institutional += 1;
      }
    }
  }

  const commercial = counts.shops * 3 + counts.offices * 2 + counts.amenities * 0.5;
  const residential = counts.residential * 2;
  const industrial = counts.industrial * 3;
  const institutional = counts.institutional * 2.5;

  const round = (n: number) => Math.round(n);

  return {
    counts,
    scores: {
      commercial: round(commercial),
      residential: round(residential),
      industrial: round(industrial),
      institutional: round(institutional),
    },
  };
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
      return err(res, 502, "GIS evidence is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
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

export default handler;
