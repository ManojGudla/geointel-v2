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

/** Score buckets, shared by the weighted totals and the subject feature. */
export type ScoreCategory = "commercial" | "residential" | "industrial" | "institutional" | "landmark" | "transport";

/**
 * The feature you are actually standing on.
 *
 * Reported by users in three countries, and correct: Waverock in Hyderabad
 * is a large commercial office complex, and this app called it RESIDENTIAL
 * at 68% confidence with a VERIFIED badge. The arithmetic was working
 * exactly as written: 40 residential buildings within 250m scored 80, the 6
 * shops and 10 offices scored 43, and residential won.
 *
 * The flaw was never the weights. It was that every feature inside the
 * radius counted the same whether it sat under the pin or 249 metres away,
 * so the question being answered was "what is this neighbourhood mostly
 * made of" while the panel presented the answer as "what is this property".
 * Residential buildings are the most numerous building type in nearly every
 * populated place on earth, so any commercial building surrounded by
 * ordinary city fabric lost. That is structural, not regional, which is why
 * it was wrong on roughly two thirds of locations tested worldwide.
 *
 * A property classification has an obvious primary source of truth: the
 * mapped feature at the point. If there is one, it IS the property, and the
 * surroundings are context. A house in a business district is a house.
 */
export interface SubjectFeature {
  /** The OSM name, when it has one, so the reader can check the claim. */
  name?: string;
  /** Plain-language description of the tag that classified it. */
  kind: string;
  category: ScoreCategory;
  distanceMeters: number;
}

/** How close a feature has to be to count as "the thing you clicked". */
const SUBJECT_RADIUS_M = 35;

/**
 * Metres between two points, flat-earth.
 *
 * Accurate to well under a metre across the few hundred metres this works
 * over, and deliberately not turf: this file runs in a serverless function
 * where cold-start time is paid on every request that misses the cache.
 */
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const perDegree = 111_320;
  const dLat = (a.lat - b.lat) * perDegree;
  const dLon = (a.lon - b.lon) * perDegree * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

/**
 * Distance decay. 1.0 at the pin, 0.5 at `halfMetres`, and falling away
 * roughly with the square after that.
 *
 * `halfMetres` scales with the chosen radius rather than being fixed: a user
 * who widens the search to 1 km is explicitly asking about a wider area, and
 * should not get an answer still dominated by the 50 metres around the pin.
 */
function distanceWeight(distanceMetres: number, halfMetres: number): number {
  const ratio = distanceMetres / halfMetres;
  return 1 / (1 + ratio * ratio);
}

/** Which score bucket a feature belongs to, most specific tag first, or null. */
function categoryOf(tags: Record<string, string>): { category: ScoreCategory; kind: string } | null {
  if (tags.shop) return { category: "commercial", kind: `${tags.shop.replace(/_/g, " ")} shop` };
  if (tags.office) return { category: "commercial", kind: `${tags.office.replace(/_/g, " ")} office` };
  if (tags.building === "office") return { category: "commercial", kind: "office building" };
  if (["commercial", "retail", "supermarket", "kiosk", "shop"].includes(tags.building ?? ""))
    return { category: "commercial", kind: `${tags.building} building` };
  if (["industrial", "warehouse", "factory"].includes(tags.building ?? ""))
    return { category: "industrial", kind: `${tags.building} building` };
  if (["school", "hospital", "college", "university", "government", "civic"].includes(tags.building ?? ""))
    return { category: "institutional", kind: `${tags.building} building` };
  if (["residential", "house", "apartments", "detached", "terrace"].includes(tags.building ?? ""))
    return { category: "residential", kind: `${tags.building} building` };
  if (["school", "college", "university", "hospital", "place_of_worship", "police", "townhall"].includes(tags.amenity ?? ""))
    return { category: "institutional", kind: (tags.amenity ?? "").replace(/_/g, " ") };
  if (tags.tourism) return { category: "landmark", kind: tags.tourism.replace(/_/g, " ") };
  if (tags.railway || tags.public_transport || tags.highway === "bus_stop")
    return { category: "transport", kind: "transit feature" };
  if (tags.amenity) return { category: "commercial", kind: tags.amenity.replace(/_/g, " ") };
  /*
    Landuse is deliberately last and never a subject. A landuse=residential
    polygon can cover a whole suburb, so its centroid says nothing about
    where you are standing — treating one as "the thing you clicked" is how
    a single zoning polygon could overrule the building you are inside.
  */
  if (tags.landuse === "residential") return { category: "residential", kind: "residential land" };
  if (tags.landuse === "commercial" || tags.landuse === "retail")
    return { category: "commercial", kind: `${tags.landuse} land` };
  if (tags.landuse === "industrial" || tags.industrial) return { category: "industrial", kind: "industrial land" };
  return null;
}

