export interface WeatherData {
  temperatureC: number;
  feelsLikeC: number;
  condition: string;
  /**
   * Raw WMO 4677 code from Open-Meteo. Optional because older cached
   * responses predate it. The weather visual effects switch on this rather
   * than on `condition`, whose wording is for humans and can change.
   */
  weatherCode?: number;
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
  durationSeconds: number;
  /**
   * [lon, lat] of the manoeuvre itself. Without this a step is just a
   * sentence — you can read "Turn left onto GT Road" but you can't SEE where
   * that is, which is the whole difference between a list and directions.
   * Tapping a step flies the map here.
   */
  location: [number, number];
  /** OSRM manoeuvre type/modifier, used to pick the turn icon. */
  type: string;
  modifier?: string;
}

/** One route option. OSRM returns the fastest first, then alternatives. */
export interface RouteOption {
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  steps: RouteStep[];
  /** A short reason this option differs, e.g. "6 min slower · 3.2 km shorter". */
  summary: string;
}

export interface RouteResult {
  mode: RouteMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  alternatives: number;
  source: string;
  steps: RouteStep[];
  /** Every option including the primary one, so the UI can offer a choice. */
  options: RouteOption[];
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
