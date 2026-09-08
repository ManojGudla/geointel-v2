import { create } from "zustand";
import type { RouteMode } from "@/types/intel";
import type { Location } from "@/types/location";

export type RoutePoint = Location | { lat: number; lon: number; displayName: string; name: string };

interface RouteState {
  from: RoutePoint | null;
  to: RoutePoint | null;
  mode: RouteMode;
  isPanelOpen: boolean;
  setFrom: (point: RoutePoint | null) => void;
  setTo: (point: RoutePoint | null) => void;
  setMode: (mode: RouteMode) => void;
  openPanel: (to?: RoutePoint) => void;
  closePanel: () => void;
}

export const useRouteStore = create<RouteState>((set) => ({
  from: null,
  to: null,
  mode: "car",
  isPanelOpen: false,
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  setMode: (mode) => set({ mode }),
  openPanel: (to) => set((s) => ({ isPanelOpen: true, to: to ?? s.to })),
  closePanel: () => set({ isPanelOpen: false }),
}));
