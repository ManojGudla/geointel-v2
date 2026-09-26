import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/gis";

/**
 * "Retrieved at" has to describe the data, not the request.
 *
 * The handler caches Overpass results for six hours and used to stamp every
 * response with the current time, cache hit or not. The property panel now
 * prints that time next to the classification, so a six-hour-old answer
 * would have been labelled as fetched this second.
 */

const FAKE_OSM3S = { timestamp_osm_base: "2026-09-26T00:00:00Z" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GIS evidence retrieval time", () => {
  it("keeps the original time on a cache hit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T08:00:00Z"));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ elements: [{ type: "node", id: 1, lat: 12.9001, lon: 77.6001, tags: { shop: "bakery" } }], osm3s: FAKE_OSM3S }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    // An unusual point so no other test has warmed this cache key.
    const q = { lat: "12.9001", lon: "77.6001", radius: "250" };
    const first = fakeReqRes(q);
    await handler(first.req, first.res);
    const firstAt = (first.body as { evidence: { fetchedAt: string } }).evidence.fetchedAt;
    expect(firstAt).toBe("2026-09-26T08:00:00.000Z");
    const callsAfterFirst = fetchMock.mock.calls.length;

    vi.setSystemTime(new Date("2026-09-26T11:30:00Z"));
    const second = fakeReqRes(q);
    await handler(second.req, second.res);

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // served from cache
    expect((second.body as { evidence: { fetchedAt: string } }).evidence.fetchedAt).toBe(firstAt);
  });
});

describe("empty GIS answers", () => {
  it("are neither kept in memory nor cached at the CDN for hours", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ elements: [], osm3s: FAKE_OSM3S }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const q = { lat: "12.9002", lon: "77.6002", radius: "250" };

    const first = fakeReqRes(q);
    await handler(first.req, first.res);
    expect(first.header("cache-control")).toContain("s-maxage=300");
    const calls = fetchMock.mock.calls.length;

    const second = fakeReqRes(q);
    await handler(second.req, second.res);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls); // asked again, not served from memory
  });
});
