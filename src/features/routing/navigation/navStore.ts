import { create } from "zustand";
import type { Coord } from "./navMath";

export type NavState = "idle" | "locating" | "navigating" | "rerouting" | "arrived" | "denied" | "unavailable";

interface NavigationState {
  state: NavState;
  /** Raw GPS position, as reported. */
  position: Coord | null;
  /** Position snapped onto the route line — what the marker is drawn at. */
  snapped: Coord | null;
  /** Device-reported accuracy in metres, or null if it didn't say. */
  accuracyMeters: number | null;
  /** Device heading in degrees, or null. Used to rotate the map when moving. */
  heading: number | null;
  /** Speed in m/s, or null. */
  speed: number | null;
  /** Progress along the route. */
  currentStep: number;
  metresToNextTurn: number;
  metresRemaining: number;
  secondsRemaining: number;
  /** How far the last fix was from the route. Shown when it gets large. */
  offRouteMeters: number;
  /** Search hint for snapToRoute, so progress can only move forward. */
  searchFromIndex: number;
  /** Camera follows the user until they pan away, then a button brings it back. */
  following: boolean;
  /** Set when geolocation fails, so the UI can say what actually went wrong. */
  error: string | null;
  /** How many times this trip has been re-routed. Shown, not hidden. */
  rerouteCount: number;

  start: () => void;
  stop: () => void;
  setState: (state: NavState) => void;
  setError: (error: string | null) => void;
  setFollowing: (following: boolean) => void;
  update: (patch: Partial<NavigationState>) => void;
  noteReroute: () => void;
}

/**
 * Live navigation state.
 *
 * Kept in its own store rather than folded into routeStore because navigating
 * and planning are different activities with different lifetimes: you can
 * change the destination while planning, but a live trip has to survive panel
 * open/close, and stopping navigation must not clear the route you were
 * following.
 */
export const useNavigationStore = create<NavigationState>((set, get) => ({
  state: "idle",
  position: null,
  snapped: null,
  accuracyMeters: null,
  heading: null,
  speed: null,
  currentStep: 0,
  metresToNextTurn: 0,
  metresRemaining: 0,
  secondsRemaining: 0,
  offRouteMeters: 0,
  searchFromIndex: 0,
  following: true,
  error: null,
  rerouteCount: 0,

  start: () =>
    set({
      state: "locating",
      following: true,
      error: null,
      // A fresh trip starts from the beginning of the line, not wherever the
      // last one left off.
      searchFromIndex: 0,
      rerouteCount: 0,
      currentStep: 0,
    }),

  stop: () =>
    set({
      state: "idle",
      position: null,
      snapped: null,
      accuracyMeters: null,
      heading: null,
      speed: null,
      offRouteMeters: 0,
      searchFromIndex: 0,
      error: null,
    }),

  setState: (state) => set({ state }),
  setError: (error) => set({ error }),
  setFollowing: (following) => set({ following }),
  update: (patch) => set(patch),
  noteReroute: () => set({ rerouteCount: get().rerouteCount + 1, searchFromIndex: 0, state: "navigating" }),
}));
