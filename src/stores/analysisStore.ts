import { create } from "zustand";
import type { SuitabilityFactor } from "@/features/analysis/spatialMath";

/**
 * The result of the most recent spatial analysis, held here so the map can
 * draw it while the panel that produced it explains it - and so it survives
 * the panel being closed. Only one analysis is live at a time on purpose: a
 * map carrying three overlapping result sets stops communicating anything.
 */
export interface AnalysisPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  distanceMeters: number;
}

export interface AnalysisResult {
  kind: "buffer" | "within" | "nearest" | "suitability";
  title: string;
  origin: { lat: number; lon: number };
  /** Draws a ring on the map when set. */
  bufferMeters?: number;
  points: AnalysisPoint[];
  /** A straight line from origin to a single result - used by "nearest". */
  connector?: [[number, number], [number, number]];
  stats: Array<{ label: string; value: string }>;
  suitability?: { score: number; band: string; factors: SuitabilityFactor[] };
  /**
   * Which map layers this analysis switched on, so the panel can show what
   * it changed rather than silently altering the map underneath the user.
   */
  layersUsed?: string[];
  /** Where the numbers came from. Always rendered; never optional in the UI. */
  note: string;
}

interface AnalysisState {
  result: AnalysisResult | null;
  status: "idle" | "running" | "error";
  error: string | null;
  setRunning: () => void;
  setResult: (result: AnalysisResult) => void;
  setError: (message: string) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  result: null,
  status: "idle",
  error: null,
  setRunning: () => set({ status: "running", error: null }),
  setResult: (result) => set({ result, status: "idle", error: null }),
  setError: (error) => set({ status: "error", error }),
  clear: () => set({ result: null, status: "idle", error: null }),
}));
