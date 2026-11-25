import type { ApiHandler, ApiRequest, ApiResponse } from "../http.js";

export interface RouteAnswer<T> {
  /** The HTTP status the route answered with, or 0 if it did not answer in time. */
  status: number;
  /** The JSON body, or null when there was none. */
  body: (T & { ok?: boolean; error?: string; code?: string }) | null;
  ms: number;
}

/**
 * Runs one of this app's own API routes in this process, as the visitor's
 * browser would have called it over HTTP, and returns what it answered.
 *
 * This is how the agents gather evidence. Calling the routes, rather than
 * re-implementing them, keeps one copy of everything that makes them
 * trustworthy: input checks, caches, mirror races, provider fallbacks,
 * "unavailable" rather than a made-up zero, and the per-visitor limits (the
 * visitor's own headers are passed through, so asking through an agent does
 * not get anyone a bigger budget).
 *
 * A route that has not answered within `timeoutMs` counts as failed. It is
 * left to finish in the background and fill its cache; it cannot be stopped.
 */
export async function callRoute<T>(
  handler: ApiHandler,
  query: Record<string, string | number>,
  from: ApiRequest,
  timeoutMs: number
): Promise<RouteAnswer<T>> {
  const started = Date.now();
  const stringQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) stringQuery[key] = String(value);

  let status = 200;
  let body: unknown = null;
  const headers: Record<string, string | number | string[]> = {};

  const req = {
    method: "GET",
    url: "/internal",
    headers: { ...from.headers, "content-length": undefined, "content-type": undefined },
    query: stringQuery,
    body: undefined,
    socket: from.socket,
  } as unknown as ApiRequest;

  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    status(code: number) {
      status = code;
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
    },
    end() {
      /* a route that ends without JSON leaves body null */
    },
  } as unknown as ApiResponse & { statusCode: number };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const outcome = await Promise.race([Promise.resolve(handler(req, res)).then(() => "done" as const), timedOut]);
    if (outcome === "timeout") return { status: 0, body: null, ms: Date.now() - started };
    return { status, body: body as RouteAnswer<T>["body"], ms: Date.now() - started };
  } catch (error) {
    console.error("[evidence] internal route call failed", error);
    return { status: 500, body: null, ms: Date.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
