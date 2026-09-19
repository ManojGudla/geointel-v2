import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_USER_AGENT, fetchWithTimeout } from "../../api/_lib/cache";

/**
 * This application is built entirely on free public infrastructure:
 * Nominatim, Overpass, OSRM, Open-Meteo, Wikidata, USGS. Every one of those
 * asks clients to identify themselves, and several enforce it.
 *
 * api/_lib/overpass.ts records what enforcement looks like: from a home IP
 * the mirrors tolerated an anonymous request, but from Vercel's datacenter
 * IPs overpass-api.de answered HTTP 406, a WAF refusing an unidentified
 * cloud client rather than a real content-negotiation failure. Every
 * outbound client was given a User-Agent after that.
 *
 * Except one. api/_routes/route.ts called `fetchWithTimeout(url, {})`, with
 * no headers at all, against routing.openstreetmap.de, which is FOSSGIS-run
 * and has the same expectation. Directions are the feature most likely to
 * work locally and fail in production for exactly that reason, and that is
 * what was reported.
 */

afterEach(() => vi.unstubAllGlobals());

describe("outbound requests identify this app", () => {
  it("adds a User-Agent when the caller sets no headers at all", async () => {
    // The route handler's exact call shape.
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    await fetchWithTimeout("https://routing.openstreetmap.de/routed-car/route/v1/driving/1,2;3,4", {}, 1000);

    const [, init] = spy.mock.calls[0] as unknown as [string, { headers: Headers }];
    expect(init.headers.get("User-Agent")).toBe(DEFAULT_USER_AGENT);
  });

  it("adds it when the caller sets other headers but not this one", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    await fetchWithTimeout("https://example.org", { headers: { Accept: "application/json" } }, 1000);

    const [, init] = spy.mock.calls[0] as unknown as [string, { headers: Headers }];
    expect(init.headers.get("User-Agent")).toBe(DEFAULT_USER_AGENT);
    expect(init.headers.get("Accept")).toBe("application/json");
  });

  it("never overrides one a caller set deliberately", async () => {
    // Nominatim, Overpass and Wikidata each send their own, and their usage
    // policies are the reason those differ.
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    await fetchWithTimeout("https://example.org", { headers: { "User-Agent": "something-specific/1.0" } }, 1000);

    const [, init] = spy.mock.calls[0] as unknown as [string, { headers: Headers }];
    expect(init.headers.get("User-Agent")).toBe("something-specific/1.0");
  });

  it("still aborts on the timeout it was given", async () => {
    // Adding a header must not disturb the signal this function exists for.
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await fetchWithTimeout("https://example.org", {}, 1000);
    const [, init] = spy.mock.calls[0] as unknown as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("routes every outbound call through the one function that adds it", () => {
    /*
      The real guard. A handler that reaches for global fetch directly gets
      no identification, which is how this was missed the first time. If a
      new one legitimately needs raw fetch, this test should be updated with
      a reason rather than deleted.
    */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".ts")) continue;
        const source = readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        // `fetch(` not preceded by a word character, so fetchWithTimeout and
        // node-fetch-style wrappers do not count.
        if (/(^|[^\w.])fetch\s*\(/.test(source) && !full.endsWith(join("_lib", "cache.ts"))) {
          offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), "api"));
    expect(offenders).toEqual([]);
  });
});
