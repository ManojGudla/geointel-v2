import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withPrivateCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { nominatimReverse, type NominatimResult } from "../_lib/nominatim.js";

const cache = new TtlCache<NominatimResult>(10 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

export interface LocationDto {
  lat: number;
  lon: number;
  displayName: string;
  name: string;
  address: {
    houseNumber?: string;
    road?: string;
    suburb?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    postcode?: string;
    countryCode?: string;
    stateCode?: string;
  };
  source: string;
}

const REQUIRED_FIELDS = ["city", "state", "country"] as const;
/**
 * Two lookups at most. This was [18, 16, 14, 12, 10].
 *
 * Nominatim's usage policy is an absolute maximum of ONE request per second
 * for a whole application. Five sequential lookups with no delay between them
 * meant a single map click could spend five seconds of the app's entire
 * global budget, and one "type a place, pick a result" flow put roughly eight
 * requests on the wire in about two seconds. Under real traffic that is not a
 * rate limit being approached, it is one being ignored - and Nominatim blocks
 * by IP, without notice, which would take out search and click-to-inspect
 * together.
 *
 * 18 answers almost every lookup on its own. Dropping straight to 12 for the
 * rare miss recovers city and state in one more call rather than three, which
 * removes about 60% of the outbound volume for a difference in address
 * completeness that no user has ever reported noticing.
 */
const ZOOM_FALLBACKS = [18, 12];

/**
 * Nominatim returns the ISO 3166-2 subdivision code under a key whose exact
 * name depends on which admin level it applies at ("ISO3166-2-lvl4",
 * "-lvl3", "-lvl6", ...) - there's no single fixed key. Scanning for the
 * first "ISO3166-2-lvl*" key present is the standard way to pick it up
 * regardless of which level it landed on for this particular place.
 */
function findIso3166_2(address: Record<string, string>): string | undefined {
  const key = Object.keys(address).find((k) => k.startsWith("ISO3166-2-lvl"));
  return key ? address[key] : undefined;
}

function toDto(lat: number, lon: number, r: NominatimResult): LocationDto {
  const a = r.address || {};
  return {
    lat,
    lon,
    displayName: r.display_name,
    name: r.name || a.city || a.town || a.village || r.display_name.split(",")[0]!.trim(),
    address: {
      houseNumber: a.house_number,
      road: a.road,
      suburb: a.suburb || a.neighbourhood,
      city: a.city || a.town || a.village,
      district: a.county || a.state_district,
      state: a.state,
      country: a.country,
      postcode: a.postcode,
      countryCode: a.country_code?.toUpperCase(),
      stateCode: findIso3166_2(a),
    },
    source: "OpenStreetMap / Nominatim",
  };
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return err(res, 400, "Query parameters 'lat' and 'lon' are required numbers.");
  }

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = cache.get(cacheKey);
  if (cached) return ok(res, { location: toDto(lat, lon, cached) });

  try {
    let merged: NominatimResult | null = null;

    for (const zoom of ZOOM_FALLBACKS) {
      const result = await nominatimReverse(lat, lon, zoom);
      if (!result) continue;

      if (!merged) {
        merged = result;
      } else {
        merged.address = { ...result.address, ...merged.address };
      }

      const hasAllRequired = REQUIRED_FIELDS.every((field) => merged?.address?.[field]);
      if (hasAllRequired) break;
    }

    if (!merged) {
      return err(res, 502, "Could not identify this location.", "NO_RESULT");
    }

    cache.set(cacheKey, merged);
    ok(res, { location: toDto(lat, lon, merged) });
  } catch (error) {
    console.error("[api/reverse-geocode]", error);
    err(res, 502, "Reverse geocoding is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
  }
};

// Private, not shared: this URL carries the visitor's exact coordinates.
export default withMaintenanceGuard(withPrivateCache(600)(handler));
