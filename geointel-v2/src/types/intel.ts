export interface WeatherData {
  temperatureC: number;
  feelsLikeC: number;
  condition: string;
  humidityPct: number;
  windKph: number;
  precipitationMm: number;
  sunrise?: string;
  sunset?: string;
  forecast: Array<{ date: string; maxC: number; minC: number; condition: string }>;
  source: string;
  fetchedAt: string;
}

export interface NewsItem {
  title: string;
  source: string;
  category: string;
  url: string;
  publishedAt: string;
}

export type RouteMode = "car" | "walk" | "bike";

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
}

export interface RouteResult {
  mode: RouteMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  alternatives: number;
  source: string;
}

export type NearbyCategory =
  | "restaurants"
  | "cafes"
  | "hotels"
  | "hospitals"
  | "schools"
  | "atms"
  | "banks"
  | "petrol"
  | "shopping"
  | "parks"
  | "pharmacies"
  | "police"
  | "publicTransport";

export interface NearbyItem {
  id: string;
  name: string;
  category: NearbyCategory;
  lat: number;
  lon: number;
  distanceMeters: number;
  tags: Record<string, string>;
}
