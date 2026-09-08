import type { ApiHandler } from "./_lib/http";
import { ok, err, getQueryParam, getClientIp } from "./_lib/http";
import { TtlCache, RateLimiter } from "./_lib/cache";
import { nominatimSearch, type NominatimResult } from "./_lib/nominatim";

// India-wide viewbox used as a soft bias (not a hard filter) so ambiguous
// short queries prefer Indian results without excluding legitimate matches
// elsewhere — matching the product's primary market without breaking global
// search.
const INDIA_VIEWBOX = "68,37,98,6";

const cache = new TtlCache<NominatimResult[]>(5 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

export interface SearchResultDto {
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
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

const handler: ApiHandler = async (req, res) => {
  const query = getQueryParam(req, "q")?.trim();
  if (!query) return err(res, 400, "Query parameter 'q' is required.");
  if (query.length < 2) return ok(res, { results: [] as SearchResultDto[] });

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) {
    return err(res, 429, "Too many search requests. Please slow down.", "RATE_LIMITED");
  }

  const cacheKey = query.toLowerCase();
  let raw = cache.get(cacheKey);

  if (!raw) {
    try {
      raw = await nominatimSearch(query, { limit: 8, viewbox: INDIA_VIEWBOX, bounded: false });
      cache.set(cacheKey, raw);
    } catch (error) {
      console.error("[api/geocode]", error);
      return err(res, 502, "Location search is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
    }
  }

  const results = raw
    .map(toDto)
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

  ok(res, { results, source: "OpenStreetMap / Nominatim" });
};

export default handler;
