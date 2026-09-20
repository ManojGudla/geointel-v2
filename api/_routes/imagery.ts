import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout } from "../_lib/cache.js";

/**
 * When was this satellite picture taken?
 *
 * This exists because of a real complaint: "old imagery is coming
 * everywhere". The satellite basemap is Esri World Imagery, which is a mosaic
 * - every area was photographed on its own date, so one city can look current
 * and the next town over can look years old. Without a date on screen that
 * reads as a bug in this app. With one it reads as what it is: a fact about
 * the imagery, which the visitor can now judge for themselves.
 *
 * Esri publishes the answer. The World Imagery tile service carries metadata
 * sublayers of footprint polygons, each with the capture date, the ground
 * resolution and the provider of the picture covering that ground. Querying
 * the point returns the record for exactly what the visitor is looking at.
 *
 * Nothing here is estimated. If Esri has no footprint for the point, the
 * response is null and the UI says the date isn't published, rather than
 * showing a guess next to a photograph.
 */

const ESRI_METADATA =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

/**
 * Which metadata sublayers to ask.
 *
 * The layer names ("30cm Resolution Metadata") describe the layer's own
 * display scale, NOT the resolution of the footprints inside it - checked
 * against the live service, where layer 15 returned a 1.2 m footprint. So the
 * layer number can't be used to rank quality, and the selection below uses
 * each footprint's own SAMP_RES instead.
 *
 * A spread of four is asked in parallel: fine-detail coverage lives in the
 * lower numbers and broad coverage in the higher ones, and a point almost
 * always falls in at least one of these.
 */
const PRIMARY_LAYERS = [9, 11, 13, 15];
/** Asked only when the first spread finds nothing, so the usual cost is one round of four. */
const FALLBACK_LAYERS = [10, 12, 14, 16];

const cache = new TtlCache<unknown>(7 * 24 * 60 * 60 * 1000); // imagery for a place changes rarely
const limiter = new RateLimiter(60_000, 30);

export interface ImageryDto {
  /** ISO date (YYYY-MM-DD) the picture was captured. */
  captured: string;
  year: number;
  /** Ground sample distance in metres - how much real ground one pixel covers. */
  resolutionMeters: number | null;
  /** Who supplied the picture, in Esri's own words. */
  provider: string | null;
  /** Esri's product name for this coverage, e.g. "Vivid Advanced". */
  product: string | null;
}

interface Footprint {
  SRC_DATE?: number;
  SAMP_RES?: number;
  SRC_RES?: number;
  NICE_DESC?: string;
  NICE_NAME?: string;
  MinMapLevel?: number;
  MaxMapLevel?: number;
}

/** Esri returns SRC_DATE as the number 20251115. */
export function parseSrcDate(value: unknown): string | null {
  const digits = String(value ?? "");
  if (!/^\d{8}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (year < 1970 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Picks the footprint that is actually being displayed.
 *
 * Several footprints can cover one point at different levels of detail; which
 * one you SEE depends on how far you are zoomed in, and each footprint states
 * the zoom range it is used for. So candidates whose range contains the
 * current zoom are preferred, and among those the finest resolution wins,
 * because that is the picture drawn on top.
 */
export function selectFootprint(features: Footprint[], zoom: number): Footprint | null {
  const dated = features.filter((f) => parseSrcDate(f.SRC_DATE) !== null);
  if (dated.length === 0) return null;

  const inRange = dated.filter(
    (f) =>
      typeof f.MinMapLevel === "number" &&
      typeof f.MaxMapLevel === "number" &&
      zoom >= f.MinMapLevel &&
      zoom <= f.MaxMapLevel
  );

  // Falling back to every dated footprint rather than returning nothing: a
  // date slightly outside its ideal zoom band is still the truth about this
  // ground, and far more useful than an empty panel.
  const pool = inRange.length > 0 ? inRange : dated;

  return pool.reduce((best, f) => {
    const a = f.SAMP_RES ?? f.SRC_RES ?? Number.POSITIVE_INFINITY;
    const b = best.SAMP_RES ?? best.SRC_RES ?? Number.POSITIVE_INFINITY;
    return a < b ? f : best;
  });
}

async function queryLayer(layer: number, lat: number, lon: number): Promise<Footprint[]> {
  const url =
    `${ESRI_METADATA}/${layer}/query?geometry=${lon},${lat}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=SRC_DATE,SAMP_RES,SRC_RES,NICE_DESC,NICE_NAME,MinMapLevel,MaxMapLevel` +
    `&returnGeometry=false&f=json`;

  /*
    A bare fetch() here was the only outbound call in this API with no
    timeout. Esri is generally quick, but a hung connection has no natural
    end: the request would sit open until the serverless platform killed the
    whole invocation, holding a function slot and leaving the caller watching
    a spinner with no error to show. Eight seconds matches weather.ts, the
    other fast third-party lookup.
  */
  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8_000);
  if (!response.ok) throw new Error(`Esri imagery metadata layer ${layer} returned HTTP ${response.status}.`);
  const body = (await response.json()) as { features?: Array<{ attributes?: Footprint }>; error?: unknown };
  if (body.error) throw new Error(`Esri imagery metadata layer ${layer} returned an error.`);
  return (body.features ?? []).map((f) => f.attributes ?? {});
}

/** One layer failing must not lose the answer another layer already has. */
async function queryLayers(layers: number[], lat: number, lon: number): Promise<Footprint[]> {
  const settled = await Promise.allSettled(layers.map((l) => queryLayer(l, lat, lon)));
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const zoomRaw = Number(getQueryParam(req, "zoom"));
  const zoom = Number.isFinite(zoomRaw) ? Math.min(22, Math.max(0, zoomRaw)) : 16;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return err(res, 400, "lat and lon are required numbers.");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return err(res, 400, "lat and lon are out of range.");
  }

  const ip = getClientIp(req);
  if (!limiter.check(ip).allowed) {
    return err(res, 429, "Too many imagery requests. Please slow down.", "RATE_LIMITED");
  }

  // Rounded to ~1 km and to a whole zoom: imagery footprints are far larger
  // than that, so this collapses a pan across a city into one lookup.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(zoom)}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return ok(res, { imagery: cached });

  let result: ImageryDto | null = null;
  try {
    let features = await queryLayers(PRIMARY_LAYERS, lat, lon);
    if (features.length === 0) features = await queryLayers(FALLBACK_LAYERS, lat, lon);

    const best = selectFootprint(features, zoom);
    const captured = best ? parseSrcDate(best.SRC_DATE) : null;

    if (best && captured) {
      const resolution = best.SAMP_RES ?? best.SRC_RES ?? null;
      result = {
        captured,
        year: Number(captured.slice(0, 4)),
        resolutionMeters: typeof resolution === "number" && Number.isFinite(resolution) ? resolution : null,
        provider: best.NICE_DESC ?? null,
        product: best.NICE_NAME ?? null,
      };
    }
  } catch (error) {
    console.error("[api/imagery]", error instanceof Error ? error.message : error);
  }

  // Null is a real answer: plenty of ground has no published footprint, and
  // saying so beats implying the picture is current.
  cache.set(cacheKey, result);
  ok(res, { imagery: result });
};

export default withMaintenanceGuard(withEdgeCache(604800)(handler));
