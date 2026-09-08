import { create } from "zustand";

export type MeasureMode = "off" | "distance" | "area";

interface MeasureState {
  mode: MeasureMode;
  points: Array<[number, number]>; // [lon, lat], in click order
  setMode: (mode: MeasureMode) => void;
  addPoint: (point: [number, number]) => void;
  undoPoint: () => void;
  clear: () => void;
}

/**
 * Drives the map's measurement overlay (MeasureToolbar.tsx / MapView.tsx).
 * Read imperatively via useMeasureStore.getState() inside MapView's
 * once-created click handlers (same pattern as every other map-click
 * decision in that file), and reactively via selectors in the toolbar and
 * the preview-sync effect.
 */
export const useMeasureStore = create<MeasureState>((set) => ({
  mode: "off",
  points: [],
  setMode: (mode) => set({ mode, points: [] }),
  addPoint: (point) => set((s) => ({ points: [...s.points, point] })),
  undoPoint: () => set((s) => ({ points: s.points.slice(0, -1) })),
  clear: () => set({ points: [] }),
}));
