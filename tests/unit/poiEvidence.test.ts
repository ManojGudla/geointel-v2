import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/poi-evidence";

// A real Overpass response always carries a genuine osm3s replica
// timestamp (see api/_lib/overpass.ts's hasPlausibleReplicaTimestamp) —
// mirroring that here so these fixtures still look like a real mirror's
// response, not the corrupted/near-empty replica that check exists to
// reject.
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

describe("api/poi-evidence handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires lat/lon", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("reports unavailable trust with zero evidence rather than fabricating a result", async () => {
    mockOverpassResponse([]);
    const result = fakeReqRes({ lat: "10.10", lon: "20.20" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { poi: { trust: string; counts: Record<string, number> } };
    expect(parsed.poi.trust).toBe("unavailable");
    expect(Object.values(parsed.poi.counts).every((v) => v === 0)).toBe(true);
  });

  it("classifies real evidence and surfaces the nearest named feature", async () => {
    mockOverpassResponse([
      { type: "node", id: 1, lat: 11.11, lon: 22.22, tags: { shop: "supermarket", name: "Test Mart" } },
      { type: "node", id: 2, lat: 11.111, lon: 22.221, tags: { office: "company" } },
      { type: "node", id: 3, lat: 11.112, lon: 22.222, tags: { amenity: "cafe" } },
    ]);
    const result = fakeReqRes({ lat: "11.11", lon: "22.22" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { poi: { trust: string; scores: { commercial: number }; nearestFeature: { name: string } | null } };
    expect(parsed.poi.trust).toBe("verified");
    expect(parsed.poi.scores.commercial).toBeGreaterThan(0);
    expect(parsed.poi.nearestFeature?.name).toBe("Test Mart");
  });

  it("reads floor count from building:levels and reports null (not a guess) when absent", async () => {
    mockOverpassResponse([
      { type: "node", id: 1, lat: 55.55, lon: 66.66, tags: { building: "apartments", name: "Tall Tower", "building:levels": "9" } },
      { type: "node", id: 2, lat: 55.551, lon: 66.661, tags: { shop: "bakery", name: "Nearby Bakery" } },
    ]);
    const result = fakeReqRes({ lat: "55.55", lon: "66.66" });
    await handler(result.req, result.res);
    const parsed = result.body as {
      poi: {
        nearestFeature: { name: string; floors: string | null } | null;
        nearbyPois: Array<{ name: string; category: string; distanceMeters: number; floors: string | null }>;
      };
    };
    expect(parsed.poi.nearestFeature?.name).toBe("Tall Tower");
    expect(parsed.poi.nearestFeature?.floors).toBe("9 floors");
    // Nearby POIs are sorted by real distance and the second (unnamed-floor)
    // feature correctly reports floors: null rather than fabricating one.
    expect(parsed.poi.nearbyPois.length).toBeGreaterThanOrEqual(2);
    expect(parsed.poi.nearbyPois[0]!.name).toBe("Tall Tower");
    const bakery = parsed.poi.nearbyPois.find((p) => p.name === "Nearby Bakery");
    expect(bakery?.floors).toBeNull();
    expect(bakery?.distanceMeters).toBeGreaterThan(0);
  });

  // Regression coverage for a real usability problem: a click landing on a
  // road centroid or a gap between building footprints can legitimately
  // return zero elements at the tight 60m click radius even though real
  // evidence sits just a bit further out — that used to report a flat
  // "Vacant / Unknown" off one unlucky tight query. Now it auto-widens to
  // the max radius once before giving up, and is honest in the response
  // about which radius the result actually came from.
  it("auto-widens to the max radius when the default click radius finds nothing, and reports the radius actually used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const isWideQuery = init.body.includes("around:150");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              elements: isWideQuery ? [{ type: "node", id: 9, lat: 12.001, lon: 13.001, tags: { shop: "bakery", name: "Widened Bakery" } }] : [],
              osm3s: FAKE_OSM3S,
            }),
        };
      })
    );
    const result = fakeReqRes({ lat: "12.00", lon: "13.00" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { poi: { radiusMeters: number; trust: string; nearestFeature: { name: string } | null } };
    expect(parsed.poi.radiusMeters).toBe(150);
    expect(parsed.poi.trust).not.toBe("unavailable");
    expect(parsed.poi.nearestFeature?.name).toBe("Widened Bakery");
  });

  it("does not widen (and correctly reports Vacant/Unknown-equivalent zero evidence) when both radii genuinely find nothing", async () => {
    mockOverpassResponse([]);
    const result = fakeReqRes({ lat: "1.23", lon: "4.56" });
    await handler(result.req, result.res);
    const parsed = result.body as { poi: { radiusMeters: number; trust: string } };
    expect(parsed.poi.radiusMeters).toBe(60);
    expect(parsed.poi.trust).toBe("unavailable");
  });

  it("degrades to 'temporarily unavailable' instead of throwing when Overpass is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    // Different coordinates than the earlier tests — this handler caches
    // successful responses by rounded lat/lon, and reusing a point would
    // hit that cache instead of exercising the failure path here.
    const result = fakeReqRes({ lat: "33.33", lon: "44.44" });
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(502);
    expect((result.body as { code: string }).code).toBe("PROVIDER_UNAVAILABLE");
  });
});
