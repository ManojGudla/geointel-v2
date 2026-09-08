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

export async function fetchNearby(
  lat: number,
  lon: number,
  radiusMeters: number,
  category?: NearbyCategory,
  signal?: AbortSignal
): Promise<NearbyItem[]> {
  const { items } = await apiGet<{ items: NearbyItem[] }>("/api/nearby", { lat, lon, radius: radiusMeters, category }, signal);
  return items;
}
