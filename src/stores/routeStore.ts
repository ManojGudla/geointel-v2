import { create } from "zustand";
import type { RouteMode } from "@/types/intel";
import type { Location } from "@/types/location";

export type RoutePoint = Location | { lat: number; lon: number; displayName: string; name: string };

interface RouteState {
  from: RoutePoint | null;
  to: RoutePoint | null;
  mode: RouteMode;
  isPanelOpen: boolean;
  /**
   * Which of the returned route options is being shown. OSRM returns the
   * fastest at index 0 plus alternatives; picking one has to change both the
   * step list AND the line drawn on the map, so it lives here rather than in
   * the panel's local state where the map couldn't see it.
   */
  selectedOption: number;
  /**
   * The turn currently being looked at, or null. Set by tapping a step; read
   * by MapView to fly there and mark it. This is what makes the directions
   * interactive rather than a printed list.
   */
  activeStep: number | null;
  setFrom: (point: RoutePoint | null) => void;
  setTo: (point: RoutePoint | null) => void;
  setMode: (mode: RouteMode) => void;
  setSelectedOption: (index: number) => void;
  setActiveStep: (index: number | null) => void;
  swap: () => void;
  openPanel: (to?: RoutePoint) => void;
  closePanel: () => void;
  clear: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  from: null,
  to: null,
  mode: "car",
  isPanelOpen: false,
  selectedOption: 0,
  activeStep: null,

  // Changing an endpoint or the mode invalidates which option and which step
  // you were looking at - index 2 of the old result means nothing in the new
  // one, and leaving it set would highlight an unrelated turn.
  setFrom: (from) => set({ from, selectedOption: 0, activeStep: null }),
  setTo: (to) => set({ to, selectedOption: 0, activeStep: null }),
  setMode: (mode) => set({ mode, selectedOption: 0, activeStep: null }),

  setSelectedOption: (selectedOption) => set({ selectedOption, activeStep: null }),
  setActiveStep: (activeStep) => set({ activeStep }),

  swap: () => {
    const { from, to } = get();
    set({ from: to, to: from, selectedOption: 0, activeStep: null });
  },

  openPanel: (to) => set((s) => ({ isPanelOpen: true, to: to ?? s.to, activeStep: null })),
  closePanel: () => set({ isPanelOpen: false, activeStep: null }),
  clear: () => set({ from: null, to: null, selectedOption: 0, activeStep: null }),
}));
