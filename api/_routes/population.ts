import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { sparqlQueryOrThrow, qidFromUri, entityUrl, type SparqlRow } from "../_lib/wikidata.js";
import { runOverpassQuery } from "../_lib/overpass.js";

/**
 * Population for a place.
 *
 * A NOTE ON "LIVE", because the name invites a wrong expectation: population
 * is NOT live and cannot be. Nobody publishes a real-time count of the people
 * in a place - the figures below come from censuses and official estimates
 * and carry the year they apply to. A counter ticking upward on screen would
 * be a number this app invented, on a map whose whole promise is that it
 * doesn't. So every figure here is returned WITH its year and its source, and
 * when there is no figure the answer is "not available", never a guess.
 *
 * Two real sources, tried in order:
 *   1. Wikidata (P1082 population, P585 point-in-time, P2046 area) - sourced,
 *      dated, and covers most settlements of any size worldwide.
 *   2. OpenStreetMap's `population` tag via Overpass - patchier and often
 *      undated, but it covers small places Wikidata misses.
 */

const cache = new TtlCache<unknown>(24 * 60 * 60 * 1000); // population changes yearly at most
const limiter = new RateLimiter(60_000, 20);

export interface PopulationDto {
  /** The place the figure is FOR - often a whole city, not the exact point. */
  place: string;
  population: number;
  /** The year the figure applies to, when the source states one. */
  year: number | null;
  /** Square kilometres, when known - this is what makes density possible. */
  areaKm2: number | null;
  /** People per square kilometre, computed only when area is known. */
  densityPerKm2: number | null;
  source: string;
  /** A link a sceptical person can follow to check the number themselves. */
  sourceUrl: string | null;
}

/**
 * Wikidata area units and how many square kilometres one of each is.
 *
 * P2046 (area) is a QUANTITY WITH A UNIT, and Wikidata stores it in whatever
 * unit the editor used: square kilometres for most cities, but hectares,
 * square metres, square miles and acres are all common. The old query read
 * `wdt:P2046`, which is the bare number with the unit thrown away, and
 * divided the population by it as if it were always km². An area entered as
 * 65,000 hectares became 65,000 km², a density 100 times too low; an area in
 * square metres, a million times too low.
 *
 * Units not in this table are not guessed at: the area is reported as
 * unknown and no density is computed.
 */
export const AREA_UNIT_TO_KM2: Readonly<Record<string, number>> = {
  Q712226: 1, // square kilometre
  Q25343: 1e-6, // square metre
  Q35852: 0.01, // hectare
  Q232291: 2.589988110336, // square mile (international)
  Q81292: 0.0040468564224, // acre (international)
  Q857027: 9.290304e-8, // square foot
};

