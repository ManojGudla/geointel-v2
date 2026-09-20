import { create } from "zustand";
import { useUiStore } from "@/stores/uiStore";

export type Basemap = "standard" | "satellite" | "dark" | "terrain";

export interface ViewportBbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface MapState {
  center: [number, number]; // [lon, lat]
  zoom: number;
  basemap: Basemap;
  is3D: boolean;
  /**
   * The map's current visible bounds. Lives here rather than as local state
   * inside MapView because the 3D buildings query is keyed on it, and panels
   * outside the map (the Layers section's buildings status) need to observe
   * that same query to explain why buildings are or aren't showing. React
   * Query dedupes the two subscriptions into one request.
   */
  viewportBbox: ViewportBbox | null;
  /**
   * A request for the map camera to move, made from outside the map.
   *
   * Panels can't call map.easeTo() - the MapLibre instance is private to
   * MapView - so this is the channel for "zoom in far enough to load
   * buildings", "frame these analysis results", and anything else that has
   * to drive the camera from a control that lives elsewhere. `nonce` makes
   * every request distinct, so asking for the same camera twice still moves
   * the map instead of being swallowed as an unchanged value.
   */
  cameraRequest: { center?: [number, number]; zoom?: number; pitch?: number; nonce: number } | null;
  setCenter: (center: [number, number], zoom?: number) => void;
  setViewportBbox: (bbox: ViewportBbox) => void;
  requestCamera: (request: { center?: [number, number]; zoom?: number; pitch?: number }) => void;
  setBasemap: (basemap: Basemap) => void;
  toggle3D: () => void;
  /**
   * Sets 3D to an explicit value rather than flipping it. A voice/text
   * command like "turn on 3D" must be idempotent - toggling would switch it
   * OFF if it happened to be on already, which is the opposite of what was
   * asked.
   */
  set3D: (is3D: boolean) => void;
}

// Default view: India-wide, matching the product's primary market until a
// location is selected or "Use My Location" is used.
const DEFAULT_CENTER: [number, number] = [78.4867, 17.385];

export const useMapStore = create<MapState>((set, get) => ({
  center: DEFAULT_CENTER,
  zoom: 12,
  basemap: "standard",
  is3D: useUiStore.getState().is3DMapEnabled,
  viewportBbox: null,
  cameraRequest: null,
  setCenter: (center, zoom) => set({ center, zoom: zoom ?? get().zoom }),
  setViewportBbox: (viewportBbox) => set({ viewportBbox }),
  requestCamera: (request) => set({ cameraRequest: { ...request, nonce: Date.now() + Math.random() } }),
  setBasemap: (basemap) => set({ basemap }),
  toggle3D: () => set((s) => ({ is3D: !s.is3D })),
  set3D: (is3D) => set({ is3D }),
}));
