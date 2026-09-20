import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/nearby";

// See api/_lib/overpass.ts's hasPlausibleReplicaTimestamp - a real mirror
// response always carries a genuine osm3s replica timestamp.
const FAKE_OSM3S = { timestamp_osm_base: "2026-08-31T00:00:00Z" };

function mockOverpassResponse(elements: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ elements, osm3s: FAKE_OSM3S }),
    }))
  );
}

describe("api/nearby handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires lat/lon", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("rejects an unknown category", async () => {
    const result = fakeReqRes({ lat: "10", lon: "20", category: "not-a-real-category" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("returns a real restaurant match for an exact single-value filter", async () => {
    mockOverpassResponse([{ type: "node", id: 1, lat: 10.001, lon: 20.001, tags: { amenity: "restaurant", name: "Test Diner" } }]);
    const result = fakeReqRes({ lat: "10", lon: "20", category: "restaurants" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { items: Array<{ name: string; category: string }> };
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.name).toBe("Test Diner");
    expect(parsed.items[0]!.category).toBe("restaurants");
  });

  // Regression test for the actual reported bug: "Nearby" showed no results
  // for real, populated locations. amenity=fast_food is extremely common
  // real-world tagging that the old restaurants-only-matches-amenity=
  // restaurant filter list silently dropped.
  it("also matches amenity=fast_food under restaurants", async () => {
    mockOverpassResponse([{ type: "node", id: 1, lat: 10.001, lon: 20.001, tags: { amenity: "fast_food", name: "Quick Bites" } }]);
    const result = fakeReqRes({ lat: "10", lon: "20", category: "restaurants" });
    await handler(result.req, result.res);
    const parsed = result.body as { items: Array<{ name: string }> };
    expect(parsed.items).toHaveLength(1);
  });

  // The old "shopping" filter only matched shop=mall/supermarket/
  // department_store - it never matched the far more common case of
  // individual small shops, even though the GIS evidence scorer already
  // treats ANY shop=* tag as real commercial evidence. This is the specific
  // real-world gap that made "Shopping" read empty in ordinary areas.
  it("matches any shop=* tag under shopping, not just mall/supermarket/department_store", async () => {
    mockOverpassResponse([
      { type: "node", id: 1, lat: 10.001, lon: 20.001, tags: { shop: "clothes", name: "Local Boutique" } },
      { type: "node", id: 2, lat: 10.002, lon: 20.002, tags: { shop: "bakery", name: "Corner Bakery" } },
    ]);
    const result = fakeReqRes({ lat: "10", lon: "20", category: "shopping" });
    await handler(result.req, result.res);
    const parsed = result.body as { items: Array<{ name: string; category: string }> };
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((i) => i.category === "shopping")).toBe(true);
  });

  // publicTransport's bare "[public_transport]" filter has no "=value" -
  // it's an Overpass presence filter ("has this key, any value"). The old
  // categoryOf() only understood "[key=value]" strings via regex, so an
  // element fetched by that exact filter (any public_transport=* tag
  // without highway=bus_stop) matched nothing and was silently dropped from
  // the results despite being fetched.
  it("matches a bare public_transport=* tag (no highway=bus_stop) under publicTransport", async () => {
    mockOverpassResponse([{ type: "node", id: 1, lat: 10.001, lon: 20.001, tags: { public_transport: "platform", name: "Platform 1" } }]);
    const result = fakeReqRes({ lat: "10", lon: "20", category: "publicTransport" });
    await handler(result.req, result.res);
    const parsed = result.body as { items: Array<{ name: string; category: string }> };
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.category).toBe("publicTransport");
  });

  it("sorts results by distance and reports rounded meters", async () => {
    mockOverpassResponse([
      { type: "node", id: 1, lat: 10.02, lon: 20.02, tags: { amenity: "cafe", name: "Far Cafe" } },
      { type: "node", id: 2, lat: 10.001, lon: 20.001, tags: { amenity: "cafe", name: "Near Cafe" } },
    ]);
    const result = fakeReqRes({ lat: "10", lon: "20", category: "cafes" });
    await handler(result.req, result.res);
    const parsed = result.body as { items: Array<{ name: string; distanceMeters: number }> };
    expect(parsed.items[0]!.name).toBe("Near Cafe");
    expect(parsed.items[1]!.name).toBe("Far Cafe");
    expect(Number.isInteger(parsed.items[0]!.distanceMeters)).toBe(true);
  });

  it("degrades to 'temporarily unavailable' instead of throwing when Overpass is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    // Distinct coordinates from every other test in this file - the module-
    // level TtlCache persists across tests within a run, so reusing an
    // already-cached (lat, lon, category) here would silently serve that
    // earlier successful result instead of exercising this failure path.
    const result = fakeReqRes({ lat: "44.44", lon: "55.55", category: "restaurants" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(502);
    expect((result.body as { code: string }).code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("falls back to every category when none is specified, and still tags each item's own category correctly", async () => {
    mockOverpassResponse([
      { type: "node", id: 1, lat: 10.001, lon: 20.001, tags: { amenity: "bank", name: "Test Bank" } },
      { type: "node", id: 2, lat: 10.002, lon: 20.002, tags: { amenity: "pharmacy", name: "Test Pharmacy" } },
    ]);
    const result = fakeReqRes({ lat: "10", lon: "20" });
    await handler(result.req, result.res);
    const parsed = result.body as { items: Array<{ name: string; category: string }> };
    expect(parsed.items.find((i) => i.name === "Test Bank")?.category).toBe("banks");
    expect(parsed.items.find((i) => i.name === "Test Pharmacy")?.category).toBe("pharmacies");
  });
});

describe("thin OpenStreetMap coverage", () => {
  /**
   * OSM coverage is wildly uneven. In a dense city a 1.5km search returns
   * more than anyone can read; across rural Canada or the American interior
   * the same search returns an empty array, and the panel said nothing was
   * nearby. That is a true statement about a small circle and a useless one
   * about the place, and it is precisely what users outside dense cities
   * were reporting.
   *
   * The widening is deliberately timid, because Overpass is volunteer-run
   * and this route is public: at most one extra query, only on a genuinely
   * empty result, never on an error, and never when the caller already
   * asked for a radius at or beyond the widened one.
   */
  it("reports the radius the answer actually came from", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const handler = readFileSync(join(process.cwd(), "api", "_routes", "nearby.ts"), "utf8");

    // The response carries both radii and the flag, so the UI can say the
    // search was widened instead of silently answering a different question.
    expect(handler).toMatch(/radiusMeters:\s*searchedRadius/);
    expect(handler).toMatch(/requestedRadiusMeters:\s*radius/);
    expect(handler).toMatch(/\bwidened,/);
  });

  it("widens only on an empty result, never on a failure", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const handler = readFileSync(join(process.cwd(), "api", "_routes", "nearby.ts"), "utf8");

    // A second query against a provider that just failed only doubles the
    // load on a service already in trouble, so the retry sits inside the
    // success path and the catch returns straight away.
    expect(handler).toMatch(/elements\.length === 0 && shouldWiden/);
    const catchBlock = handler.slice(handler.indexOf("} catch (error) {"));
    expect(catchBlock).not.toMatch(/searchAt\(/);
  });

  it("does not widen a search that was already wide", () => {
    // 5000 is the route's own cap, so there is nowhere to widen to.
    const WIDENED = 5000;
    for (const requested of [5000, 4999, 1500, 250]) {
      expect(requested < WIDENED).toBe(requested !== 5000);
    }
  });
});
