import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { nominatimSearch, type NominatimResult } from "../_lib/nominatim.js";
import { decodePlusCode, findPlusCode, recoverPlusCode } from "../../src/features/search/plusCode.js";

/**
 * Place search.
 *
 * This was rewritten because people searching for their OWN neighbourhood
 * couldn't find it. Four things were wrong, and the last one is the reason:
 *
 *  1. The map bias was a box around the whole of India — far too coarse to
 *     help someone looking at one city.
 *  2. Only 8 results were requested, so a local match could be cut before
 *     ranking ever saw it.
 *  3. The cache key ignored where the user was looking, so the first person
 *     to search a word fixed the answer for everyone after them.
 *  4. Results were sorted by Nominatim's `importance` — a GLOBAL notability
 *     score. A residential colony scores near zero, so it sorted BELOW every
 *     big city that happened to share a word. Someone in Hyderabad searching
 *     their own locality got Delhi first and their street last, or off the
 *     end of the list entirely.
 *
 * The fix is to rank by relevance to WHERE THE USER IS LOOKING: a strong
 * proximity term, with importance as a tiebreaker rather than the whole
 * ranking. "Gandhi Nagar" exists in dozens of Indian cities; the one two
 * kilometres away is the one that was meant.
 */

// Fallback bias when the client sends no viewport (a cold load, a shared
// link). Still India-weighted, matching the product's primary market, and
// still a soft bias — `bounded: false` means nothing is excluded.
const INDIA_VIEWBOX = "68,37,98,6";

