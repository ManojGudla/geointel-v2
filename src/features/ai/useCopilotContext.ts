import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useRoute } from "@/features/routing/useRoute";
import { analyzeProperty } from "@/features/property/propertyAnalyzer";
import { fetchWeather, fetchNearby } from "@/services/intel";
import { useOfficials } from "@/features/officials/useOfficials";
import type { CopilotContext } from "@/types/ai";

/**
 * Assembles the same "current location data" block the Copilot and every
 * AI agent are grounded in, from the real queries/stores already powering
 * the on-screen panels — the AI layer never fetches its own separate copy
 * of location data, it only reasons over what's already verified and shown.
 */
export function useCopilotContext(): CopilotContext {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  // Reported bug: the Navigation agent (and Copilot questions about
  // directions) would say "no route set" even for a route the user had
  // already planned, as soon as they closed the Directions panel — closing
  // it only sets isPanelOpen: false, it doesn't clear from/to (see
  // routeStore.ts's closePanel()), so a real, still-active route existed
  // but the AI layer couldn't see it. Gate on whether a route is actually
  // set (from && to), not on whether the panel happens to be open right
  // now — the two are unrelated once you've already planned a trip.
  const route = useRouteStore((s) => (s.from && s.to ? { from: s.from, to: s.to, mode: s.mode } : null));

  const gisQuery = useGisEvidence();
  const routeQuery = useRoute();
  const officialsQuery = useOfficials();

  const weatherQuery = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchWeather(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 10 * 60 * 1000,
  });

  const nearbyQuery = useQuery({
    queryKey: ["nearby", location?.lat, location?.lon, "all"],
    queryFn: ({ signal }) => fetchNearby(location!.lat, location!.lon, 1500, undefined, signal),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo<CopilotContext>(() => {
    const property = gisQuery.data ? analyzeProperty(gisQuery.data) : undefined;

    const nearbyTopCategories = nearbyQuery.data
      ? Object.entries(
          nearbyQuery.data.reduce<Record<string, number>>((acc, item) => {
            acc[item.category] = (acc[item.category] ?? 0) + 1;
            return acc;
          }, {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, count]) => ({ category, count }))
      : undefined;

    return {
      locationName: location?.name,
      address: location?.displayName,
      property: property
        ? { classification: property.classification, confidence: property.confidence, trust: property.trust, reasoning: property.reasoning }
        : undefined,
      gis: gisQuery.data ? { radiusMeters, counts: gisQuery.data.counts, scores: gisQuery.data.scores } : undefined,
      weather: weatherQuery.data ? { temperatureC: weatherQuery.data.temperatureC, condition: weatherQuery.data.condition } : undefined,
      nearbyTopCategories,
      route: route?.from && route?.to && routeQuery.data
        ? { mode: routeQuery.data.mode, distanceMeters: routeQuery.data.distanceMeters, durationSeconds: routeQuery.data.durationSeconds }
        : undefined,
      officials: officialsQuery.data?.map((o) => ({
        level: o.level,
        role: o.role,
        name: o.name,
        status: o.status,
        since: o.since,
        sourceLabel: o.sourceLabel,
      })),
    };
  }, [location, radiusMeters, gisQuery.data, weatherQuery.data, nearbyQuery.data, route, routeQuery.data, officialsQuery.data]);
}
