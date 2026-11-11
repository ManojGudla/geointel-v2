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
  /** When this record was last edited in OpenStreetMap. */
  updatedAt?: string;
}

export interface SiteResult {
  roads: RoadGroup[];
  features: SiteFeature[];
  counts: { roads: number; underConstruction: number; awaitingDevelopment: number };
  radiusMeters: number;
  /** When the server fetched this from OpenStreetMap. Absent on answers cached before this field existed. */
  fetchedAt?: string;
}

export async function fetchSite(
  lat: number,
  lon: number,
  radiusMeters: number,
  signal?: AbortSignal
): Promise<SiteResult> {
  return apiGet<SiteResult>("/api/site", { lat, lon, radius: radiusMeters }, signal);
}

/**
 * The wider search, in two steps: 2 km, then 5 km only if that found nothing.
 *
 * It used to go straight to 5 km. In a city that is a heavy question (146
 * records around Gachibowli, 8 seconds on a cold cache) asked in order to show
 * the dozen nearest, nearly all of which are inside 2 km anyway. The small
 * circle answers quickly and is usually enough; the big one is kept for places
 * where it is genuinely needed, which are the quiet ones where it is cheap.
 */
export const WIDE_SEARCH_STEPS = [2000, 5000] as const;

export async function fetchConstructionNearby(
  lat: number,
  lon: number,
  radiusMeters: number,
  signal?: AbortSignal
): Promise<SiteResult> {
  return apiGet<SiteResult>("/api/site", { lat, lon, radius: radiusMeters, scope: "construction" }, signal);
}
