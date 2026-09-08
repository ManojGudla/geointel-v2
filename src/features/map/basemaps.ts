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
  dark: "© Esri, HERE, Garmin, © OpenStreetMap contributors",
  terrain: "© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors",
};

// CARTO's legacy basemaps.cartocdn.com free raster endpoint now serves
// "API key required" watermark tiles for unregistered domains — a policy
// change on their end, not something fixable by request headers. Replaced
// with Esri's Dark Gray Canvas service, the same no-key-required Esri
// ArcGIS Online tier already used for the satellite basemap below.
const RASTER_TILES: Record<Basemap, string[]> = {
  standard: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  dark: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
  terrain: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png"],
};

// Esri's Dark Gray Canvas base ships with no labels — this reference overlay
// (place names, roads, boundaries) is the matching free layer that goes on
// top of it, same key-free ArcGIS Online tier.
const DARK_LABELS_TILES = ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"];

// Real bug, not a guess: World_Imagery (satellite) genuinely has tiles out
// to z19, but Esri's Dark Gray Canvas base/reference layers are a lower-
// resolution cartographic basemap whose native level-of-detail tops out
// around z16 — past that, ArcGIS Online doesn't have a real tile to serve
// and instead returns its own "Map data not yet available" placeholder
// image, which is exactly the empty grey checkerboard the Dark style shows
// when zoomed in past that point. Every other basemap here (standard,
// satellite, terrain) really does have z19 coverage, so only "dark" gets
// the lower cap — MapLibre then correctly over-zooms (upscales) the last
// real z16 tile instead of requesting tiles that don't exist.
const RASTER_MAXZOOM: Record<Basemap, number> = { standard: 19, satellite: 19, dark: 16, terrain: 17 };

export function buildBasemapStyle(basemap: Basemap): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    base: {
      type: "raster",
      tiles: RASTER_TILES[basemap],
      tileSize: 256,
      attribution: RASTER_ATTRIBUTION[basemap],
      maxzoom: RASTER_MAXZOOM[basemap],
    },
  };
  const layers: StyleSpecification["layers"] = [{ id: "base", type: "raster", source: "base" }];

  if (basemap === "dark") {
    sources.labels = { type: "raster", tiles: DARK_LABELS_TILES, tileSize: 256, maxzoom: RASTER_MAXZOOM.dark };
    layers.push({ id: "labels", type: "raster", source: "labels" });
  }

  return { version: 8, sources, layers };
}
