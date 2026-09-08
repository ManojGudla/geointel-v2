import type { AnalysisResult } from "@/stores/analysisStore";
import { bufferPolygon } from "./spatialMath";

/**
 * Turns an analysis result into the single GeoJSON collection the map's
 * analysis source draws. Every feature carries a `role` property, and the
 * map layers filter on it — one source, one setData call, no layer juggling
 * when the result changes shape between operations.
 *
 * Kept pure and separate from the panel so the geometry can be tested
 * without a map or a network call.
 */
export function analysisToGeoJSON(result: AnalysisResult | null): GeoJSON.FeatureCollection {
  if (!result) return { type: "FeatureCollection", features: [] };

  const features: GeoJSON.Feature[] = [];

  if (result.bufferMeters) {
    const ring = bufferPolygon(result.origin, result.bufferMeters);
    features.push({ ...ring, properties: { role: "buffer" } });
  }

  if (result.connector) {
    features.push({
      type: "Feature",
      properties: { role: "connector" },
      geometry: { type: "LineString", coordinates: result.connector },
    });
  }

  for (const point of result.points) {
    features.push({
      type: "Feature",
      properties: { role: "result", label: point.label, distanceMeters: point.distanceMeters },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    });
  }

  return { type: "FeatureCollection", features };
}
