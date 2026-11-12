import { create } from "zustand";
import type { SpatialFormat, SpatialSummary } from "@/features/import/parseSpatial";

/**
 * Layers the visitor added from their own files.
 *
 * Held in memory only, on purpose. These are often somebody's own site lists,
 * and nothing in this app should quietly keep a copy: not in localStorage, not
 * on a server. Closing or reloading the tab forgets them, and the panel says so.
 */
export interface ImportedLayer {
  id: string;
  name: string;
  format: SpatialFormat;
  color: string;
  visible: boolean;
  features: GeoJSON.Feature[];
  summary: SpatialSummary;
  skipped: number;
}

/** Distinct from the app's own overlay colours (teal analysis, violet brand), and readable on street and satellite maps. */
export const IMPORT_COLORS = ["#e11d48", "#2563eb", "#d97706", "#059669", "#7c3aed", "#0891b2"] as const;
export const MAX_LAYERS = 8;

interface ImportState {
  layers: ImportedLayer[];
  add: (layer: Omit<ImportedLayer, "id" | "color" | "visible">) => ImportedLayer;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  setColor: (id: string, color: string) => void;
}

let counter = 0;

export const useImportStore = create<ImportState>((set, get) => ({
  layers: [],
  add: (input) => {
    const used = new Set(get().layers.map((l) => l.color));
    const color = IMPORT_COLORS.find((c) => !used.has(c)) ?? IMPORT_COLORS[get().layers.length % IMPORT_COLORS.length]!;
    counter += 1;
    const layer: ImportedLayer = { ...input, id: `import-${counter}`, color, visible: true };
    set((s) => ({ layers: [...s.layers, layer] }));
    return layer;
  },
  remove: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  toggle: (id) => set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  setColor: (id, color) => set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, color } : l)) })),
}));

/**
 * Everything visible, as one collection for the map's single source. Each
 * feature carries its layer's colour so three map layers (fill, line, circle)
 * can draw any number of imported files.
 */
export function importCollection(layers: ImportedLayer[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const feature of layer.features) {
      features.push({ ...feature, properties: { ...feature.properties, __color: layer.color, __layer: layer.id } });
    }
  }
  return { type: "FeatureCollection", features };
}
