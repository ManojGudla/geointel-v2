import type { ApiHandler } from "./_lib/http";
import { ok, err, getQueryParam, getClientIp } from "./_lib/http";
import { TtlCache, RateLimiter, fetchWithTimeout } from "./_lib/cache";

// Multiple free OSRM-compatible mirrors, tried in order — the same
// multi-provider failover pattern used for search/GIS.
const ROUTERS: Record<string, string[]> = {
  car: ["https://routing.openstreetmap.de/routed-car/route/v1/driving", "https://router.project-osrm.org/route/v1/driving"],
  walk: ["https://routing.openstreetmap.de/routed-foot/route/v1/foot"],
  bike: ["https://routing.openstreetmap.de/routed-bike/route/v1/bike"],
};

const cache = new TtlCache<unknown>(60 * 1000);
const limiter = new RateLimiter(60_000, 20);

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
  }>;
}

const handler: ApiHandler = async (req, res) => {
  const fromLat = Number(getQueryParam(req, "fromLat"));
  const fromLon = Number(getQueryParam(req, "fromLon"));
  const toLat = Number(getQueryParam(req, "toLat"));
  const toLon = Number(getQueryParam(req, "toLon"));
  const mode = (getQueryParam(req, "mode") || "car") as keyof typeof ROUTERS;

  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return err(res, 400, "fromLat, fromLon, toLat and toLon are required numbers.");
  }
  if (!ROUTERS[mode]) return err(res, 400, `Unknown travel mode '${mode}'. Use car, walk or bike.`);

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many routing requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${mode}:${fromLat.toFixed(5)},${fromLon.toFixed(5)}->${toLat.toFixed(5)},${toLon.toFixed(5)}`;
  const cached = cache.get(cacheKey) as OsrmResponse | undefined;
  let data = cached;
  let source = "";

  if (!data) {
    let lastError = "";
    for (const base of ROUTERS[mode]) {
      try {
        const url = `${base}/${fromLon},${fromLat};${toLon},${toLat}?alternatives=true&steps=false&geometries=geojson&overview=full`;
        const response = await fetchWithTimeout(url, {}, 12_000);
        if (!response.ok) {
          lastError = `${base} returned HTTP ${response.status}`;
          continue;
        }
        const json = (await response.json()) as OsrmResponse;
        if (json.code !== "Ok" || !json.routes?.length) {
          lastError = `${base} returned no route (${json.code})`;
          continue;
        }
        data = json;
        source = new URL(base).hostname;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : `${base} request failed`;
      }
    }

    if (!data) {
      console.error("[api/route]", lastError);
      return err(res, 502, "Routing is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
    }
    cache.set(cacheKey, data);
  }

  const primary = data.routes![0]!;

  ok(res, {
    route: {
      mode,
      distanceMeters: Math.round(primary.distance),
      durationSeconds: Math.round(primary.duration),
      geometry: primary.geometry.coordinates,
      alternatives: data.routes!.length - 1,
      source: source || "OSRM",
    },
  });
};

export default handler;
