import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useRoute } from "@/features/routing/useRoute";
import { analyzeProperty } from "@/features/property/propertyAnalyzer";
import { fetchWeather, fetchNearbyResult } from "@/services/intel";
import { useOfficials } from "@/features/officials/useOfficials";
import type { CopilotContext } from "@/types/ai";

/**
 * Which of the underlying sources have not produced anything yet.
 *
 * This exists because of a failure seen on the live site: the GIS agent was
 * run on Banjara Hills and answered "the data provided only contains the
 * location address and current weather, with no GIS evidence counts, POI
 * categories, or built-environment scores available to analyze" - while the
 * map beside it read "161 things mapped within 250 m" and was covered in
 * evidence dots.
 *
 * Nothing was broken. Weather comes from Open-Meteo and lands in a moment;
 * GIS evidence comes from Overpass and takes seconds. The agent fired in
 * between, was handed a context with the GIS half still missing, and
 * correctly reported what it had been given. The answer then sat on the card
 * permanently, describing a gap that had closed two seconds later.
 *
 * The guardrails did their job - it said "I don't have this" instead of
 * inventing counts. The bug is that it was asked at all.
 */

/** The nearby search behind the AI's "what's around here". */
const NEARBY_CONTEXT_RADIUS_M = 1500;
/** api/_routes/nearby.ts returns at most this many places, closest first. */
const NEARBY_RESULT_CAP = 60;

export interface ContextPending {
  gis: boolean;
  weather: boolean;
  nearby: boolean;
  route: boolean;
  officials: boolean;
}

/**
 * `isLoading` is the right signal and `isPending` is not: a query that is
 * disabled (no location, no route set) is pending forever and would block
 * every agent permanently. isLoading is pending AND actually in flight, so
 * a disabled or already-settled query reads as ready - including one that
 * settled with an error, which must not be able to hold an agent hostage.
 */
export function useCopilotContextState(): { context: CopilotContext; pending: ContextPending } {
  const context = useCopilotContext();
  const gisQuery = useGisEvidence();
  const routeQuery = useRoute();
  const officialsQuery = useOfficials();
  const location = useLocationStore((s) => s.selectedLocation);

  /*
    These two repeat the query options above rather than sharing a hook.
    TanStack dedupes on the key, so this observes the same query instance and
    makes no second request - but the keys and the `enabled` flags have to
    stay identical to the ones in useCopilotContext, or this would watch a
    query nothing else is running and report "loading" forever.
  */
  const weatherQuery = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchWeather(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 10 * 60 * 1000,
  });
  const nearbyQuery = useQuery({
    queryKey: ["nearby", location?.lat, location?.lon, "all"],
    queryFn: ({ signal }) => fetchNearbyResult(location!.lat, location!.lon, NEARBY_CONTEXT_RADIUS_M, undefined, signal),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
  });

  return {
    context,
    pending: {
      gis: gisQuery.isLoading,
      weather: weatherQuery.isLoading,
      nearby: nearbyQuery.isLoading,
      route: routeQuery.isLoading,
      officials: officialsQuery.isLoading,
    },
  };
}

/**
 * Assembles the same "current location data" block the Copilot and every
 * AI agent are grounded in, from the real queries/stores already powering
 * the on-screen panels - the AI layer never fetches its own separate copy
 * of location data, it only reasons over what's already verified and shown.
 */
export function useCopilotContext(): CopilotContext {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  // Reported bug: the Navigation agent (and Copilot questions about
  // directions) would say "no route set" even for a route the user had
  // already planned, as soon as they closed the Directions panel - closing
  // it only sets isPanelOpen: false, it doesn't clear from/to (see
  // routeStore.ts's closePanel()), so a real, still-active route existed
  // but the AI layer couldn't see it. Gate on whether a route is actually
  // set (from && to), not on whether the panel happens to be open right
  // now - the two are unrelated once you've already planned a trip.
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
    queryFn: ({ signal }) => fetchNearbyResult(location!.lat, location!.lon, NEARBY_CONTEXT_RADIUS_M, undefined, signal),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo<CopilotContext>(() => {
    const property = gisQuery.data ? analyzeProperty(gisQuery.data) : undefined;

    const nearbyItems = nearbyQuery.data?.items;
    const nearbyTopCategories = nearbyItems
      ? Object.entries(
          nearbyItems.reduce<Record<string, number>>((acc, item) => {
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
      // The radius actually searched (it widens where mapping is sparse) and
      // whether the list was cut off, so a sample is never read as a count.
      nearbyRadiusMeters: nearbyQuery.data?.radiusMeters,
      nearbyCapped: (nearbyItems?.length ?? 0) >= NEARBY_RESULT_CAP,
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
