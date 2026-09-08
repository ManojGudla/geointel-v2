import type { EarthquakeEvent } from "@/services/live";

/**
 * Earthquake events to GeoJSON for the map's circle layer, which sizes and
 * colours each mark from the `magnitude` property. Pure, so the conversion
 * is testable without a map.
 */
export function earthquakesToGeoJSON(events: EarthquakeEvent[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((event) => ({
      type: "Feature",
      id: event.id,
      geometry: { type: "Point", coordinates: [event.lon, event.lat] },
      properties: {
        magnitude: event.magnitude,
        place: event.place,
        depthKm: event.depthKm,
        time: event.time,
      },
    })),
  };
}
