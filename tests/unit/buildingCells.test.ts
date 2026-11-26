import { describe, expect, it, vi, afterEach } from "vitest";
import { buildingCells, buildingsToGeoJSON, mergeBuildingCells, buildingColorExpression, pointInsideFootprint, BUILDING_HEIGHT_RAMP, MAX_BUILDING_CELLS } from "../../src/features/map/buildings3d";
import { buildingShapes, MAX_BUILDINGS_RETURNED } from "../../api/_routes/buildings";
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

  it("covers the whole view when it is wide or tilted, nearest first, up to the cap", () => {
    // Reported 25 November 2026: "some buildings are showing 3D and some are
    // not". A fixed 3x3 block left the far part of a wide or tilted view flat.
    const wide = { south: 17.36, west: 78.45, north: 17.42, east: 78.53 };
    const cells = buildingCells(HYD, wide);
    expect(cells).toHaveLength(MAX_BUILDING_CELLS);
    expect(cells[0]!.key).toBe("17.38,78.48");
    for (const c of cells) expect(c.north > wide.south && c.south < wide.north && c.east > wide.west && c.west < wide.east).toBe(true);
    const ring = new Set(cells.map((c) => c.key));
    // Every cell next to the centre comes before anything two cells away.
    for (const key of ["17.37,78.47", "17.37,78.48", "17.37,78.49", "17.38,78.47", "17.38,78.49", "17.39,78.47", "17.39,78.48", "17.39,78.49"]) expect(ring.has(key)).toBe(true);
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
    // More tiny buildings than the cap, listed first, then one large one.
    const elements = [...Array.from({ length: MAX_BUILDINGS_RETURNED + 100 }, (_, i) => square(i + 1, 0.00001)), square(99999, 0.001)];
    vi.doMock("../../api/_lib/overpass", async (orig) => ({
      ...(await orig<typeof import("../../api/_lib/overpass")>()),
      runOverpassQuery: vi.fn(async () => elements),
    }));
    const { default: handler } = await import("../../api/_routes/buildings");
    const call = fakeReqRes({ south: "17.38", west: "78.48", north: "17.39", east: "78.49" });
    await handler(call.req, call.res);
    const body = call.body as { buildings: Array<{ id: number }> };
    expect(body.buildings).toHaveLength(MAX_BUILDINGS_RETURNED);
    expect(body.buildings[0]!.id).toBe(99999);
  });
});

describe("buildings drawn as multipolygons", () => {
  const ring = (lat: number, lon: number, d: number) => [
    { lat: lat - d, lon: lon - d },
    { lat: lat - d, lon: lon + d },
    { lat: lat + d, lon: lon + d },
    { lat: lat + d, lon: lon - d },
    { lat: lat - d, lon: lon - d },
  ];

  it("are extruded, courtyard kept open, and never collide with a way's id", () => {
    const shapes = buildingShapes([
      {
        type: "relation",
        id: 4242,
        tags: { building: "commercial", "building:levels": "6", name: "Courtyard Block" },
        members: [
          { type: "way", ref: 1, role: "outer", geometry: ring(17.4, 78.4, 0.0006) },
          { type: "way", ref: 2, role: "inner", geometry: ring(17.4, 78.4, 0.0002) },
        ],
      },
      // The relation's own outline, also tagged building: drawn once, not twice.
      { type: "way", id: 1, tags: { building: "yes" }, geometry: ring(17.4, 78.4, 0.0006) },
      { type: "way", id: 4242, tags: { building: "house" }, geometry: ring(17.41, 78.41, 0.00005) },
    ]);
    const dtos = shapes.map((s) => s.dto);
    expect(dtos.map((d) => d.id).sort((a, b) => a - b)).toEqual([-424200, 4242]);
    const block = dtos.find((d) => d.id === -424200)!;
    expect(block).toMatchObject({ name: "Courtyard Block", heightIsEstimated: false });
    expect(block.holes).toHaveLength(1);
    const geo = buildingsToGeoJSON(dtos);
    expect((geo.features.find((f) => f.id === -424200)!.geometry as GeoJSON.Polygon).coordinates).toHaveLength(2);
  });

  it("send coordinates rounded to six decimals, about 11 cm", () => {
    const [shape] = buildingShapes([{ type: "way", id: 9, tags: { building: "yes" }, geometry: ring(17.123456789, 78.987654321, 0.0001) }]);
    for (const [lon, lat] of shape!.dto.polygon) {
      expect(lon).toBe(Math.round(lon * 1e6) / 1e6);
      expect(lat).toBe(Math.round(lat * 1e6) / 1e6);
    }
  });
});

describe("clicking a 3D building", () => {
  const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  // An L shape whose centre of corners falls outside it.
  const ell: Array<[number, number]> = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]];
  const inside = (ring: Array<[number, number]>, [x, y]: [number, number]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  it("keeps the click when it is inside the footprint", () => {
    expect(pointInsideFootprint(square, [3, 4])).toEqual([3, 4]);
  });

  it("moves a click that landed behind the building to inside it", () => {
    expect(pointInsideFootprint(square, [25, 40])).toEqual([5, 5]);
  });

  it("finds a point inside an L-shaped building whose centre is outside it", () => {
    expect(inside(ell, pointInsideFootprint(ell, [25, 40]))).toBe(true);
  });
});

