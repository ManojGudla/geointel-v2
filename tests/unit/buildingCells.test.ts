import { describe, expect, it, vi, afterEach } from "vitest";
import { buildingCells, mergeBuildingCells, buildingColorExpression, BUILDING_HEIGHT_RAMP } from "../../src/features/map/buildings3d";
import { fakeReqRes } from "./testUtils";

/**
 * "Some buildings load and some don't, and more appear when I move the map."
 * Buildings now come in fixed cells around the map centre, kept as the map
 * moves, and the server drops the smallest buildings first when it must cap.
 */

const HYD = { lat: 17.385, lon: 78.4867 };

describe("buildingCells", () => {
  it("covers a 3x3 block around the centre, nearest first, on a fixed grid", () => {
    const cells = buildingCells(HYD, null);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toMatchObject({ south: 17.38, west: 78.48, north: 17.39, east: 78.49 });
    for (const c of cells) {
      expect(c.north - c.south).toBeCloseTo(0.01, 6);
      expect(c.east - c.west).toBeCloseTo(0.01, 6);
    }
  });

  it("gives the same cells for nearby centres, so a small pan reuses what loaded", () => {
    const a = buildingCells(HYD, null).map((c) => c.key).sort();
    const b = buildingCells({ lat: 17.3851, lon: 78.4869 }, null).map((c) => c.key).sort();
    expect(b).toEqual(a);
  });

  it("skips cells wholly off screen but always keeps the centre", () => {
    const narrow = { south: 17.384, west: 78.485, north: 17.386, east: 78.488 };
    const cells = buildingCells(HYD, narrow);
    expect(cells.map((c) => c.key)).toEqual(["17.38,78.48"]);
  });

  it("stays inside the server's size limit", () => {
    for (const c of buildingCells(HYD, null)) expect(Math.max(c.north - c.south, c.east - c.west)).toBeLessThanOrEqual(0.03);
  });
});

describe("mergeBuildingCells", () => {
  it("keeps a building on a cell edge once", () => {
    const b = (id: number) => ({ id, polygon: [], heightMeters: 6, heightIsEstimated: true });
    expect(mergeBuildingCells([[b(1), b(2)], undefined, [b(2), b(3)]]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe("height colours", () => {
  it("run from low to tall with clearly different colours, paler when estimated", () => {
    const expr = buildingColorExpression() as unknown[];
    expect(expr[0]).toBe("case");
    const stated = new Set(BUILDING_HEIGHT_RAMP.map((s) => s[1]));
    expect(stated.size).toBe(BUILDING_HEIGHT_RAMP.length);
    for (const [, stated, estimated] of BUILDING_HEIGHT_RAMP) expect(estimated).not.toBe(stated);
  });
});

describe("/api/buildings when an area has more buildings than the cap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/overpass");
  });

  it("drops the smallest, not an arbitrary scatter", async () => {
    vi.resetModules();
    const square = (id: number, size: number) => ({
      type: "way",
      id,
      tags: { building: "yes" },
      geometry: [
        { lat: 17.381, lon: 78.481 },
        { lat: 17.381, lon: 78.481 + size },
        { lat: 17.381 + size, lon: 78.481 + size },
        { lat: 17.381 + size, lon: 78.481 },
      ],
    });
    // 1,600 tiny buildings listed first, then one large one.
    const elements = [...Array.from({ length: 1600 }, (_, i) => square(i + 1, 0.00001)), square(99999, 0.001)];
    vi.doMock("../../api/_lib/overpass", async (orig) => ({
      ...(await orig<typeof import("../../api/_lib/overpass")>()),
      runOverpassQuery: vi.fn(async () => elements),
    }));
    const { default: handler } = await import("../../api/_routes/buildings");
    const call = fakeReqRes({ south: "17.38", west: "78.48", north: "17.39", east: "78.49" });
    await handler(call.req, call.res);
    const body = call.body as { buildings: Array<{ id: number }> };
    expect(body.buildings).toHaveLength(1500);
    expect(body.buildings[0]!.id).toBe(99999);
  });
});
