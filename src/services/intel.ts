import { apiGet } from "@/services/apiClient";
import type { WeatherData, NewsItem, NearbyItem, NearbyCategory } from "@/types/intel";

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherData> {
  const { weather } = await apiGet<{ weather: WeatherData }>("/api/weather", { lat, lon }, signal);
  return weather;
}

export async function fetchNews(place: string, signal?: AbortSignal): Promise<NewsItem[]> {
  const { articles } = await apiGet<{ articles: NewsItem[] }>("/api/news", { place }, signal);
  return articles;
}

/**
 * What the server actually searched, which is not always what was asked for.
 *
 * Where OpenStreetMap coverage is thin, a 1km search returns nothing and the
 * handler widens to 5km once (see api/_routes/nearby.ts). That is a better
 * answer than an empty list, but only if the reader is told, so this shape
 * carries the widening rather than hiding it behind an array.
 */
export interface NearbyResult {
  items: NearbyItem[];
  /** The radius the returned items actually came from. */
  radiusMeters: number;
  requestedRadiusMeters: number;
  widened: boolean;
}

export async function fetchNearbyResult(
  lat: number,
  lon: number,
  radiusMeters: number,
  category?: NearbyCategory,
  signal?: AbortSignal
): Promise<NearbyResult> {
  const data = await apiGet<Partial<NearbyResult> & { items: NearbyItem[] }>(
    "/api/nearby",
    { lat, lon, radius: radiusMeters, category },
    signal
  );
  return {
    items: data.items,
    // Defaults rather than assumptions: an edge-cached response from before
    // this shipped carries neither field, and must not read as "widened".
    radiusMeters: data.radiusMeters ?? radiusMeters,
    requestedRadiusMeters: data.requestedRadiusMeters ?? radiusMeters,
    widened: data.widened ?? false,
  };
}

/**
 * The array-shaped call, kept because eight callers want exactly that and
 * have no use for the widening: city pages counting hospitals, the AI
 * context builder, spatial analysis. Only the Nearby panel shows a reader a
 * list they might question, so only it needs the fuller result.
 */
export async function fetchNearby(
  lat: number,
  lon: number,
  radiusMeters: number,
  category?: NearbyCategory,
  signal?: AbortSignal
): Promise<NearbyItem[]> {
  const { items } = await fetchNearbyResult(lat, lon, radiusMeters, category, signal);
  return items;
}
