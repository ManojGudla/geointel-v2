import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fakeReqRes } from "./testUtils";
import { ok, err, withEdgeCache, withPrivateCache, type ApiHandler } from "../../api/_lib/http";

/**
 * Edge caching, and the line it must never cross.
 *
 * Why this exists: with more than twenty devices open at once the live site
 * was slow. No API response carried a Cache-Control header, so every request
 * from every device invoked the serverless function, and each function
 * instance starts with an empty in-memory cache. Twenty phones on the same
 * city meant twenty Wikidata queries and twenty Overpass queries against free
 * services that are slow and rate limited on purpose.
 *
 * Marking responses `public` lets Vercel's shared CDN answer the other
 * nineteen instantly. That is also the danger: a `public` response is handed
 * to WHOEVER asks for that URL next. So the rule below is not a style
 * preference, it is a privacy boundary. Public geographic data, keyed only by
 * the query string, may be cached. Anything shaped by who is asking - the
 * feedback form, job applications, AI conversations, the admin endpoints -
 * must never be, and this test is what stops one being wrapped by mistake.
 */

const ROUTES_DIR = join(process.cwd(), "api", "_routes");

/** Every handler file under api/_routes, including the nested ones. */
function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full, `${prefix}${entry}/`);
    return entry.endsWith(".ts") && entry !== "index.ts" ? [`${prefix}${entry}`] : [];
  });
}

const files = routeFiles(ROUTES_DIR);
const source = (name: string) => readFileSync(join(ROUTES_DIR, name), "utf8");
const isCached = (name: string) => source(name).includes("withEdgeCache(");
const isPrivate = (name: string) => source(name).includes("withPrivateCache(");

/**
 * Routes that must NEVER be marked public, and why each one would be a leak
 * rather than merely a stale answer.
 */
const MUST_NOT_CACHE: Record<string, string> = {
  "feedback.ts": "what one visitor typed would be served to the next",
  "team-apply.ts": "job applications contain names and contact details",
  "ai-intent.ts": "shaped by the visitor's own question",
  "ai/agent.ts": "shaped by the visitor's own question",
  "ai/copilot.ts": "shaped by the visitor's own question",
  "admin/maintenance.ts": "authenticated, and its answer depends on the caller",
  "admin/submissions.ts": "returns other people's submitted data",
  "health.ts": "a liveness probe answered from cache is not a liveness probe",
};

/** Public geographic data, keyed only by the query string. */
const MUST_CACHE = [
  "buildings.ts",
  "geocode.ts",
  "gis.ts",
  "imagery.ts",
  "live.ts",
  "nearby.ts",
  "news.ts",
  "officials.ts",
  "poi-evidence.ts",
  "population.ts",
  // Roads and construction status for a point. Public geographic data keyed
  // only by the snapped coordinates, and the heaviest Overpass query in the
  // app - the edge cache is what keeps it off the free mirrors.
  "site.ts",
  "weather.ts",
];

/**
 * The third category, added after an audit: safe to cache, but only for the
 * one person who asked.
 *
 * These two were in MUST_CACHE, and that was wrong in a way nothing here
 * caught, because the leak is not in the response body - it is in the URL.
 * src/services/geoPrecision.ts snaps coordinates to a coarse grid before they
 * reach most endpoints, both to make caching work and to stop full-precision
 * positions travelling. These two are DELIBERATELY exempt, because snapping a
 * reverse lookup returns the wrong street and snapping a route start moves it
 * off the road. So their URLs carry the visitor's real GPS fix.
 *
 * Marked `public`, that URL went into the shared CDN's access log next to the
 * caller's IP address, and shared caches were told they could keep the answer.
 * `private` keeps the speed-up in that person's own browser and nowhere else.
 */
const MUST_BE_PRIVATE: Record<string, string> = {
  "reverse-geocode.ts": "the URL is the visitor's exact position",
  "route.ts": "the URL is where the visitor is and where they are going",
};

