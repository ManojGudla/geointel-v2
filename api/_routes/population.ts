import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { sparqlQuery, qidFromUri, entityUrl, type SparqlRow } from "../_lib/wikidata.js";
import { runOverpassQuery } from "../_lib/overpass.js";

/**
 * Population for a place.
 *
 * A NOTE ON "LIVE", because the name invites a wrong expectation: population
 * is NOT live and cannot be. Nobody publishes a real-time count of the people
 * in a place — the figures below come from censuses and official estimates
 * and carry the year they apply to. A counter ticking upward on screen would
 * be a number this app invented, on a map whose whole promise is that it
 * doesn't. So every figure here is returned WITH its year and its source, and
 * when there is no figure the answer is "not available", never a guess.
 *
 * Two real sources, tried in order:
 *   1. Wikidata (P1082 population, P585 point-in-time, P2046 area) — sourced,
 *      dated, and covers most settlements of any size worldwide.
 *   2. OpenStreetMap's `population` tag via Overpass — patchier and often
 *      undated, but it covers small places Wikidata misses.
 */

const cache = new TtlCache<unknown>(24 * 60 * 60 * 1000); // population changes yearly at most
const limiter = new RateLimiter(60_000, 20);

export interface PopulationDto {
  /** The place the figure is FOR — often a whole city, not the exact point. */
  place: string;
  population: number;
  /** The year the figure applies to, when the source states one. */
  year: number | null;
  /** Square kilometres, when known — this is what makes density possible. */
  areaKm2: number | null;
  /** People per square kilometre, computed only when area is known. */
  densityPerKm2: number | null;
  source: string;
  /** A link a sceptical person can follow to check the number themselves. */
  sourceUrl: string | null;
}

/**
 * Asks Wikidata for the population of the nearest settlement to a point.
 *
 * Uses the Wikidata Query Service's geospatial search to find settlements
 * within a radius, then takes the most populous — which is the right answer
 * for "what place am I in": standing in a suburb, the number people mean is
 * the city's, not the suburb's, and the response names which place it used so
 * that choice is visible rather than hidden.
 */
async function fromWikidata(lat: number, lon: number, radiusKm: number): Promise<PopulationDto | null> {
  /**
   * Two filters here are the difference between a right and a wrong answer,
   * and both were found by checking the live result rather than the code.
   *
   * Asking only for "the most populous thing with coordinates within 25 km"
   * returned "Andhra Pradesh (1956-2014)" — 84 million — for a point in
   * Hyderabad. Administrative regions carry coordinates and populations too,
   * and a state's population dwarfs any city inside it. Worse, that entity is
   * a state that no longer exists.
   *
   *   P31/P279* wd:Q486972  restricts to human settlements (city, town,
   *                         village, and every subclass of them), so states,
   *                         districts and countries can never win.
   *   FILTER NOT EXISTS P576  drops anything with a dissolution date, so a
   *                         former city or a renamed administrative body is
   *                         never reported as if it still existed.
   */
  const query = `
    SELECT ?place ?placeLabel ?population ?date ?area WHERE {
      SERVICE wikibase:around {
        ?place wdt:P625 ?location .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      ?place wdt:P31/wdt:P279* wd:Q486972 .
      FILTER NOT EXISTS { ?place wdt:P576 ?dissolved }
      ?place wdt:P1082 ?population .
      OPTIONAL { ?place p:P1082 [ ps:P1082 ?population ; pq:P585 ?date ] }
      OPTIONAL { ?place wdt:P2046 ?area }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    ORDER BY DESC(?population)
    LIMIT 1
  `;

  const rows: SparqlRow[] = await sparqlQuery(query);
  const row = rows[0];
  if (!row?.population?.value || !row.placeLabel?.value) return null;

  const population = Number(row.population.value);
  if (!Number.isFinite(population) || population <= 0) return null;

  const areaKm2 = row.area?.value ? Number(row.area.value) : null;
  const year = row.date?.value ? new Date(row.date.value).getUTCFullYear() : null;
  const qid = qidFromUri(row.place?.value);

  return {
    place: row.placeLabel.value,
    population: Math.round(population),
    year: Number.isFinite(year as number) ? year : null,
    areaKm2: areaKm2 && Number.isFinite(areaKm2) && areaKm2 > 0 ? areaKm2 : null,
    densityPerKm2: areaKm2 && areaKm2 > 0 ? Math.round(population / areaKm2) : null,
    source: "Wikidata",
    sourceUrl: qid ? entityUrl(qid) : null,
  };
}

/**
 * OSM fallback. Its `population` tag is free text in practice, so anything
 * that isn't a clean number is discarded rather than coerced — "approx 50000"
 * parsed as 50000 would be inventing a precision the tag doesn't have.
 */
async function fromOpenStreetMap(lat: number, lon: number, radiusMeters: number): Promise<PopulationDto | null> {
  const query = `[out:json][timeout:20];
    (
      node["place"~"^(city|town|village|suburb|neighbourhood)$"]["population"](around:${radiusMeters},${lat},${lon});
      relation["place"~"^(city|town|village|suburb|neighbourhood)$"]["population"](around:${radiusMeters},${lat},${lon});
    );
    out tags center 20;`;

  const elements = await runOverpassQuery(query);
  let best: { name: string; population: number; year: number | null } | null = null;

  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const raw = tags.population;
    if (!raw) continue;
    // Only a bare integer (commas and spaces allowed as separators) counts.
    if (!/^[\d\s,]+$/.test(raw.trim())) continue;
    const population = Number(raw.replace(/[\s,]/g, ""));
    if (!Number.isFinite(population) || population <= 0) continue;

    const dateTag = tags["population:date"] ?? tags["source:population:date"];
    const year = dateTag ? Number(dateTag.slice(0, 4)) : null;
    const name = tags["name:en"] ?? tags.name ?? "this area";
    if (!best || population > best.population) {
      best = { name, population, year: Number.isFinite(year as number) ? year : null };
    }
  }

  if (!best) return null;
  return {
    place: best.name,
    population: best.population,
    year: best.year,
    areaKm2: null,
    densityPerKm2: null,
    source: "OpenStreetMap",
    sourceUrl: null,
  };
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return err(res, 400, "lat and lon are required numbers.");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return err(res, 400, "lat and lon are out of range.");
  }

  const ip = getClientIp(req);
  if (!limiter.check(ip).allowed) {
    return err(res, 429, "Too many population requests. Please slow down.", "RATE_LIMITED");
  }

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return ok(res, { population: cached });

  let result: PopulationDto | null = null;
  try {
    // 25 km catches the city you're standing in without reaching the next one.
    result = await fromWikidata(lat, lon, 25);
  } catch (error) {
    console.error("[api/population] wikidata", error instanceof Error ? error.message : error);
  }

  if (!result) {
    try {
      result = await fromOpenStreetMap(lat, lon, 25_000);
    } catch (error) {
      console.error("[api/population] overpass", error instanceof Error ? error.message : error);
    }
  }

  // Null is a real answer here: plenty of the world has no published figure
  // for the nearest settlement, and saying so is the honest response.
  cache.set(cacheKey, result);
  ok(res, { population: result });
};

export default withMaintenanceGuard(withEdgeCache(86400)(handler));
