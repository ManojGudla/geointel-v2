import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import nearbyHandler from "../../api/_routes/nearby";
import healthHandler from "../../api/_routes/health";
import {
  OVERPASS_ENDPOINTS,
  orderedEndpoints,
  getOverpassHealth,
  resetOverpassHealth,
  runOverpassQueryDetailed,
  OverpassUnavailableError,
} from "../../api/_lib/overpass";
import { mentionsAPlace, parseMapCommand } from "../../src/features/ai/mapCommands";
import { nearbyFreshnessNote } from "../../src/services/intel";

const OSM3S = { timestamp_osm_base: "2026-08-10T00:10:23Z" };
const HOSPITAL = { type: "node", id: 7, lat: 17.386, lon: 78.488, tags: { amenity: "hospital", name: "Test Hospital" } };

/** Each mirror answers according to `behaviour`; anything else fails fast. */
function stubMirrors(behaviour: (url: string) => "ok" | "fail") {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      if (behaviour(String(url)) === "ok") {
        return { ok: true, status: 200, text: async () => JSON.stringify({ elements: [HOSPITAL], osm3s: OSM3S }) };
      }
      return { ok: false, status: 429, text: async () => "at capacity" };
    })
  );
  return calls;
}

describe("Overpass mirror resilience (2026-11-06 outage)", () => {
  beforeEach(() => resetOverpassHealth());
  afterEach(() => vi.unstubAllGlobals());

  it("includes the openstreetmap.fr mirror in the first wave and drops the broken ones", () => {
    expect(OVERPASS_ENDPOINTS.slice(0, 2)).toContain("https://overpass.openstreetmap.fr/api/interpreter");
    expect(OVERPASS_ENDPOINTS.some((e) => e.includes("osm.ch"))).toBe(false);
    expect(OVERPASS_ENDPOINTS.some((e) => e.includes("nchc.org.tw"))).toBe(false);
  });

  it("answers from the one healthy mirror and reports how current its data is", async () => {
    stubMirrors((url) => (url.includes("openstreetmap.fr") ? "ok" : "fail"));
    const result = await runOverpassQueryDetailed("[out:json];node(1);out;");
    expect(result.elements).toHaveLength(1);
    expect(result.dataAsOf).toBe(OSM3S.timestamp_osm_base);
    expect(getOverpassHealth().status).toBe("ok");
  });

  it("puts mirrors that just failed at the back of the queue", async () => {
    stubMirrors((url) => (url.includes("openstreetmap.fr") ? "ok" : "fail"));
    await runOverpassQueryDetailed("[out:json];node(1);out;");
    const order = orderedEndpoints();
    expect(order[0]).toBe("https://overpass.openstreetmap.fr/api/interpreter");
    // overpass-api.de failed, so it is no longer first - but it is still in the list.
    expect(order[0]).not.toBe("https://overpass-api.de/api/interpreter");
    expect(order).toHaveLength(OVERPASS_ENDPOINTS.length);
  });

  it("throws a named error when every mirror fails, and health reports degraded", async () => {
    stubMirrors(() => "fail");
    await expect(runOverpassQueryDetailed("[out:json];node(1);out;")).rejects.toBeInstanceOf(OverpassUnavailableError);
    expect(getOverpassHealth().status).toBe("degraded");

    const res = fakeReqRes({});
    await healthHandler(res.req, res.res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe("degraded");
  });

  it("health says online, not degraded, before any map-data query has run", async () => {
    const res = fakeReqRes({});
    await healthHandler(res.req, res.res);
    expect((res.body as { status: string; services: { mapData: string } }).status).toBe("online");
    expect((res.body as { services: { mapData: string } }).services.mapData).toBe("unknown");
  });
});

describe("api/nearby during an outage", () => {
  beforeEach(() => resetOverpassHealth());
  afterEach(() => vi.unstubAllGlobals());

  it("serves the last good answer, labelled as saved, when every mirror fails", async () => {
    // Unique coordinates so the module-level caches from other tests don't interfere.
    const query = { lat: "12.3456", lon: "45.6789", radius: "2000", category: "hospitals" };

    stubMirrors(() => "ok");
    const first = fakeReqRes(query);
    await nearbyHandler(first.req, first.res);
    expect(first.statusCode).toBe(200);
    expect((first.body as { stale: boolean }).stale).toBe(false);
    expect((first.body as { dataAsOf: string }).dataAsOf).toBe(OSM3S.timestamp_osm_base);

    // The live cache is six hours; jump past it so the route has to ask the mirrors again.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    try {
      stubMirrors(() => "fail");
      const second = fakeReqRes(query);
      await nearbyHandler(second.req, second.res);
      expect(second.statusCode).toBe(200);
      const body = second.body as { stale: boolean; items: unknown[] };
      expect(body.stale).toBe(true);
      expect(body.items).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains the failure in plain language when there is nothing saved", async () => {
    stubMirrors(() => "fail");
    const res = fakeReqRes({ lat: "-33.1111", lon: "151.2222", radius: "1000", category: "schools" });
    await nearbyHandler(res.req, res.res);
    expect(res.statusCode).toBe(502);
    const message = (res.body as { error: string }).error;
    expect(message).toMatch(/try again/i);
    expect(message).not.toMatch(/mirror/i);
  });
});

describe("search box: spatial questions vs place names", () => {
  it.each(["hospitals within 2 km", "schools within 1 km", "what is within 800 m", "is this a good place for a restaurant", "nearest atm"])(
    "does not geocode %s",
    (q) => {
      expect(parseMapCommand(q)).not.toBeNull();
      expect(mentionsAPlace(q)).toBe(false);
    }
  );

  it.each(["hospitals near Charminar", "schools in Ameerpet", "atms around Banjara Hills"])("still geocodes %s", (q) => {
    expect(mentionsAPlace(q)).toBe(true);
  });
});

describe("freshness note", () => {
  it("names a saved answer as saved", () => {
    expect(nearbyFreshnessNote({ stale: true, fetchedAt: "2026-11-01T10:00:00Z", dataAsOf: null })).toMatch(/last saved answer/);
  });
  it("gives the data date for a live answer", () => {
    expect(nearbyFreshnessNote({ stale: false, fetchedAt: null, dataAsOf: "2026-08-10T00:10:23Z" })).toMatch(/data as of/);
  });
  it("says nothing when the mirror gave no real date", () => {
    expect(nearbyFreshnessNote({ stale: false, fetchedAt: null, dataAsOf: "118257" })).toBeNull();
  });
});
