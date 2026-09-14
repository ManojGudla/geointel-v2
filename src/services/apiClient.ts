/**
 * Thin fetch wrapper for every frontend service (geocode, gis, weather,
 * news, route, nearby...). Every api/*.ts handler responds with either
 * { ok: true, ...data } or { ok: false, error, code } — this wrapper turns
 * that into a resolved value or a typed error, so AsyncPanel can tell a
 * "provider is down, everything else keeps working" state (ApiUnavailableError)
 * apart from a genuine network/programming failure (plain Error).
 */

import { snapCoordinateParams } from "./geoPrecision";

export class ApiUnavailableError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiUnavailableError";
    this.code = code;
  }
}

type ApiEnvelope<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

/**
 * The endpoint's name, without its arguments.
 *
 * Every failure message below used to interpolate the whole `path`, and for
 * /api/nearby that query string carries the user's latitude and longitude. So
 * a dropped connection put someone's coordinates into a sentence on their
 * screen — a sentence they might then paste into a bug report or a support
 * message — in an application whose analytics deliberately refuse anything
 * coordinate-shaped (see services/analytics.ts).
 *
 * The endpoint on its own is enough to diagnose any of these. The arguments
 * never added anything a developer could act on.
 */
function endpointName(path: string): string {
  return path.split("?")[0] || path;
}

// Every panel (Weather, News, Overview, Evidence, Nearby, Travel...) renders
// its loading state via AsyncPanel until this promise settles. Without a
// client-side bound, a request that never resolves — a stalled connection,
// a proxy/firewall that swallows the response instead of erroring — leaves
// that spinner running forever with no way for the user to know something's
// wrong. This caps every request so a hang always turns into a visible,
// retryable error within a bounded time, regardless of the cause.
// 20s, not 15s: the slowest real dependency behind these endpoints is the
// Overpass GIS lookup (api/_lib/overpass.ts), which races 6 public mirrors
// in parallel with a 9s per-mirror timeout (shortened from 14s — see that
// file's comment on why) — 15s here was cutting that off before a slow-but-
// working mirror could finish, which is exactly what caused "Property
// intelligence failed to load ... timed out after 15s" even when the data
// was on its way. 20s gives real network latency + response parsing a
// comfortable safety margin over that 9s worst case.
const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort);
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`${endpointName(path)} timed out after ${timeoutMs / 1000}s. Check your connection and try again.`);
    }
    if ((error as Error).name === "AbortError") throw error;
    throw new Error(`Could not reach ${endpointName(path)}. Check your connection and try again.`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${endpointName(path)} returned an unexpected response (HTTP ${response.status}).`);
  }

  if (!payload.ok) {
    throw new ApiUnavailableError(payload.error || "This data source is temporarily unavailable.", payload.code);
  }

  if (!response.ok) {
    // ok:true but a non-2xx status would be an inconsistent handler bug, not an outage.
    throw new Error(`${endpointName(path)} returned HTTP ${response.status}.`);
  }

  const { ok: _ok, ...rest } = payload as { ok: true } & T;
  return rest as T;
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
  timeoutMs?: number,
  headers?: Record<string, string>
): Promise<T> {
  // Every URL in the app is built here, which makes this the one place where
  // coordinates can be put on a grid. Without it the CDN cache on these
  // routes is real but useless: it keys on the exact URL, so two people
  // standing eleven metres apart asked two different questions and both
  // waited seconds for the free Overpass mirrors. See geoPrecision.ts for the
  // measurements and for why the grid size differs per route.
  const snapped = snapCoordinateParams(path, params);
  const query = snapped
    ? "?" +
      Object.entries(snapped)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return request<T>(`${path}${query}`, { method: "GET", headers }, signal, timeoutMs);
}

export function apiPost<T>(path: string, body: unknown, signal?: AbortSignal, timeoutMs?: number, headers?: Record<string, string>): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    signal,
    timeoutMs
  );
}
