import { fetchWithTimeout } from "./cache.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "maNOWj-GeoIntel/2.0 (contact: geointel app)";

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  importance?: number;
  address?: Record<string, string>;
}

/**
 * Nominatim usage policy requires a descriptive User-Agent and reasonable
 * request rates - both handled by the caller's rate limiter and this header.
 */
async function nominatimFetch(path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${NOMINATIM_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchWithTimeout(url.toString(), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }, 10_000);
}

export async function nominatimSearch(query: string, opts: { limit?: number; bounded?: boolean; viewbox?: string } = {}): Promise<NominatimResult[]> {
  const params: Record<string, string> = {
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(opts.limit ?? 8),
    // Matches what /reverse has always sent. Without it the dropdown can come
    // back in the local script while the address panel behind it is English,
    // so a user scanning the list does not recognise their own address and
    // reports that nothing was found.
    "accept-language": "en",
  };
  if (opts.viewbox) {
    params.viewbox = opts.viewbox;
    params.bounded = opts.bounded ? "1" : "0";
  }

  const response = await nominatimFetch("/search", params);
  if (!response.ok) throw new Error(`Nominatim search returned HTTP ${response.status}.`);
  const results = (await response.json()) as unknown;
  return Array.isArray(results) ? (results as NominatimResult[]) : [];
}

export async function nominatimReverse(lat: number, lon: number, zoom: number): Promise<NominatimResult | null> {
  const response = await nominatimFetch("/reverse", {
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    addressdetails: "1",
    zoom: String(zoom),
    "accept-language": "en",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as NominatimResult & { error?: string };
  if (data.error) return null;
  return data;
}