const cache = new TtlCache<NominatimResult[]>(5 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

/** Requested from Nominatim. Ranked down to RETURN_LIMIT before responding. */
const FETCH_LIMIT = 20;
const RETURN_LIMIT = 8;

export interface SearchResultDto {
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
  /** Kilometres from the map centre, when one was supplied. */
  distanceKm?: number;
}

function toDto(r: NominatimResult): SearchResultDto {
  return {
    displayName: r.display_name,
    name: r.name || r.address?.city || r.address?.town || r.display_name.split(",")[0]!.trim(),
    lat: Number(r.lat),
    lon: Number(r.lon),
    type: r.type,
    importance: r.importance,
  };
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * A viewbox around the point the user is looking at.
 *
 * ±2° is roughly a 220 km box — wide enough to cover a metro area and its
 * surroundings, tight enough that it genuinely prefers local matches. It is
 * only a BIAS: Nominatim is called with bounded=false, so a search for
 * "Paris" from Hyderabad still finds Paris.
 */
function viewboxAround(lat: number, lon: number): string {
  const pad = 2;
  const west = Math.max(-180, lon - pad);
  const east = Math.min(180, lon + pad);
  const north = Math.min(90, lat + pad);
  const south = Math.max(-90, lat - pad);
  return `${west},${north},${east},${south}`;
}

/**
 * How good a match this is for someone looking at (lat, lon).
 *
 * Proximity dominates and importance breaks ties. The distance term decays
 * exponentially with a 40 km half-life, so:
 *   - same city (<10 km)     -> almost the full proximity score
 *   - same metro (~40 km)    -> about a third of it
 *   - another state (500 km) -> effectively none, and importance decides
 *
 * A famous city therefore still wins a genuinely ambiguous global search,
 * while a nearby unremarkable place wins when you are clearly looking at it.
 */
export function rankScore(result: SearchResultDto, origin: { lat: number; lon: number } | null): number {
  const importance = result.importance ?? 0;
  if (!origin) return importance;
  const km = distanceKm(origin.lat, origin.lon, result.lat, result.lon);
  const proximity = Math.exp(-km / 40);
  return proximity * 1.6 + importance;
}

/**
 * Answers a Plus Code query without asking Nominatim anything.
 *
 * The bug this fixes, with the real example a user reported:
 *
 *     8VPH+PH2, Araku Valley, Kantabamsuguda, Andhra Pradesh 531149
 *
 * Google found that instantly; this app returned nothing, and the user
 * concluded the maps were broken. Plus Codes are Google's format and
 * Nominatim has no support for them at all, so no amount of query rewriting
 * would ever have worked. They are pure arithmetic though, so we decode them
 * here — see src/features/search/plusCode.ts.
 *
 * A SHORT code like `8VPH+PH2` repeats every degree, about 110 km, so it needs
 * a nearby reference. The text typed alongside it is that reference, which is
 * why it is geocoded first and the map centre is only the fallback. Getting
 * this backwards would return a real point 437 km from the right one.
 */
async function resolvePlusCode(
  query: string,
  origin: { lat: number; lon: number } | null,
  viewbox: string
): Promise<SearchResultDto[] | null> {
  const found = findPlusCode(query);
  if (!found) return null;

  if (found.full) {
    const decoded = decodePlusCode(found.code);
    if (!decoded) return null;
    return [
      {
        displayName: found.context ? `${found.code} — ${found.context}` : `Plus Code ${found.code}`,
        name: found.code,
        lat: decoded.lat,
        lon: decoded.lon,
        type: "plus_code",
      },
    ];
  }

  // Short code. Find the reference: the place name typed with it wins over
  // wherever the map happens to be pointing.
  let reference = origin;
  if (found.context.length >= 3) {
    try {
      const nearby = await nominatimSearch(found.context, { limit: 1, viewbox, bounded: false });
      const first = nearby[0];
      if (first && Number.isFinite(Number(first.lat)) && Number.isFinite(Number(first.lon))) {
        reference = { lat: Number(first.lat), lon: Number(first.lon) };
      }
    } catch {
      // The code is still worth answering from the map centre; a failed
      // lookup of the surrounding text should not lose the whole query.
    }
  }
  if (!reference) return null;

  const decoded = recoverPlusCode(found.code, reference.lat, reference.lon);
  if (!decoded) return null;
  return [
    {
      displayName: found.context ? `${found.code} — ${found.context}` : `Plus Code ${found.code}`,
      name: found.code,
      lat: decoded.lat,
      lon: decoded.lon,
      type: "plus_code",
    },
  ];
}

const handler: ApiHandler = async (req, res) => {
  const query = getQueryParam(req, "q")?.trim();
  if (!query) return err(res, 400, "Query parameter 'q' is required.");
  if (query.length < 2) return ok(res, { results: [] as SearchResultDto[] });

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) {
    return err(res, 429, "Too many search requests. Please slow down.", "RATE_LIMITED");
  }

  // Where the user is looking. Optional — search still works without it.
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const origin =
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

  // The viewport is part of the cache key: the same word means different
  // places depending on where you are, and caching on the word alone let the
  // first searcher's location decide the answer for everybody else.
  const region = origin ? `${origin.lat.toFixed(1)},${origin.lon.toFixed(1)}` : "global";
  const viewbox = origin ? viewboxAround(origin.lat, origin.lon) : INDIA_VIEWBOX;

  // Checked before Nominatim, because Nominatim cannot answer this at all.
  const plusCode = await resolvePlusCode(query, origin, viewbox);
  if (plusCode) return ok(res, { results: plusCode, source: "Plus Code (Open Location Code)" });

  const cacheKey = `${query.toLowerCase()}|${region}`;
  let raw = cache.get(cacheKey);

  if (!raw) {
    try {
      raw = await nominatimSearch(query, { limit: FETCH_LIMIT, viewbox, bounded: false });
      cache.set(cacheKey, raw);
    } catch (error) {
      console.error("[api/geocode]", error);
      return err(res, 502, "Location search is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
    }
  }

  const results = raw
    .map(toDto)
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => (origin ? { ...r, distanceKm: Math.round(distanceKm(origin.lat, origin.lon, r.lat, r.lon)) } : r))
    .sort((a, b) => rankScore(b, origin) - rankScore(a, origin))
    .slice(0, RETURN_LIMIT);

  ok(res, { results, source: "OpenStreetMap / Nominatim" });
};

export default withMaintenanceGuard(withEdgeCache(300)(handler));
