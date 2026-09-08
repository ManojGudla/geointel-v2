import { apiGet } from "@/services/apiClient";
import type { GISEvidence } from "@/types/gis";

export async function fetchGISEvidence(lat: number, lon: number, radiusMeters: number, signal?: AbortSignal): Promise<GISEvidence> {
  const { evidence } = await apiGet<{ evidence: GISEvidence }>("/api/gis", { lat, lon, radius: radiusMeters }, signal);
  return evidence;
}
