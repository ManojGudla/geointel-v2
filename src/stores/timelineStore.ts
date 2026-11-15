import { create } from "zustand";
import { clampGibsDate, timelineStops } from "@/features/timeline/gibs";

/**
 * Which archive the time slider steps through.
 *  - "sharp": Esri's past versions of the satellite map, building-level
 *    detail, about monthly since 2014. The default, because it is what
 *    people expect "historical imagery" to look like.
 *  - "nasa": NASA's daily 250 m mosaic since 2000. Only useful zoomed out,
 *    for reservoirs, coastlines, vegetation and city growth.
 */
export type HistorySource = "sharp" | "nasa";

interface TimelineState {
  enabled: boolean;
  source: HistorySource;
  /** Esri Wayback release number when source is "sharp"; null until the list has loaded. */
  release: number | null;
  /** ISO date (YYYY-MM-DD) of the NASA imagery being shown. */
  date: string;
  layerId: string;
  /** 0-1. Blends the historical imagery against the live basemap underneath. */
  opacity: number;
  toggle: () => void;
  setSource: (source: HistorySource) => void;
  setRelease: (release: number) => void;
  setDate: (date: string) => void;
  setLayer: (layerId: string) => void;
  setOpacity: (opacity: number) => void;
}

const STOPS = timelineStops();

export const useTimelineStore = create<TimelineState>((set) => ({
  enabled: false,
  source: "sharp",
  release: null,
  // Starts at the newest available imagery rather than the oldest: switching
  // the layer on should show something recognisable, and moving BACK in time
  // is the interesting direction to travel.
  date: STOPS[STOPS.length - 1]!,
  layerId: "truecolor",
  opacity: 1,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  setSource: (source) => set({ source }),
  setRelease: (release) => set({ release }),
  setDate: (date) => set({ date: clampGibsDate(date) }),
  setLayer: (layerId) => set({ layerId }),
  setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(0, opacity)) }),
}));
