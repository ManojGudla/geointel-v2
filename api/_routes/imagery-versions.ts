import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, withEdgeCache } from "../_lib/http.js";
import { TtlCache, fetchWithTimeout } from "../_lib/cache.js";

/**
 * Past versions of the satellite map, sharp enough to see buildings.
 *
 * The historical layer was NASA's daily MODIS mosaic: honest and free, but
 * 250 m per pixel, so at street zoom one pixel covers a neighbourhood and the
 * whole map turns into a grey-brown smear. Visitors read that as broken.
 *
 * Esri keeps every past version of its World Imagery map ("Wayback"), about
 * one a month since February 2014, at the same detail as the satellite map
 * this app already uses. This lists those versions from Esri's own published
 * configuration so the slider can step through them.
 *
 * What a version's date means, said here because the UI repeats it: it is
 * the date Esri published that version of the map, not the date each photo in
 * it was taken. Photos in a version were captured on or before that date,
 * and when varies by area.
 *
 * Esri's file is outside data, so nothing from it reaches the browser
 * unchecked: only a numeric release number and a date taken from the title,
 * both validated; everything else in each entry is dropped.
 */

const CONFIG_URL = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";
const cache = new TtlCache<WaybackVersion[]>(12 * 60 * 60 * 1000);

export interface WaybackVersion {
  /** Esri's release number, used in the tile address. */
  release: number;
  /** YYYY-MM-DD the version was published. */
  date: string;
}

/*
  Esri's titles read "World Imagery (Wayback 2014-02-20)". The first version
  of this expected them to start with "Wayback", matched nothing, and the
  route answered "no versions" for every request. Matched anywhere in the
  title now, still requiring the full date shape.
*/
const TITLE_DATE = /\bWayback (\d{4}-\d{2}-\d{2})\b/;

export function parseWaybackConfig(raw: unknown): WaybackVersion[] {
  if (!raw || typeof raw !== "object") return [];
  const byDate = new Map<string, WaybackVersion>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{1,7}$/.test(key)) continue;
    const title = value && typeof value === "object" ? (value as { itemTitle?: unknown }).itemTitle : undefined;
    if (typeof title !== "string") continue;
    const match = TITLE_DATE.exec(title.trim());
    if (!match) continue;
    const date = match[1]!;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    // One version per date; Esri has never published two the same day, but if
    // it did the list must not show duplicates on the slider.
    if (!byDate.has(date)) byDate.set(date, { release: Number(key), date });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "GET") return err(res, 405, "Use GET.");
  let versions = cache.get("all");
  if (!versions) {
    try {
      const response = await fetchWithTimeout(CONFIG_URL, {}, 8_000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      versions = parseWaybackConfig(await response.json());
      if (versions.length === 0) throw new Error("no versions in Esri's list");
      cache.set("all", versions);
    } catch (error) {
      console.error("[api/imagery-versions]", error instanceof Error ? error.message : error);
      return err(res, 502, "The list of past satellite map versions couldn't be loaded right now.", "PROVIDER_UNAVAILABLE");
    }
  }
  ok(res, { versions, source: "Esri World Imagery Wayback" });
};

// A new version appears about once a month; twelve hours at the edge matches the in-memory cache above.
export default withMaintenanceGuard(withEdgeCache(43200)(handler));
