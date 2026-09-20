import { create } from "zustand";

/**
 * Which live layers are switched on.
 *
 * All off by default, deliberately. A map that opens with earthquakes,
 * radar and air quality already drawn over it is a busier map, not a more
 * capable one - the point of a layer switch is that the user decides what
 * the map is about right now.
 */
export type LiveLayerId = "earthquakes" | "radar";

interface LiveLayerState {
  enabled: Record<LiveLayerId, boolean>;
  /** "day" = every quake in the last 24h; "week" = magnitude 2.5+ over 7 days. */
  quakeWindow: "day" | "week";
  toggle: (id: LiveLayerId) => void;
  setQuakeWindow: (window: "day" | "week") => void;
}

export const useLiveLayerStore = create<LiveLayerState>((set) => ({
  enabled: { earthquakes: false, radar: false },
  quakeWindow: "day",
  toggle: (id) => set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
  setQuakeWindow: (quakeWindow) => set({ quakeWindow }),
}));
