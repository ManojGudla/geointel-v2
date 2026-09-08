import { useEffect, useRef } from "react";
import { useNavigationStore } from "./navStore";
import { useRouteStore } from "@/stores/routeStore";
import { useRoute } from "../useRoute";
import { isOffRoute, navProgress, snapToRoute, type Coord } from "./navMath";

/**
 * Live navigation: watches the real GPS, keeps the trip's progress up to
 * date, and asks for a new route when you leave the old one.
 *
 * Deliberate choices:
 *
 *  - `watchPosition` with `enableHighAccuracy`, not a polling loop. The
 *    browser wakes us when the device has a genuinely new fix; polling would
 *    burn battery and return the same cached fix over and over.
 *  - Progress can only move FORWARD along the line (searchFromIndex). A route
 *    that doubles back has two points equally near you, and without this the
 *    instruction jumps between them.
 *  - Off-route needs to be sustained before it triggers a reroute. One bad
 *    fix between two tall buildings is not a wrong turn, and re-routing on
 *    every stray reading would make the trip unusable in exactly the places
 *    GPS is worst.
 */

/** Consecutive off-route fixes before a reroute is triggered. */
const OFF_ROUTE_STRIKES = 3;
/** Never reroute more often than this, whatever the GPS is doing. */
const REROUTE_COOLDOWN_MS = 15_000;

export function useNavigation() {
  const state = useNavigationStore((s) => s.state);
  const update = useNavigationStore((s) => s.update);
  const setState = useNavigationStore((s) => s.setState);
  const setError = useNavigationStore((s) => s.setError);
  const noteReroute = useNavigationStore((s) => s.noteReroute);

  const selectedOption = useRouteStore((s) => s.selectedOption);
  const setFrom = useRouteStore((s) => s.setFrom);
  const routeQuery = useRoute();

  const option = routeQuery.data?.options?.[selectedOption] ?? routeQuery.data?.options?.[0];

  // Live values the watch callback needs, held in refs so changing them never
  // tears down and restarts the GPS watch (which would drop the first fix and
  // make navigation stutter every time a number updated).
  const optionRef = useRef(option);
  optionRef.current = option;
  const strikesRef = useRef(0);
  const lastRerouteRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== "navigating" && state !== "locating" && state !== "rerouting") {
      // Not navigating: make sure no watch is left running. A forgotten
      // geolocation watch keeps the GPS radio awake and drains the battery
      // long after the user thought they'd stopped.
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (watchIdRef.current !== null) return; // already watching

    if (!("geolocation" in navigator)) {
      setState("unavailable");
      setError("This browser can't provide your location.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (fix) => {
        const current = optionRef.current;
        const position: Coord = [fix.coords.longitude, fix.coords.latitude];

        const base = {
          position,
          accuracyMeters: fix.coords.accuracy ?? null,
          // Heading and speed are only present on a device that actually
          // moves; a desktop reports null and the map simply doesn't rotate.
          heading: Number.isFinite(fix.coords.heading) ? fix.coords.heading : null,
          speed: Number.isFinite(fix.coords.speed) ? fix.coords.speed : null,
        };

        if (!current || current.geometry.length < 2) {
          update({ ...base, snapped: position });
          setState("navigating");
          return;
        }

        const geometry = current.geometry as Coord[];
        const searchFrom = useNavigationStore.getState().searchFromIndex;
        const snapped = snapToRoute(position, geometry, searchFrom);

        if (!snapped) {
          update({ ...base, snapped: position });
          return;
        }

        const progress = navProgress(snapped, geometry, current.steps as never, current.durationSeconds);

        update({
          ...base,
          snapped: snapped.point,
          offRouteMeters: snapped.offRouteMeters,
          searchFromIndex: snapped.index,
          currentStep: progress.currentStep,
          metresToNextTurn: progress.metresToNextTurn,
          metresRemaining: progress.metresRemaining,
          secondsRemaining: progress.secondsRemaining,
        });

        if (progress.arrived) {
          setState("arrived");
          return;
        }

        // Off-route → reroute, but only once it's clearly not GPS noise and
        // not more often than the cooldown allows.
        if (isOffRoute(snapped.offRouteMeters, base.accuracyMeters)) {
          strikesRef.current += 1;
          const cooledDown = Date.now() - lastRerouteRef.current > REROUTE_COOLDOWN_MS;
          if (strikesRef.current >= OFF_ROUTE_STRIKES && cooledDown) {
            strikesRef.current = 0;
            lastRerouteRef.current = Date.now();
            setState("rerouting");
            // Moving the trip's start to where you actually are re-runs the
            // route query through its existing key — a real new route from
            // the provider, not a guess at how to patch the old one.
            setFrom({
              lat: position[1],
              lon: position[0],
              displayName: "Current location",
              name: "Current location",
            });
            noteReroute();
          }
        } else {
          strikesRef.current = 0;
          if (useNavigationStore.getState().state !== "navigating") setState("navigating");
        }
      },
      (error) => {
        // Each case gets its own sentence, because "location error" tells the
        // user nothing about what to do next.
        if (error.code === error.PERMISSION_DENIED) {
          setState("denied");
          setError("Location permission was denied. Allow it in your browser's site settings to navigate.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setState("unavailable");
          setError("Your position isn't available right now — GPS may be blocked indoors.");
        } else {
          setState("unavailable");
          setError("Couldn't get your location in time. Try again outdoors or near a window.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [state, update, setState, setError, noteReroute, setFrom]);

  // Belt and braces: clear the watch if this hook unmounts for any reason.
  useEffect(
    () => () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    },
    []
  );
}
