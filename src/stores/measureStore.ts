import { create } from "zustand";
import { track } from "@/services/analytics";

export type MeasureMode = "off" | "distance" | "area";

interface MeasureState {
  mode: MeasureMode;
  points: Array<[number, number]>; // [lon, lat], in click order
  setMode: (mode: MeasureMode) => void;
  addPoint: (point: [number, number]) => void;
  undoPoint: () => void;
  /** Moves one existing vertex - what dragging a point on the map does. */
  movePoint: (index: number, point: [number, number]) => void;
  clear: () => void;
}

/**
 * Drives the map's measurement overlay (MeasureToolbar.tsx / MapView.tsx).
 * Read imperatively via useMeasureStore.getState() inside MapView's
 * once-created click handlers (same pattern as every other map-click
 * decision in that file), and reactively via selectors in the toolbar and
 * the preview-sync effect.
 */
/**
 * A measurement has no "done" button - points are added until the user
 * switches mode, closes the tool or clears it. So that is when it is
 * counted: a distance with two or more points, an area with three or more.
 * The point count is sent, never the points.
 */
function countMeasurement(mode: MeasureMode, points: Array<[number, number]>) {
  if (mode === "distance" && points.length >= 2) track("distance_measured", { pointCount: points.length });
  if (mode === "area" && points.length >= 3) track("area_measured", { pointCount: points.length });
}

export const useMeasureStore = create<MeasureState>((set, get) => ({
  mode: "off",
  points: [],
  setMode: (mode) => {
    countMeasurement(get().mode, get().points);
    set({ mode, points: [] });
  },
  addPoint: (point) => set((s) => ({ points: [...s.points, point] })),
  undoPoint: () => set((s) => ({ points: s.points.slice(0, -1) })),
  movePoint: (index, point) =>
    set((s) => (index < 0 || index >= s.points.length ? s : { points: s.points.map((p, i) => (i === index ? point : p)) })),
  clear: () => {
    countMeasurement(get().mode, get().points);
    set({ points: [] });
  },
}));
