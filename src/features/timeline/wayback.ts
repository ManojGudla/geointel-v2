import { apiGet } from "@/services/apiClient";

/**
 * Esri World Imagery Wayback: past versions of the satellite map, at the same
 * detail as the satellite basemap (see api/_routes/imagery-versions.ts).
 *
 * A version's date is when Esri published that version of the map. The
 * photos in it were taken on or before that date, at different times in
 * different places, so the panel never calls it a capture date.
 */
export interface WaybackVersion {
  release: number;
  date: string;
}

export const WAYBACK_HOST = "https://wayback.maptiles.arcgis.com";
/** Deep enough for buildings and streets. Past this some older versions have no tile at all, so MapLibre stretches level 18. */
export const WAYBACK_MAX_ZOOM = 18;
export const WAYBACK_ATTRIBUTION = "Esri World Imagery Wayback (Esri, Maxar, Earthstar Geographics)";

export function waybackTileUrl(release: number): string {
  return `${WAYBACK_HOST}/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${Math.trunc(release)}/{z}/{y}/{x}`;
}

export async function fetchWaybackVersions(signal?: AbortSignal): Promise<WaybackVersion[]> {
  const { versions } = await apiGet<{ versions: WaybackVersion[] }>("/api/imagery-versions", undefined, signal);
  return versions;
}
