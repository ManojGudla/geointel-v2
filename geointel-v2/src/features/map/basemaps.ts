import type { StyleSpecification } from "maplibre-gl";
import type { Basemap } from "@/stores/mapStore";

/**
 * All raster, no API key required. Trade-off, made explicit in the audit
 * answers: no photorealistic satellite/terrain provider key was available,
 * so this uses Esri World Imagery (free) for satellite and OSM/CARTO raster
 * tiles for standard/dark. Swapping to a licensed vector provider (MapTiler,
 * Mapbox) later is a one-file change — just replace the `tiles` URLs below
 * and drop in the key.
 */
const RASTER_ATTRIBUTION: Record<Basemap, string> = {
  standard: "© OpenStreetMap contributors",
  satellite: "Imagery © Esri, Maxar, Earthstar Geographics",
  dark: "© OpenStreetMap contributors © CARTO",
  terrain: "© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors",
};

const RASTER_TILES: Record<Basemap, string[]> = {
  standard: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  dark: [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  ],
  terrain: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png"],
};

export function buildBasemapStyle(basemap: Basemap): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: RASTER_TILES[basemap],
        tileSize: 256,
        attribution: RASTER_ATTRIBUTION[basemap],
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: "base",
        type: "raster",
        source: "base",
      },
    ],
  };
}
