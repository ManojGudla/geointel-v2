import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withPrivateCache } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout } from "../_lib/cache.js";

// Multiple free OSRM-compatible mirrors, tried in order — the same
// multi-provider failover pattern used for search/GIS.
const ROUTERS: Record<string, string[]> = {
  car: ["https://routing.openstreetmap.de/routed-car/route/v1/driving", "https://router.project-osrm.org/route/v1/driving"],
  walk: ["https://routing.openstreetmap.de/routed-foot/route/v1/foot"],
  bike: ["https://routing.openstreetmap.de/routed-bike/route/v1/bike"],
};

const cache = new TtlCache<unknown>(60 * 1000);
const limiter = new RateLimiter(60_000, 20);

interface OsrmManeuver {
  type: string;
  modifier?: string;
  exit?: number;
  /** [lon, lat] — where the manoeuvre happens. */
  location?: [number, number];
}

interface OsrmStep {
  distance: number;
  duration?: number;
  name?: string;
  maneuver: OsrmManeuver;
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: Array<[number, number]> };
  legs?: OsrmLeg[];
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

const MODIFIER_TEXT: Record<string, string> = {
  uturn: "and make a U-turn",
  "sharp right": "sharp right",
  right: "right",
  "slight right": "slightly right",
  straight: "straight ahead",
  "slight left": "slightly left",
  left: "left",
  "sharp left": "sharp left",
};

/**
 * Turns one OSRM step's `maneuver` (a {type, modifier} pair from a fixed,
 * documented vocabulary — https://project-osrm.org/docs/.../StepManeuver)
 * into a human sentence. Never invents a street name or direction that
 * isn't in the maneuver/step data itself.
 */
function describeStep(step: OsrmStep): string {
  const { maneuver, name } = step;
  const streetPart = name ? ` onto ${name}` : "";
  const mod = maneuver.modifier ? MODIFIER_TEXT[maneuver.modifier] ?? maneuver.modifier : "";

  switch (maneuver.type) {
    case "depart":
      return `Head${mod ? ` ${mod}` : ""}${streetPart}`.trim() || "Start your route";
    case "arrive":
      return "Arrive at your destination";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return `At the roundabout, take exit ${maneuver.exit ?? "1"}${streetPart}`.trim();
    case "turn":
      return `Turn ${mod || "onto the road"}${streetPart}`.trim();
    case "merge":
      return `Merge${mod ? ` ${mod}` : ""}${streetPart}`.trim();
    case "fork":
      return `Keep ${mod || "straight ahead"}${streetPart}`.trim();
    case "end of road":
      return `Turn ${mod || "onto the road"}${streetPart}`.trim();
    case "use lane":
      return `Continue${streetPart}`.trim();
    case "continue":
    case "new name":
      return `Continue${mod ? ` ${mod}` : ""}${streetPart}`.trim();
    default:
      return `Continue${streetPart}`.trim();
  }
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
  // Object.hasOwn, not a plain lookup: `?mode=constructor` walks the
  // prototype chain, passes a truthy check, and then throws "not iterable"
  // at the for-of below, which sits outside the try.
  const routers = Object.hasOwn(ROUTERS, mode) ? ROUTERS[mode] : undefined;
  if (!routers) return err(res, 400, `Unknown travel mode '${mode}'. Use car, walk or bike.`);

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many routing requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${mode}:${fromLat.toFixed(5)},${fromLon.toFixed(5)}->${toLat.toFixed(5)},${toLon.toFixed(5)}`;
  const cached = cache.get(cacheKey) as OsrmResponse | undefined;
  let data = cached;
  let source = "";

  if (!data) {
    let lastError = "";
    for (const base of routers) {
      try {
        const url = `${base}/${fromLon},${fromLat};${toLon},${toLat}?alternatives=true&steps=true&geometries=geojson&overview=full`;
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

  const routes = data.routes!;
  const primary = routes[0]!;

  /**
   * Flattens every leg's steps into one ordered list. There's only ever one
   * leg for a simple from->to route, but multi-leg still works. Zero-distance
   * "notification" steps are dropped (OSRM emits them) so the list isn't a
   * wall of near-duplicates — except "arrive", which is always the last thing
   * you want to read.
   */
  const stepsOf = (route: OsrmRoute) =>
    (route.legs ?? [])
      .flatMap((leg) => leg.steps ?? [])
      .filter((step) => step.maneuver.type === "arrive" || step.distance > 0)
      .map((step) => ({
        instruction: describeStep(step),
        distanceMeters: Math.round(step.distance),
        durationSeconds: Math.round(step.duration ?? 0),
        // Falls back to the route's own first coordinate rather than a made-up
        // point, so a step always has somewhere real to fly to.
        location: step.maneuver.location ?? route.geometry.coordinates[0] ?? [0, 0],
        type: step.maneuver.type,
        modifier: step.maneuver.modifier,
      }));

  /**
   * How each alternative differs from the fastest one, in the words a person
   * would use. Computed from the real numbers — never a generic label like
   * "scenic route", which OSRM does not tell us and we would be inventing.
   */
  const summarise = (route: OsrmRoute, index: number): string => {
    if (index === 0) return "Fastest";
    const dt = Math.round((route.duration - primary.duration) / 60);
    const dd = (route.distance - primary.distance) / 1000;
    const parts: string[] = [];
    if (Math.abs(dt) >= 1) parts.push(`${Math.abs(dt)} min ${dt > 0 ? "slower" : "faster"}`);
    if (Math.abs(dd) >= 0.1) parts.push(`${Math.abs(dd).toFixed(1)} km ${dd > 0 ? "longer" : "shorter"}`);
    return parts.length ? parts.join(" · ") : "About the same";
  };

  const options = routes.map((route, index) => ({
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    geometry: route.geometry.coordinates,
    steps: stepsOf(route),
    summary: summarise(route, index),
  }));

  ok(res, {
    route: {
      mode,
      distanceMeters: options[0]!.distanceMeters,
      durationSeconds: options[0]!.durationSeconds,
      geometry: options[0]!.geometry,
      alternatives: routes.length - 1,
      source: source || "OSRM",
      steps: options[0]!.steps,
      options,
    },
  });
};

// Private, not shared: this URL carries where the visitor is and where they
// are going.
export default withMaintenanceGuard(withPrivateCache(60)(handler));
