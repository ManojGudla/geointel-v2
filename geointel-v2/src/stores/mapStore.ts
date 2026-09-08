import { create } from "zustand";
import { useUiStore } from "@/stores/uiStore";

export type Basemap = "standard" | "satellite" | "dark" | "terrain";

interface MapState {
  center: [number, number]; // [lon, lat]
  zoom: number;
  basemap: Basemap;
  is3D: boolean;
  setCenter: (center: [number, number], zoom?: number) => void;
  setBasemap: (basemap: Basemap) => void;
  toggle3D: () => void;
}

// Default view: India-wide, matching the product's primary market until a
// location is selected or "Use My Location" is used.
const DEFAULT_CENTER: [number, number] = [78.4867, 17.385];

export const useMapStore = create<MapState>((set, get) => ({
  center: DEFAULT_CENTER,
  zoom: 12,
  basemap: "standard",
  is3D: useUiStore.getState().is3DMapEnabled,
  setCenter: (center, zoom) => set({ center, zoom: zoom ?? get().zoom }),
  setBasemap: (basemap) => set({ basemap }),
  toggle3D: () => set((s) => ({ is3D: !s.is3D })),
}));
