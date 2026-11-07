import { apiGet } from "@/services/apiClient";
import { track } from "@/services/analytics";
import type { RouteResult, RouteMode } from "@/types/intel";

export async function fetchRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: RouteMode,
  signal?: AbortSignal
): Promise<RouteResult> {
  const started = Date.now();
  const { route } = await apiGet<{ route: RouteResult }>(
    "/api/route",
    { fromLat: from.lat, fromLon: from.lon, toLat: to.lat, toLon: to.lon, mode },
    signal
  );
  track("route_started", { mode, durationMs: Date.now() - started });
  return route;
}
