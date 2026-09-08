import { apiGet } from "@/services/apiClient";
import type { EvidenceTrust } from "@/types/location";
import type { GISEvidence, GISFeature } from "@/types/gis";

export interface PoiNearby {
  name: string;
  category: string;
  distanceMeters: number;
  floors: string | null;
  tags: Record<string, string>;
}

export interface PoiEvidence {
  lat: number;
  lon: number;
  radiusMeters: number;
  trust: EvidenceTrust;
  // Reuses GISEvidence's counts/scores shape (rather than a second hand-typed
  // copy) so the two can never drift the way api/gis.ts's classifyFeatures()
  // and this type once did — see totalEvidenceCount() in api/gis.ts.
  counts: GISEvidence["counts"];
  scores: GISEvidence["scores"];
  features: GISFeature[];
  nearestFeature: { name: string; distanceMeters: number; tags: Record<string, string>; floors: string | null } | null;
  nearbyPois: PoiNearby[];
  source: string;
  fetchedAt: string;
}

export async function fetchPoiEvidence(lat: number, lon: number, signal?: AbortSignal): Promise<PoiEvidence> {
  const { poi } = await apiGet<{ poi: PoiEvidence }>("/api/poi-evidence", { lat, lon }, signal);
  return poi;
}
