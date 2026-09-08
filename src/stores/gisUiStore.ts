import { create } from "zustand";
import type { GISLayerId } from "@/types/gis";
import { LAYER_DEFS } from "@/features/gis/layerBuckets";

interface GisUiState {
  visibility: Record<GISLayerId, boolean>;
  opacity: number;
  toggleLayer: (id: GISLayerId) => void;
  /**
   * Switches specific layers on without touching the others.
   *
   * This is how an analysis makes its own evidence visible: asking for
   * hospitals within 5 km and getting a result list while the hospital layer
   * stays switched off is the exact "the AI says one thing, the map shows
   * another" split that makes a tool feel untrustworthy. Additive rather
   * than replacing the whole set, so running an analysis never silently
   * turns off layers the user deliberately chose.
   */
  showLayers: (ids: GISLayerId[]) => void;
  setOpacity: (opacity: number) => void;
  /** Back to the starting set — the "Reset" in the active-analysis controls. */
  resetLayers: () => void;
}

const DEFAULT_VISIBLE: GISLayerId[] = ["buildings", "shops", "offices", "amenities"];

function defaultVisibility(): Record<GISLayerId, boolean> {
  return Object.fromEntries(LAYER_DEFS.map((l) => [l.id, DEFAULT_VISIBLE.includes(l.id)])) as Record<GISLayerId, boolean>;
}

export const useGisUiStore = create<GisUiState>((set) => ({
  visibility: defaultVisibility(),
  opacity: 0.85,
  toggleLayer: (id) => set((s) => ({ visibility: { ...s.visibility, [id]: !s.visibility[id] } })),
  showLayers: (ids) =>
    set((s) => {
      const visibility = { ...s.visibility };
      for (const id of ids) {
        // Layers marked unavailable in LAYER_DEFS render nothing, so turning
        // one on would produce a checked box with no effect on the map.
        if (LAYER_DEFS.some((l) => l.id === id && l.available)) visibility[id] = true;
      }
      return { visibility };
    }),
  setOpacity: (opacity) => set({ opacity }),
  resetLayers: () => set({ visibility: defaultVisibility() }),
}));
