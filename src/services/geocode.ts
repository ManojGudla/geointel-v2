import { apiGet } from "@/services/apiClient";
import type { Location, SearchSuggestion } from "@/types/location";

interface SearchResultDto {
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
  /** Kilometres from where the user was looking, when that was sent. */
  distanceKm?: number;
}

interface LocationDto {
  lat: number;
  lon: number;
  displayName: string;
  name: string;
  address: Location["address"];
  source: string;
}

// Location["address"] (src/types/location.ts) already carries countryCode /
// stateCode, and this DTO's address field is typed as exactly that shape,
// so no field mapping is needed below beyond what already exists.

/**
 * `near` is where the user is currently looking. Passing it is what makes
 * searching for your own neighbourhood work: without it the API can only rank
 * by global notability, which buries a local colony under every big city that
 * shares a word with it. Optional, so a search still works before the map has
 * settled.
 */
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
  near?: { lat: number; lon: number }
): Promise<SearchSuggestion[]> {
  const params: Record<string, string | number> = { q: query };
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
    params.lat = near.lat;
    params.lon = near.lon;
  }
  const { results } = await apiGet<{ results: SearchResultDto[] }>("/api/geocode", params, signal);
  return results.map((r) => ({
    displayName: r.displayName,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    type: r.type,
    importance: r.importance,
    distanceKm: r.distanceKm,
  }));
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
