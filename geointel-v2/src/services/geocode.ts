import { apiGet } from "@/services/apiClient";
import type { Location, SearchSuggestion } from "@/types/location";

interface SearchResultDto {
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
}

interface LocationDto {
  lat: number;
  lon: number;
  displayName: string;
  name: string;
  address: Location["address"];
  source: string;
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const { results } = await apiGet<{ results: SearchResultDto[] }>("/api/geocode", { q: query }, signal);
  return results.map((r) => ({ displayName: r.displayName, name: r.name, lat: r.lat, lon: r.lon, type: r.type, importance: r.importance }));
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<Location> {
  const { location } = await apiGet<{ location: LocationDto }>("/api/reverse-geocode", { lat, lon }, signal);
  return {
    lat: location.lat,
    lon: location.lon,
    displayName: location.displayName,
    name: location.name,
    address: location.address,
    source: location.source,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