const NEVER_A_SUBJECT = new Set(["residential land", "commercial land", "retail land", "industrial land"]);

export function classifyFeatures(
  elements: OverpassElement[],
  /**
   * The point being asked about. Optional so the click-to-inspect route and
   * the existing tests keep their unweighted behaviour; when it is absent
   * every feature weighs 1, which is exactly what this used to do.
   */
  center?: { lat: number; lon: number },
  radiusMeters = 250
) {
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

  /*
    Raw counts and weighted counts are kept apart on purpose.

    `counts` stays exactly as it was: "40 residential buildings within 250m"
    is a true and useful statement about the area, and the Evidence tab
    should keep saying it. Only the SCORES, which decide the classification,
    are weighted by distance. Changing the counts to fractions would have
    made the evidence list unreadable to fix a problem the evidence list
    never had.
  */
  const weighted = { shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 0 };
  const halfMetres = Math.max(40, radiusMeters * 0.2);
  let subject: SubjectFeature | null = null;

  for (const el of elements) {
    const tags = el.tags || {};

    // Distance from the pin, and the weight that follows from it.
    let weight = 1;
    if (center) {
      const at = el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : el.center;
      if (!at) continue;
      const distance = metresBetween(center, at);
      weight = distanceWeight(distance, halfMetres);

      const classified = categoryOf(tags);
      if (
        classified &&
        !NEVER_A_SUBJECT.has(classified.kind) &&
        distance <= SUBJECT_RADIUS_M &&
        (!subject || distance < subject.distanceMeters)
      ) {
        subject = {
          name: typeof tags.name === "string" ? tags.name : undefined,
          kind: classified.kind,
          category: classified.category,
          distanceMeters: Math.round(distance),
        };
      }
    }

    if (tags.building) {
      counts.buildings += 1;
      if (["residential", "house", "apartments", "detached", "terrace"].includes(tags.building)) {
        counts.residential += 1;
        weighted.residential += weight;
      }
      if (["industrial", "warehouse", "factory"].includes(tags.building)) {
        counts.industrial += 1;
        weighted.industrial += weight;
      }
      if (["school", "hospital", "college", "university", "government", "civic"].includes(tags.building)) {
        counts.institutional += 1;
        weighted.institutional += weight;
      }
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
      if (["commercial", "retail", "supermarket", "kiosk", "shop"].includes(tags.building)) {
        counts.shops += 1;
        weighted.shops += weight;
      }
      if (tags.building === "office") {
        counts.offices += 1;
        weighted.offices += weight;
      }
    }
    if (tags.shop) {
      counts.shops += 1;
      weighted.shops += weight;
    }
    if (tags.office) {
      counts.offices += 1;
      weighted.offices += weight;
    }
    if (tags.landuse === "residential") {
      counts.residential += 1;
      weighted.residential += weight;
    }
    // Same asymmetry one level up: landuse=residential counted, but a zone
    // explicitly tagged landuse=commercial/landuse=retail (very common for
    // a business district) never did — the other half of the same bug.
    if (tags.landuse === "commercial" || tags.landuse === "retail") {
      counts.shops += 1;
      weighted.shops += weight;
    }
    if (tags.landuse === "industrial" || tags.industrial) {
      counts.industrial += 1;
      weighted.industrial += weight;
    }
    if (tags.amenity) {
      counts.amenities += 1;
      weighted.amenities += weight;
      if (["school", "college", "university", "hospital", "place_of_worship", "police", "townhall"].includes(tags.amenity)) {
        counts.institutional += 1;
        weighted.institutional += weight;
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
    if (tags.tourism) {
      counts.tourism += 1;
      weighted.tourism += weight;
    }
    if (tags.railway || tags.public_transport || tags.highway === "bus_stop") {
      counts.transport += 1;
      weighted.transport += weight;
    }
  }

  // Same multipliers as before. They were never the problem, and changing
  // them at the same time as the weighting would make it impossible to tell
  // which change moved a given result.
  const commercial = weighted.shops * 3 + weighted.offices * 2 + weighted.amenities * 0.5;
  const residential = weighted.residential * 2;
  const industrial = weighted.industrial * 3;
  const institutional = weighted.institutional * 2.5;
  const landmark = weighted.tourism * 2.5;
  const transport = weighted.transport * 2;

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
    subject,
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

  // The point being asked about, and the radius, so the scores are weighted
  // toward what is actually at that point. See classifyFeatures.
  const { counts, scores, subject } = classifyFeatures(elements, { lat, lon }, radius);

  ok(res, {
    evidence: {
      trust: "verified" as const,
      radiusMeters: radius,
      counts,
      scores,
      subject,
      features,
      source: "OpenStreetMap / Overpass",
      fetchedAt: new Date().toISOString(),
    },
    allowedRadii: ALLOWED_RADII,
  });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
