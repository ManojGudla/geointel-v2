import type { MeasureMode } from "@/stores/measureStore";

/**
 * Converts the in-progress measurement to a GeoJSON FeatureCollection for
 * the map preview: one Point feature per vertex, plus a LineString (distance
 * mode, or area mode before the 3rd point) or closed Polygon (area mode from
 * the 3rd point on). A single MapLibre source holds all of it - the fill,
 * line, and circle layers each render only the geometry types they support.
 */
export function buildMeasureGeoJSON(mode: MeasureMode, points: Array<[number, number]>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((point, index) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: point },
    properties: { vertex: index },
  }));

  if (mode === "distance" && points.length >= 2) {
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} });
  } else if (mode === "area" && points.length >= 3) {
    features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...points, points[0]!]] }, properties: {} });
  } else if (mode === "area" && points.length === 2) {
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} });
  }

  return { type: "FeatureCollection", features };
}
