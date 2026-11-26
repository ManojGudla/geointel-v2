import { apiGet } from "@/services/apiClient";
import type { PropertySite } from "@/types/gis";

/**
 * The building at one exact point (see api/_routes/property.ts). Not in
 * geoPrecision's snapping list on purpose: snapping to three decimals moves a
 * point by up to about 55 m, which is a different building.
 */
export async function fetchPropertySite(lat: number, lon: number, signal?: AbortSignal): Promise<PropertySite> {
  const { site } = await apiGet<{ site: PropertySite }>("/api/property", { lat, lon }, signal);
  return site;
}
