/**
 * Thin fetch wrapper for every frontend service (geocode, gis, weather,
 * news, route, nearby...). Every api/*.ts handler responds with either
 * { ok: true, ...data } or { ok: false, error, code } — this wrapper turns
 * that into a resolved value or a typed error, so AsyncPanel can tell a
 * "provider is down, everything else keeps working" state (ApiUnavailableError)
 * apart from a genuine network/programming failure (plain Error).
 */

export class ApiUnavailableError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiUnavailableError";
    this.code = code;
  }
}

type ApiEnvelope<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error(`Network request to ${path} failed.`);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${path} returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!payload.ok) {
    throw new ApiUnavailableError(payload.error || "This data source is temporarily unavailable.", payload.code);
  }

  if (!response.ok) {
    // ok:true but a non-2xx status would be an inconsistent handler bug, not an outage.
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }

  const { ok: _ok, ...rest } = payload as { ok: true } & T;
  return rest as T;
}

export function apiGet<T>(path: string, params?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const query = params
    ? "?" +
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return request<T>(`${path}${query}`, { method: "GET" }, signal);
}

export function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal
  );
}