/** An amount in a Wikidata unit, converted to km², or null if the unit is not a known area unit or the amount is not a positive number. */
export function areaToKm2(amount: string | number | undefined, unitUri: string | undefined): number | null {
  const value = typeof amount === "number" ? amount : Number(String(amount ?? "").replace(/^\+/, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = qidFromUri(unitUri);
  const factor = unit ? AREA_UNIT_TO_KM2[unit] : undefined;
  if (factor === undefined) return null;
  const km2 = value * factor;
  return Number.isFinite(km2) && km2 > 0 ? km2 : null;
}

/**
 * The most people per km² any real settlement-level figure reaches is in the
 * tens of thousands (Manila and the densest parts of Dhaka and Mumbai sit
 * around 40,000 to 75,000). A computed density far above that does not
 * describe a place, it describes a data error, usually an area entered in the
 * wrong unit or for the wrong entity. It is withheld rather than shown.
 */
export const MAX_PLAUSIBLE_DENSITY = 150_000;

const RANK_PREFERRED = "http://wikiba.se/ontology#PreferredRank";

/** The year of a Wikidata point-in-time, or null when it is missing or not a believable census year. */
function yearOf(date: string | undefined): number | null {
  if (!date) return null;
  const year = new Date(date).getUTCFullYear();
  if (!Number.isFinite(year) || year < 1800 || year > new Date().getUTCFullYear() + 1) return null;
  return year;
}

/**
 * Picks the figures to report from the statement rows of one place.
 *
 * Population: Wikidata marks the current figure with the PREFERRED rank. When
 * nothing is preferred, every normal-rank figure comes back, from several
 * censuses, and the old query took the LARGEST - which for a shrinking town
 * is an old figure presented as the current one. Now: preferred first, then
 * the most recent date, then (only to break a tie) the larger value.
 * Deprecated statements are excluded in the query itself.
 *
 * Area: preferred first, then the first statement whose unit converts.
 */
export function pickFigures(rows: SparqlRow[]): {
  population: number;
  year: number | null;
  areaKm2: number | null;
} | null {
  type Pop = { value: number; year: number | null; preferred: boolean };
  const pops: Pop[] = [];
  const areas: Array<{ km2: number; preferred: boolean }> = [];
  for (const row of rows) {
    const value = Number(row.population?.value);
    if (Number.isFinite(value) && value > 0) {
      pops.push({ value: Math.round(value), year: yearOf(row.date?.value), preferred: row.popRank?.value === RANK_PREFERRED });
    }
    const km2 = areaToKm2(row.areaAmount?.value, row.areaUnit?.value);
    if (km2 !== null) areas.push({ km2, preferred: row.areaRank?.value === RANK_PREFERRED });
  }
  if (pops.length === 0) return null;
  pops.sort(
    (a, b) =>
      Number(b.preferred) - Number(a.preferred) ||
      (b.year ?? -Infinity) - (a.year ?? -Infinity) ||
      b.value - a.value
  );
  areas.sort((a, b) => Number(b.preferred) - Number(a.preferred));
  const best = pops[0]!;
  return { population: best.value, year: best.year, areaKm2: areas[0]?.km2 ?? null };
}

/** The main question: see the comment where it is used in fromWikidata(). */
export function detailedPopulationQuery(lat: number, lon: number, radiusKm: number): string {
  return `
    SELECT ?place ?placeLabel ?population ?date ?popRank ?areaAmount ?areaUnit ?areaRank WHERE {
      {
        SELECT ?place (MAX(?p) AS ?maxPop) WHERE {
          SERVICE wikibase:around {
            ?place wdt:P625 ?location .
            bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
            bd:serviceParam wikibase:radius "${radiusKm}" .
          }
          ?place wdt:P31/wdt:P279* wd:Q486972 .
          FILTER NOT EXISTS { ?place wdt:P576 ?dissolved }
          ?place wdt:P1082 ?p .
        }
        GROUP BY ?place
        ORDER BY DESC(?maxPop)
        LIMIT 1
      }
      ?place p:P1082 ?popStatement .
      ?popStatement ps:P1082 ?population ; wikibase:rank ?popRank .
      FILTER(?popRank != wikibase:DeprecatedRank)
      OPTIONAL { ?popStatement pq:P585 ?date }
      OPTIONAL {
        ?place p:P2046 ?areaStatement .
        ?areaStatement psv:P2046 ?areaValue ; wikibase:rank ?areaRank .
        ?areaValue wikibase:quantityAmount ?areaAmount ; wikibase:quantityUnit ?areaUnit .
        FILTER(?areaRank != wikibase:DeprecatedRank)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 500
  `;
}

/**
 * The fallback question: the place and its population, no area. Same place
 * filters as the main query (existing human settlements only).
 */
export function simplePopulationQuery(lat: number, lon: number, radiusKm: number): string {
  return `
    SELECT ?place ?placeLabel ?population ?date ?popRank WHERE {
      SERVICE wikibase:around {
        ?place wdt:P625 ?location .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      ?place wdt:P31/wdt:P279* wd:Q486972 .
      FILTER NOT EXISTS { ?place wdt:P576 ?dissolved }
      ?place p:P1082 ?popStatement .
      ?popStatement ps:P1082 ?population ; wikibase:rank ?popRank .
      FILTER(?popRank != wikibase:DeprecatedRank)
      OPTIONAL { ?popStatement pq:P585 ?date }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    ORDER BY DESC(?population)
    LIMIT 1
  `;
}

/**
 * Asks Wikidata for the population of the nearest settlement to a point.
 *
 * Uses the Wikidata Query Service's geospatial search to find settlements
 * within a radius, then takes the most populous - which is the right answer
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
   * returned "Andhra Pradesh (1956-2014)" - 84 million - for a point in
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
  /*
    One round trip in two steps. The inner query picks the place exactly as
    before: the most populous existing human settlement within the radius.
    The outer part then reads that place's statements in full - every
    non-deprecated population with its date and rank, and every area as a
    value WITH ITS UNIT - so the choice of figure and the unit conversion
    happen in pickFigures(), where they can be tested.
  */
  const query = detailedPopulationQuery(lat, lon, radiusKm);

  // Throws when Wikidata cannot be reached, so the handler can tell an outage
  // apart from "no published figure". See sparqlQueryOrThrow.
  let rows: SparqlRow[];
  try {
    rows = await sparqlQueryOrThrow(query);
  } catch (error) {
    /*
      Safety net. If the detailed query is ever rejected (a query error, or a
      timeout under load), ask the simpler question the app used before: the
      place and its population, without area. The visitor still gets a
      sourced, dated population; they only lose the density, which is the
      safe direction. If this one fails too, the error goes to the handler.
    */
    console.error("[api/population] detailed query failed, retrying without area", error instanceof Error ? error.message : error);
    rows = await sparqlQueryOrThrow(simplePopulationQuery(lat, lon, radiusKm));
  }
  const first = rows[0];
  if (!first?.placeLabel?.value) return null;

  const figures = pickFigures(rows);
  if (!figures) return null;

  const qid = qidFromUri(first.place?.value);
  const density = figures.areaKm2 ? Math.round(figures.population / figures.areaKm2) : null;
  const plausible = density !== null && density > 0 && density <= MAX_PLAUSIBLE_DENSITY;

  return {
    place: first.placeLabel.value,
    population: figures.population,
    year: figures.year,
    // An area that gives an impossible density is almost certainly entered in
    // the wrong unit or for the wrong thing, so neither is shown.
    areaKm2: plausible ? Math.round(figures.areaKm2! * 100) / 100 : null,
    densityPerKm2: plausible ? density : null,
    source: "Wikidata",
    sourceUrl: qid ? entityUrl(qid) : null,
  };
}

/**
 * OSM fallback. Its `population` tag is free text in practice, so anything
 * that isn't a clean number is discarded rather than coerced - "approx 50000"
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
  let sourceFailed = false;
  try {
    // 25 km catches the city you're standing in without reaching the next one.
    result = await fromWikidata(lat, lon, 25);
  } catch (error) {
    sourceFailed = true;
    console.error("[api/population] wikidata", error instanceof Error ? error.message : error);
  }

  if (!result) {
    try {
      result = await fromOpenStreetMap(lat, lon, 25_000);
    } catch (error) {
      sourceFailed = true;
      console.error("[api/population] overpass", error instanceof Error ? error.message : error);
    }
  }

  // "No published figure" is only true when every source answered. If one of
  // them failed, the honest answer is that the check failed: no-store, so
  // neither this instance nor the CDN remembers it, and the panel says
  // "couldn't reach the population sources" instead of claiming a gap in the
  // data. This used to be cached for a day as if nothing existed.
  if (!result && sourceFailed) {
    return err(res, 502, "The population sources did not answer just now.", "PROVIDER_UNAVAILABLE");
  }

  // Null is a real answer here: plenty of the world has no published figure
  // for the nearest settlement, and saying so is the honest response.
  cache.set(cacheKey, result);
  ok(res, { population: result });
};

export default withMaintenanceGuard(withEdgeCache(86400)(handler));