describe("which routes may be cached at the edge", () => {
  it("found the route files at all", () => {
    // Without this the two checks below would pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files).toContain("population.ts");
    expect(files).toContain("ai/copilot.ts");
  });

  it("never marks a private or user-shaped response public", () => {
    const leaks = [...Object.keys(MUST_NOT_CACHE), ...Object.keys(MUST_BE_PRIVATE)]
      .filter((name) => files.includes(name) && isCached(name))
      .map((name) => `${name} - ${MUST_NOT_CACHE[name] ?? MUST_BE_PRIVATE[name]}`);
    expect(leaks).toEqual([]);
  });

  it("still caches the two location routes, just privately", () => {
    // Dropping caching altogether would have been the lazy fix and would have
    // made every keystroke of a search hit Nominatim again.
    const wrong = Object.keys(MUST_BE_PRIVATE).filter((name) => files.includes(name) && !isPrivate(name));
    expect(wrong).toEqual([]);
  });

  it("caches the public geographic endpoints, which is the point", () => {
    const missed = MUST_CACHE.filter((name) => files.includes(name) && !isCached(name));
    expect(missed).toEqual([]);
  });

  it("forces a decision about any route added later", () => {
    // A new endpoint belongs in exactly one of the two lists above. Left out
    // of both, nobody ever asks whether its answers are safe to share.
    const classified = new Set([...Object.keys(MUST_NOT_CACHE), ...Object.keys(MUST_BE_PRIVATE), ...MUST_CACHE]);
    const unclassified = files.filter((f) => !classified.has(f) && f !== "status.ts");
    expect(unclassified).toEqual([]);
  });

  it("gives each cached route a TTL no longer than its own in-memory cache", () => {
    // The edge holding an answer far longer than the code thinks it is fresh
    // would quietly turn a short-lived reading into a stale one.
    for (const name of MUST_CACHE) {
      const text = source(name);
      const edge = Number(/withEdgeCache\((\d+)\)/.exec(text)?.[1]);
      const ttlExpr = /new TtlCache<[^>]*>\(([^)]+)\)/.exec(text)?.[1];
      if (!ttlExpr) continue;
      // e.g. "6 * 60 * 60 * 1000" - evaluate the arithmetic literally.
      const ttlMs = ttlExpr
        .split("*")
        .map((n) => Number(n.trim().replace(/_/g, "")))
        .reduce((a, b) => a * b, 1);
      expect(Number.isFinite(edge)).toBe(true);
      expect(edge, `${name}: edge ${edge}s vs in-memory ${ttlMs / 1000}s`).toBeLessThanOrEqual(ttlMs / 1000);
    }
  });
});

describe("the cache headers themselves", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a private response out of every shared cache", () => {
    const handler = withPrivateCache(600)((_req, res) => ok(res, { address: "somewhere" }));
    const r = fakeReqRes();
    handler(r.req, r.res);

    const header = r.header("cache-control") ?? "";
    expect(header).toContain("private");
    expect(header).toContain("max-age=600");
    // The three directives that would hand it to somebody else.
    expect(header).not.toContain("public");
    expect(header).not.toContain("s-maxage");
    expect(header).not.toContain("stale-while-revalidate");
  });

  it("marks a successful response for the shared CDN, with stale-while-revalidate", () => {
    const handler = withEdgeCache(3600)((_req, res) => ok(res, { fine: true }));
    const r = fakeReqRes();
    handler(r.req, r.res);

    const header = r.header("cache-control") ?? "";
    expect(header).toContain("public");
    expect(header).toContain("s-maxage=3600");
    // Without this, the first visitor after expiry waits on the slow upstream
    // while everyone else could have had the stale copy instantly.
    expect(header).toContain("stale-while-revalidate=14400");
  });

  it("never caches an error, even on a route that is otherwise cached", () => {
    // The case that matters: a cached 429 would lock a visitor out for the
    // whole window, and a cached 503 would outlive the outage that caused it.
    for (const [status, message] of [[429, "slow down"], [400, "bad input"], [503, "maintenance"]] as const) {
      const handler: ApiHandler = withEdgeCache(86400)((_req, res) => err(res, status, message));
      const r = fakeReqRes();
      handler(r.req, r.res);
      expect(r.header("cache-control")).toBe("no-store");
      expect(r.statusCode).toBe(status);
    }
  });

  it("passes the request and response straight through to the handler", () => {
    // The wrapper must not change behaviour, only headers.
    const inner = vi.fn((_req: unknown, res: Parameters<ApiHandler>[1]) => ok(res, { value: 42 }));
    const r = fakeReqRes({ q: "test" });
    withEdgeCache(60)(inner as unknown as ApiHandler)(r.req, r.res);

    expect(inner).toHaveBeenCalledOnce();
    expect(r.body).toEqual({ ok: true, value: 42 });
  });
});
