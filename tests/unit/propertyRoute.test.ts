import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";

/** GET /api/property, with Overpass replaced (MOCK: proves the wiring, not the data). */
const state = vi.hoisted(() => ({ calls: [] as string[], fail: false }));

vi.mock("../../api/_lib/overpass", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../api/_lib/overpass")>();
  return {
    ...real,
    runOverpassQueryDetailed: vi.fn(async (query: string) => {
      state.calls.push(query);
      if (state.fail) throw new real.OverpassUnavailableError([]);
      return {
        dataAsOf: "2026-11-25T16:00:00Z",
        elements: [
          {
            type: "way",
            id: 630847222,
            tags: { building: "office", "building:levels": "9", name: "Wave Rock Tower 2.3", "fixme:private": "dropped" },
            geometry: [
              { lat: 17.419826, lon: 78.347406 }, { lat: 17.419193, lon: 78.347002 }, { lat: 17.419019, lon: 78.347297 },
              { lat: 17.419642, lon: 78.347726 }, { lat: 17.419826, lon: 78.347406 },
            ],
          },
        ],
      };
    }),
  };
});

import handler from "../../api/_routes/property";

async function get(query: Record<string, string>) {
  const r = fakeReqRes(query);
  r.req.method = "GET";
  (r.req.headers as Record<string, string>)["x-forwarded-for"] = `203.0.113.${Math.floor(Math.random() * 200)}`;
  await handler(r.req, r.res);
  return r;
}

beforeEach(() => {
  state.calls = [];
  state.fail = false;
});

describe("GET /api/property", () => {
  it("returns the building at the exact point, with only the tags that matter", async () => {
    const r = await get({ lat: "17.419687", lon: "78.347545" });
    expect(r.statusCode).toBe(200);
    const site = (r.body as { site: { building: { id: number; containsPoint: boolean; tags: Record<string, string> } } }).site;
    expect(site.building.id).toBe(630847222);
    expect(site.building.containsPoint).toBe(true);
    expect(site.building.tags).toEqual({ building: "office", "building:levels": "9", name: "Wave Rock Tower 2.3" });
  });

  it("asks about the exact point (to about a metre), not a snapped one", async () => {
    // A point not asked about above: answers are cached per point.
    await get({ lat: "17.419611", lon: "78.347411" });
    expect(state.calls[0]).toContain("around:100,17.41961,78.34741");
    expect(state.calls[0]).toContain("is_in(17.41961,78.34741)");
  });

  it("keeps the answer in the visitor's own browser only", async () => {
    const r = await get({ lat: "17.419687", lon: "78.347545" });
    expect(r.header("cache-control")).toMatch(/^private/);
  });

  it("refuses coordinates that are missing or off the globe", async () => {
    expect((await get({ lat: "17.4" })).statusCode).toBe(400);
    expect((await get({ lat: "95", lon: "78" })).statusCode).toBe(400);
  });

  it("says plainly when the map servers are overloaded", async () => {
    state.fail = true;
    const r = await get({ lat: "40.7128", lon: "-74.006" });
    expect(r.statusCode).toBe(502);
    expect((r.body as { error: string }).error).toMatch(/overloaded/);
  });
});
