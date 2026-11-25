import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useSearchStore } from "@/stores/searchStore";
import type { AgentAnchor } from "@/types/ai";

interface Point {
  lat: number;
  lon: number;
}

/**
 * Where the agents should look, and nothing else.
 *
 * The agents used to be sent the panels' own data (counts, weather, route,
 * officials) and repeated it as verified fact. They now get only the place,
 * the radius, the planned route's two ends and the search text; the server
 * fetches every fact itself (api/_lib/evidence/gather.ts).
 */
export function buildAgentAnchor(
  location: Point | null,
  radiusMeters: number | undefined,
  route: { from: Point | null; to: Point | null; mode: "car" | "walk" | "bike" },
  query: string
): AgentAnchor | null {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return null;
  const anchor: AgentAnchor = { lat: location.lat, lon: location.lon };
  if (radiusMeters && Number.isFinite(radiusMeters)) anchor.radiusMeters = radiusMeters;
  if (route.from && route.to) {
    anchor.route = { fromLat: route.from.lat, fromLon: route.from.lon, toLat: route.to.lat, toLon: route.to.lon, mode: route.mode };
  }
  if (query.trim()) anchor.query = query.trim().slice(0, 200);
  return anchor;
}

export function useAgentAnchor(): AgentAnchor | null {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const from = useRouteStore((s) => s.from);
  const to = useRouteStore((s) => s.to);
  const mode = useRouteStore((s) => s.mode);
  const query = useSearchStore((s) => s.query);
  return buildAgentAnchor(location, radiusMeters, { from, to, mode }, query);
}
