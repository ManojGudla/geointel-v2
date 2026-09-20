import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/live";
import { earthquakesToGeoJSON } from "@/features/live/liveGeo";

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }))
  );
}

const USGS_RESPONSE = {
  features: [
    {
      id: "us1",
      properties: { mag: 4.2, place: "120 km SW of Somewhere", time: 1788300000000, url: "https://example.org/us1", title: "M 4.2" },
      geometry: { coordinates: [78.4, 17.3, 10] },
    },
    {
      id: "us2",
      properties: { mag: 6.1, place: "Off the coast", time: 1788290000000, url: "https://example.org/us2", title: "M 6.1" },
      geometry: { coordinates: [-70.1, -33.2, 55] },
    },
    // Real feeds carry entries with a null magnitude; they must not become
    // NaN-radius circles on the map.
    { id: "us3", properties: { mag: null, place: "Unknown", time: null, url: null, title: null }, geometry: { coordinates: [0, 0, 0] } },
  ],
};

describe("api/live", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an unknown layer rather than silently returning nothing", async () => {
    const result = fakeReqRes({ layer: "traffic" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
    expect((result.body as { code: string }).code).toBe("UNKNOWN_LAYER");
  });

  it("maps the USGS feed into flat events, strongest first, dropping entries without a magnitude", async () => {
    mockFetch(USGS_RESPONSE);
    const result = fakeReqRes({ layer: "earthquakes", window: "day" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { events: Array<{ id: string; magnitude: number; lat: number; lon: number }> };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]!.magnitude).toBe(6.1);
    // GeoJSON is [lon, lat, depth] - getting this backwards would put every
    // quake in the wrong hemisphere, which is exactly the kind of error that
    // looks fine until someone who knows the region sees it.
    expect(body.events[1]!.lon).toBe(78.4);
    expect(body.events[1]!.lat).toBe(17.3);
  });

  it("builds a radar tile template from the newest frame", async () => {
    mockFetch({
      host: "https://tilecache.rainviewer.com",
      radar: { past: [{ time: 100, path: "/v2/radar/100" }], nowcast: [{ time: 200, path: "/v2/radar/200" }] },
    });
    const result = fakeReqRes({ layer: "radar" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { tileUrl: string; frameTime: number };
    expect(body.frameTime).toBe(200);
    expect(body.tileUrl).toContain("https://tilecache.rainviewer.com/v2/radar/200");
    expect(body.tileUrl).toContain("{z}/{x}/{y}");
  });

  it("reports the radar layer unavailable rather than half-building a URL when there are no frames", async () => {
    // The radar cache is keyed on a constant, so without moving past its TTL
    // this would be served the previous test's successful payload and pass
    // for the wrong reason. Stepping the clock forward is also a direct
    // check that the cache does expire rather than pinning the first frame
    // it ever saw.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    try {
      mockFetch({ host: "https://tilecache.rainviewer.com", radar: { past: [], nowcast: [] } });
      const result = fakeReqRes({ layer: "radar" });
      await handler(result.req, result.res);
      expect(result.statusCode).toBe(502);
      expect((result.body as { code: string }).code).toBe("PROVIDER_UNAVAILABLE");
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires coordinates for the air-quality reading", async () => {
    const result = fakeReqRes({ layer: "air-quality" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("returns the air-quality reading with its source named", async () => {
    mockFetch({ current: { european_aqi: 38, us_aqi: 51, pm2_5: 12.4, pm10: 28.1, nitrogen_dioxide: 9.2, ozone: 61, time: "2026-09-02T12:00" } });
    const result = fakeReqRes({ layer: "air-quality", lat: "17.36", lon: "78.47" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { europeanAqi: number; pm25: number; source: string };
    expect(body.europeanAqi).toBe(38);
    expect(body.pm25).toBe(12.4);
    expect(body.source).toContain("Open-Meteo");
  });

  it("never throws when a provider is unreachable - reports unavailable instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    // Coordinates not used by the earlier air-quality test, since successful
    // responses are cached by rounded lat/lon.
    const result = fakeReqRes({ layer: "air-quality", lat: "-12.34", lon: "56.78" });
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(502);
    expect((result.body as { code: string }).code).toBe("PROVIDER_UNAVAILABLE");
  });
});

describe("earthquakesToGeoJSON", () => {
  it("carries magnitude through as a property, since the map layer sizes and colours from it", () => {
    const collection = earthquakesToGeoJSON([
      { id: "a", magnitude: 5.4, place: "Somewhere", time: 1, url: null, lat: 17.3, lon: 78.4, depthKm: 12 },
    ]);
    expect(collection.features).toHaveLength(1);
    const feature = collection.features[0]!;
    expect(feature.properties?.magnitude).toBe(5.4);
    expect(feature.geometry).toEqual({ type: "Point", coordinates: [78.4, 17.3] });
  });

  it("returns an empty collection for no events, so the layer clears instead of keeping stale marks", () => {
    expect(earthquakesToGeoJSON([]).features).toEqual([]);
  });
});
