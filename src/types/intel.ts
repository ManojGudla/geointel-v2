/*
  The numeric readings are `number | null` because that is what Open-Meteo
  actually sends when it has no value. Typing them as plain numbers is how
  "0°C" got printed for a missing temperature: see src/lib/reading.ts.
*/
export interface WeatherData {
  temperatureC: number | null;
  feelsLikeC: number | null;
  condition: string;
  /**
   * Raw WMO 4677 code from Open-Meteo. Optional because older cached
   * responses predate it. The weather visual effects switch on this rather
   * than on `condition`, whose wording is for humans and can change.
   */
  weatherCode?: number;
  humidityPct: number | null;
  windKph: number | null;
  precipitationMm: number | null;
  sunrise?: string;
  sunset?: string;
  forecast: Array<{ date: string; maxC: number | null; minC: number | null; condition: string }>;
  /**
   * IANA timezone of the queried point, from Open-Meteo. Optional because a
   * cached response may predate it, and because a value that is absent must
   * read as "unavailable" rather than silently falling back to the reader's
   * own timezone, which is the bug this field exists to end.
   */
  timezone?: string;
  timezoneAbbreviation?: string;
  /**
   * Ground height of the point in metres above sea level, from the 90 m
   * Copernicus elevation model Open-Meteo uses. Absent when not returned;
   * never filled in, since 0 is a real answer on the coast.
   */
  elevationM?: number;
  source: string;
  fetchedAt: string;
}

export interface NewsItem {
  title: string;
  source: string;
  category: string;
  url: string;
  /** For display, e.g. "26 Nov 2026"; "Recent" when the feed gave no date. */
  publishedAt: string;
  /** ISO time, for "3 hours ago". Absent when the feed gave no date. */
  publishedIso?: string;
}

export type RouteMode = "car" | "walk" | "bike";

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  /**
   * [lon, lat] of the manoeuvre itself. Without this a step is just a
   * sentence - you can read "Turn left onto GT Road" but you can't SEE where
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
