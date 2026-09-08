import { apiGet } from "./apiClient";

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number | null;
  url: string | null;
  lat: number;
  lon: number;
  depthKm: number;
}

export interface EarthquakeFeed {
  events: EarthquakeEvent[];
  source: string;
  fetchedAt: string;
}

export interface RadarFrame {
  tileUrl: string;
  frameTime: number;
  source: string;
  fetchedAt: string;
}

export interface AirQualityReading {
  europeanAqi: number | null;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  ozone: number | null;
  observedAt: string | null;
  source: string;
  fetchedAt: string;
}

export function fetchEarthquakes(window: "day" | "week", signal?: AbortSignal): Promise<EarthquakeFeed> {
  return apiGet<EarthquakeFeed>("/api/live", { layer: "earthquakes", window }, signal);
}

export function fetchRadarFrame(signal?: AbortSignal): Promise<RadarFrame> {
  return apiGet<RadarFrame>("/api/live", { layer: "radar" }, signal);
}

export function fetchAirQuality(lat: number, lon: number, signal?: AbortSignal): Promise<AirQualityReading> {
  return apiGet<AirQualityReading>("/api/live", { layer: "air-quality", lat, lon }, signal);
}
