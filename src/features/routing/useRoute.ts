import { useQuery } from "@tanstack/react-query";
import { fetchRoute } from "@/services/route";
import { useRouteStore } from "@/stores/routeStore";

/**
 * Shared by DirectionsPanel (reads the result to show distance/duration)
 * and MapView (reads the geometry to draw the line) - same TanStack Query
 * key means both get the same cached response with a single network call.
 */
export function useRoute() {
  const from = useRouteStore((s) => s.from);
  const to = useRouteStore((s) => s.to);
  const mode = useRouteStore((s) => s.mode);

  return useQuery({
    queryKey: ["route", from?.lat, from?.lon, to?.lat, to?.lon, mode],
    queryFn: ({ signal }) => fetchRoute({ lat: from!.lat, lon: from!.lon }, { lat: to!.lat, lon: to!.lon }, mode, signal),
    enabled: !!from && !!to,
    staleTime: 60_000,
  });
}
