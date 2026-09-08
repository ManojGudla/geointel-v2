import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Shared request/response shape for every api/*.ts handler.
 *
 * This is structurally identical to what Vercel's Node runtime passes to a
 * serverless function, and to what plugins/vite-plugin-api.ts synthesizes in
 * local dev — so a handler written against these types runs unmodified in
 * both places. We deliberately don't depend on @vercel/node's types here to
 * keep this package installable and testable without pulling in Vercel's
 * runtime.
 */
export type ApiRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  body: unknown;
};

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; code?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function ok<T extends object>(res: ApiResponse, data: T, status = 200) {
  res.status(status).json({ ok: true, ...data } satisfies ApiOk<T>);
}

export function err(res: ApiResponse, status: number, error: string, code?: string) {
  // Always overrides any caching header a wrapper set on the way in. A cached
  // 429 would lock a visitor out for the whole cache window, and a cached 400
  // or 503 would outlive the condition that caused it.
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error, code } satisfies ApiErr);
}

/**
 * Lets Vercel's CDN answer repeat requests without invoking the function.
 *
 * Found while investigating real latency: with more than twenty devices open
 * at once the site was slow to load. No API response carried a caching header
 * at all, so every request from every device ran the function, and each
 * function instance starts with an EMPTY in-memory TtlCache. Twenty phones
 * looking at the same city meant twenty Wikidata queries, twenty Overpass
 * queries, and twenty cold starts, against free upstream services that are
 * slow and rate limited by design.
 *
 * With s-maxage the edge holds the response and serves it to everyone else
 * instantly. The in-memory cache stays as the second layer for requests that
 * do reach the function.
 *
 * WHAT MAY USE THIS: responses that depend only on the query string and
 * contain nothing about the person asking. Everything wrapped below is public
 * geographic data. Anything carrying user input, an identity, or an admin
 * result must never be marked public — it would be served to the next
 * visitor. tests/unit/edgeCache.test.ts holds that line.
 *
 * `stale-while-revalidate` matters as much as the TTL here: when an entry
 * expires the edge serves the stale copy immediately and refreshes behind it,
 * so nobody waits on a slow upstream just because they arrived first.
 */
export function withEdgeCache(seconds: number, staleSeconds = seconds * 4) {
  return (handler: ApiHandler): ApiHandler =>
    async (req, res) => {
      // max-age keeps a short private copy in the visitor's own browser for
      // rapid re-renders; s-maxage is what the shared CDN honours.
      res.setHeader(
        "Cache-Control",
        `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`
      );
      return handler(req, res);
    };
}

/**
 * Same caching, but private to the one visitor who asked.
 *
 * For routes whose URL contains the user's own position. /api/reverse-geocode
 * and /api/route are deliberately exempt from the coordinate snapping in
 * src/services/geoPrecision.ts — snapping a reverse lookup returns the wrong
 * street — so their URLs carry the raw GPS fix, to full precision.
 *
 * Under `public` that URL was written into the shared CDN's access log beside
 * the caller's IP, and shared caches were invited to keep the response. Where
 * somebody lives is not something to hand a CDN for 40 minutes. `private`
 * keeps the speed-up in that person's own browser and nowhere else.
 */
export function withPrivateCache(seconds: number) {
  return (handler: ApiHandler): ApiHandler =>
    async (req, res) => {
      res.setHeader("Cache-Control", `private, max-age=${seconds}`);
      return handler(req, res);
    };
}

export function getQueryParam(req: ApiRequest, key: string): string | undefined {
  const value = req.query[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The caller's IP, taken from the end of the chain the proxy controls.
 *
 * This used to return `forwarded.split(",")[0]`, which is the WRONG end.
 * X-Forwarded-For is append-only: each proxy adds its view to the right, so
 * the leftmost entry is whatever the original client sent — a value the
 * client picks. Anyone could send `X-Forwarded-For: 1.2.3.4`, change the
 * number each request, and appear as a new IP every time.
 *
 * That mattered twice. This value is the key for every RateLimiter in the
 * API, so rotating the header made all of them unenforceable, including the
 * one guarding the admin key check and the ones guarding paid AI calls. It is
 * also written to `ip_address` on feedback and team applications, under a
 * comment claiming the client cannot spoof it — which was not true.
 *
 * `x-vercel-forwarded-for` is set by the platform and cannot be appended to
 * by a client, so it is preferred. The XFF fallback now reads the LAST entry,
 * the hop nearest our own proxy.
 */
/**
 * Marks a response as private to this caller and uncacheable.
 *
 * `ok()` sets no Cache-Control at all, so a successful admin response went
 * out with nothing — and its body changes depending on the admin key header,
 * which no shared cache could know without a Vary. The body is visitor PII
 * (names, emails, messages, IP addresses), so heuristic caching of it by any
 * intermediary is not acceptable.
 */
export function noStore(res: ApiResponse, varyOn = "x-geointel-admin-key"): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Vary", varyOn);
}

export function getClientIp(req: ApiRequest): string {
  const platform = req.headers["x-vercel-forwarded-for"] ?? req.headers["x-real-ip"];
  if (typeof platform === "string" && platform.trim()) return platform.split(",").pop()!.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",").pop()!.trim();
  return req.socket?.remoteAddress || "unknown";
}
