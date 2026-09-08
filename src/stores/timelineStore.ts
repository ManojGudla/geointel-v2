import { create } from "zustand";
import { clampGibsDate, timelineStops } from "@/features/timeline/gibs";

interface TimelineState {
  enabled: boolean;
  /** ISO date (YYYY-MM-DD) of the imagery being shown. */
  date: string;
  layerId: string;
  /** 0–1. Blends the historical imagery against the live basemap underneath. */
  opacity: number;
  toggle: () => void;
  setDate: (date: string) => void;
  setLayer: (layerId: string) => void;
  setOpacity: (opacity: number) => void;
}

const STOPS = timelineStops();

export const useTimelineStore = create<TimelineState>((set) => ({
  enabled: false,
  // Starts at the newest available imagery rather than the oldest: switching
  // the layer on should show something recognisable, and moving BACK in time
  // is the interesting direction to travel.
  date: STOPS[STOPS.length - 1]!,
  layerId: "truecolor",
  opacity: 1,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  setDate: (date) => set({ date: clampGibsDate(date) }),
  setLayer: (layerId) => set({ layerId }),
  setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(0, opacity)) }),
}));
