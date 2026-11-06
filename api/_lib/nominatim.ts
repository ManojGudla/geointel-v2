import { fetchWithTimeout } from "./cache.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
/*
  The usage policy asks for a User-Agent that identifies the application so the
  operators can get in touch; "contact: geointel app" gave them no way to.
*/
const USER_AGENT = "maNOWj-GeoIntel/3.2 (+https://www.manowj.com)";

/*
  The public Nominatim server allows at most ONE request per second from an
  application, and blocks clients that exceed it - for every user of the app at
  once, because they all share the server's IP addresses. Nothing here enforced
  that: each search-box pause and each map tap sent a request immediately.

  Requests in this instance now start at least MIN_GAP_MS apart. A request that
  would have to wait longer than MAX_WAIT_MS is refused instead of queued
  (NominatimBusyError); /api/geocode then answers from Photon, and
  /api/reverse-geocode reports "temporarily unavailable", both of which already
  existed for a Nominatim outage. This holds the rate per serverless instance;
  several warm instances can still add up past 1/s, which is why the audit
  (SECURITY_AUDIT.md, TECHNICAL_ISSUES.md) recommends a geocoder with a
  commercial plan before any marketing push.
*/
const MIN_GAP_MS = 1100;
const MAX_WAIT_MS = 2500;
let nextSlotAt = 0;

export class NominatimBusyError extends Error {
  constructor() {
    super("Nominatim is rate limited right now; try again in a moment.");
    this.name = "NominatimBusyError";
  }
}

/** Reserves the next send slot, or throws if it is too far away. Exported for tests. */
export function reserveNominatimSlot(now = Date.now()): number {
  const startAt = Math.max(now, nextSlotAt);
  const wait = startAt - now;
  if (wait > MAX_WAIT_MS) throw new NominatimBusyError();
  nextSlotAt = startAt + MIN_GAP_MS;
  return wait;
}

/** Test hook. */
export function resetNominatimPacing() {
  nextSlotAt = 0;
}

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
  const wait = reserveNominatimSlot();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
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
