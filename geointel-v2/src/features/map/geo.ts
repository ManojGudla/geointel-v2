import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";

export function circlePolygon(lat: number, lon: number, radiusMeters: number): Feature<Polygon> {
  return turf.circle([lon, lat], radiusMeters / 1000, { units: "kilometers", steps: 64 });
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return turf.distance([a.lon, a.lat], [b.lon, b.lat], { units: "kilometers" }) * 1000;
}

export function formatDistance(meters: number, units: "metric" | "imperial" = "metric"): string {
  if (units === "imperial") {
    const feet = meters * 3.28084;
    return feet < 1000 ? `${Math.round(feet)} ft` : `${(feet / 5280).toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
