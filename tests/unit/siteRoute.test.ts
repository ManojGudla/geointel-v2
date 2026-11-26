import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";

/**
 * GET /api/site, with Overpass replaced. MOCK: proves the wiring (counting,
 * flagging, de-duplicating and caching), not the live data.
 *
 * Added 26 November 2026, when the owner reported that construction results
 * looked random. One cause was a cut-short answer from the map server being
 * cached for six hours like a complete one.
 */
const state = vi.hoisted(() => ({ calls: 0, incomplete: false }));

const NOW_YEAR = new Date().getUTCFullYear();

vi.mock("../../api/_lib/overpass", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../api/_lib/overpass")>();
  return {
    ...real,
    runOverpassQueryDetailed: vi.fn(async () => {
      state.calls++;
      return {
        incomplete: state.incomplete,
        dataAsOf: "2026-11-25T16:00:00Z",
        elements: [
          // A tower being built now, edited recently.
          { type: "way", id: 1, tags: { building: "construction", name: "Tower A" }, center: { lat: 17.44, lon: 78.38 }, timestamp: `${NOW_YEAR}-10-01T00:00:00Z` },
          // The same way again, as a second clause would return it.
          { type: "way", id: 1, tags: { building: "construction", name: "Tower A" }, center: { lat: 17.44, lon: 78.38 }, timestamp: `${NOW_YEAR}-10-01T00:00:00Z` },
          // A metro line under construction.
          { type: "way", id: 2, tags: { railway: "construction", construction: "subway", name: "Metro Phase 2" }, center: { lat: 17.441, lon: 78.381 }, timestamp: `${NOW_YEAR}-09-01T00:00:00Z` },
          // A road whose planned end date is long past.
          { type: "way", id: 3, tags: { highway: "construction", end_date: "2019-12" }, center: { lat: 17.442, lon: 78.382 }, timestamp: `${NOW_YEAR}-01-01T00:00:00Z` },
          // A site nobody has touched for years.
          { type: "way", id: 4, tags: { landuse: "construction" }, center: { lat: 17.443, lon: 78.383 }, timestamp: "2015-05-05T00:00:00Z" },
          // Land awaiting development: never "finished", however old.
          { type: "way", id: 5, tags: { landuse: "brownfield" }, center: { lat: 17.444, lon: 78.384 }, timestamp: "2014-01-01T00:00:00Z" },
          { type: "way", id: 6, tags: { highway: "residential", name: "Road No. 1" }, center: { lat: 17.44, lon: 78.38 } },
        ],
      };
    }),
  };
});

import handler from "../../api/_routes/site";

// Answers are cached per point rounded to about 100 m, so every test asks
// about its own point.

async function get(query: Record<string, string>) {
  const r = fakeReqRes(query);
  r.req.method = "GET";
  (r.req.headers as Record<string, string>)["x-forwarded-for"] = `198.51.100.${Math.floor(Math.random() * 200)}`;
  await handler(r.req, r.res);
  return r;
}

type Body = {
  counts: { roads: number; underConstruction: number; awaitingDevelopment: number; mayBeFinished: number };
  features: Array<{ osm: string; kind: string; mayBeFinished?: string; becoming?: string }>;
  dataAsOf: string;
  incomplete?: boolean;
};

beforeEach(() => {
  state.calls = 0;
  state.incomplete = false;
});

describe("GET /api/site", () => {
  it("counts only current work as under construction and flags the rest as possibly finished", async () => {
    const r = await get({ lat: "17.451", lon: "78.381" });
    expect(r.statusCode).toBe(200);
    const body = r.body as Body;
    expect(body.counts.underConstruction).toBe(2); // Tower A and the metro
    expect(body.counts.mayBeFinished).toBe(2); // the overdue road and the forgotten site
    expect(body.counts.awaitingDevelopment).toBe(1);
    expect(body.features.find((f) => f.osm === "way/3")?.mayBeFinished).toContain("2019-12");
    expect(body.features.find((f) => f.osm === "way/4")?.mayBeFinished).toContain("2015");
    expect(body.features.find((f) => f.osm === "way/5")?.mayBeFinished).toBeUndefined();
    expect(body.dataAsOf).toBe("2026-11-25T16:00:00Z");
  });

  it("finds metro and rail lines being built", async () => {
    const body = (await get({ lat: "17.453", lon: "78.383" })).body as Body;
    const metro = body.features.find((f) => f.osm === "way/2");
    expect(metro?.kind).toBe("rail-works");
    expect(metro?.becoming).toBe("subway");
  });

  it("lists a record once even when two clauses return it", async () => {
    const body = (await get({ lat: "17.455", lon: "78.385" })).body as Body;
    expect(body.features.filter((f) => f.osm === "way/1")).toHaveLength(1);
  });

  it("never caches a cut-short answer, so asking again can complete it", async () => {
    state.incomplete = true;
    const first = await get({ lat: "17.457", lon: "78.387" });
    expect((first.body as Body).incomplete).toBe(true);
    expect(first.header("cache-control")).toBe("no-store");
    await get({ lat: "17.457", lon: "78.387" });
    expect(state.calls).toBe(2);
  });

  it("caches a complete answer", async () => {
    await get({ lat: "17.459", lon: "78.389" });
    await get({ lat: "17.459", lon: "78.389" });
    expect(state.calls).toBe(1);
  });
});
