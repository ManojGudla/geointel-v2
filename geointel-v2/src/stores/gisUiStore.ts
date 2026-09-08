import { create } from "zustand";
import type { GISLayerId } from "@/types/gis";
import { LAYER_DEFS } from "@/features/gis/layerBuckets";

interface GisUiState {
  visibility: Record<GISLayerId, boolean>;
  opacity: number;
  toggleLayer: (id: GISLayerId) => void;
  setOpacity: (opacity: number) => void;
}

const DEFAULT_VISIBLE: GISLayerId[] = ["buildings", "shops", "offices", "amenities"];

export const useGisUiStore = create<GisUiState>((set) => ({
  visibility: Object.fromEntries(LAYER_DEFS.map((l) => [l.id, DEFAULT_VISIBLE.includes(l.id)])) as Record<GISLayerId, boolean>,
  opacity: 0.85,
  toggleLayer: (id) => set((s) => ({ visibility: { ...s.visibility, [id]: !s.visibility[id] } })),
  setOpacity: (opacity) => set({ opacity }),
}));
