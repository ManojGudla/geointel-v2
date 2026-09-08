import type { BuildingDto } from "@/services/buildings";

/**
 * Pure conversion from the /api/buildings DTOs to a GeoJSON FeatureCollection
 * of Polygons, carrying height + estimate-flag as feature properties for the
 * fill-extrusion layer's data-driven paint expressions. Kept pure/exported so
 * it's testable without a map instance.
 */
export function buildingsToGeoJSON(buildings: BuildingDto[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: buildings.map((b) => ({
      type: "Feature",
      id: b.id,
      geometry: { type: "Polygon", coordinates: [b.polygon] },
      properties: { heightMeters: b.heightMeters, heightIsEstimated: b.heightIsEstimated, name: b.name ?? null },
    })),
  };
}

/** Rounds a bbox to a coarse grid so small pans within the same tile don't refetch. */
export function roundBbox(bbox: { south: number; west: number; north: number; east: number }, precision = 3) {
  const r = (n: number) => Number(n.toFixed(precision));
  return { south: r(bbox.south), west: r(bbox.west), north: r(bbox.north), east: r(bbox.east) };
}
