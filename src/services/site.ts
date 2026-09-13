import { apiGet } from "./apiClient";

/**
 * Roads and development status for a place, from api/_routes/site.ts.
 *
 * The shapes here mirror that handler exactly. Kept in a service rather than
 * fetched inline so the panel stays a rendering concern and the endpoint has
 * one caller to change if it ever moves.
 */

export interface RoadGroup {
  name: string;
  kind: string;
  segments: number;
  ref?: string;
  surface?: string;
  lanes?: string;
}

export type SiteFeatureKind =
  | "road-works"
  | "road-proposed"
  | "building-site"
  | "construction-area"
  | "brownfield"
  | "greenfield";

export interface SiteFeature {
  kind: SiteFeatureKind;
  name: string | null;
  becoming?: string;
  startDate?: string;
  endDate?: string;
  operator?: string;
  lat?: number;
  lon?: number;
  osm: string;
}

export interface SiteResult {
  roads: RoadGroup[];
  features: SiteFeature[];
  counts: { roads: number; underConstruction: number; awaitingDevelopment: number };
  radiusMeters: number;
}

export async function fetchSite(
  lat: number,
  lon: number,
  radiusMeters: number,
  signal?: AbortSignal
): Promise<SiteResult> {
  return apiGet<SiteResult>("/api/site", { lat, lon, radius: radiusMeters }, signal);
}
