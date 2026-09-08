import type { ApiHandler } from "./_lib/http";
import { ok, err, getQueryParam, getClientIp } from "./_lib/http";
import { TtlCache, RateLimiter } from "./_lib/cache";
import { nominatimReverse, type NominatimResult } from "./_lib/nominatim";

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
  };
  source: string;
}

const REQUIRED_FIELDS = ["city", "state", "country"] as const;
// Zoom out progressively if the first (precise) lookup is missing key
// address fields — a building-level reverse geocode sometimes omits city/
// state that only appear at a coarser zoom.
const ZOOM_FALLBACKS = [18, 16, 14, 12, 10];

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

export default handler;
