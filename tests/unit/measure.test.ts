import { describe, expect, it } from "vitest";
import { computeAreaSquareMeters, computeDistanceMeters } from "../../src/features/measure/measureMath";
/*
  The formatters moved to geo.ts. There were two of them, both called
  formatDistance, and the one that lived here took no unit preference at
  all, so the measurement tool silently ignored an Imperial setting that
  Directions honoured. The `true` below asks for the extra decimal place
  this tool has always shown.
*/
import { formatArea, formatDistance } from "../../src/features/map/geo";
import { buildMeasureGeoJSON } from "../../src/features/measure/measureGeo";

describe("measureMath", () => {
  it("returns 0 distance below 2 points", () => {
    expect(computeDistanceMeters([])).toBe(0);
    expect(computeDistanceMeters([[78.4867, 17.385]])).toBe(0);
  });

  it("computes a known distance to within a small tolerance", () => {
    // Two points ~1km apart along a meridian (roughly 0.009 deg latitude ≈ 1km).
    const meters = computeDistanceMeters([
      [78.4867, 17.385],
      [78.4867, 17.394],
    ]);
    expect(meters).toBeGreaterThan(950);
    expect(meters).toBeLessThan(1050);
  });

  it("sums a multi-segment path", () => {
    const meters = computeDistanceMeters([
      [78.4867, 17.385],
      [78.4867, 17.394],
      [78.4867, 17.403],
    ]);
    expect(meters).toBeGreaterThan(1900);
    expect(meters).toBeLessThan(2100);
  });

  it("returns 0 area below 3 points", () => {
    expect(computeAreaSquareMeters([])).toBe(0);
    expect(
      computeAreaSquareMeters([
        [78.4867, 17.385],
        [78.487, 17.385],
      ])
    ).toBe(0);
  });

  it("computes a known square's area to within a small tolerance", () => {
    // Roughly a 100m x 100m square near the equatorial-ish latitude used
    // elsewhere in this project's fixtures.
    const d = 0.0009; // ~100m in degrees at this latitude
    const meters2 = computeAreaSquareMeters([
      [78.4867, 17.385],
      [78.4867 + d, 17.385],
      [78.4867 + d, 17.385 + d],
      [78.4867, 17.385 + d],
    ]);
    expect(meters2).toBeGreaterThan(8000);
    expect(meters2).toBeLessThan(12000);
  });

  it("formats distance in meters below 1km and kilometers at/above", () => {
    expect(formatDistance(250, "metric", true)).toBe("250 m");
    expect(formatDistance(1500, "metric", true)).toBe("1.50 km");
    // A route is not a measurement: one decimal place, by default.
    expect(formatDistance(1500)).toBe("1.5 km");
    // And the Imperial setting now reaches this side of the product.
    expect(formatDistance(1609.34, "imperial")).toBe("1.0 mi");
  });

  it("formats area in m², hectares, or km² depending on magnitude", () => {
    expect(formatArea(500)).toBe("500 m²");
    expect(formatArea(50_000)).toBe("5.00 ha");
    expect(formatArea(2_000_000)).toBe("2.00 km²");
  });
});

describe("buildMeasureGeoJSON", () => {
  it("returns only point features before a line/polygon is possible", () => {
    const fc = buildMeasureGeoJSON("distance", [[78.4867, 17.385]]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.type).toBe("Point");
  });

  it("adds a LineString once 2+ points exist in distance mode", () => {
    const fc = buildMeasureGeoJSON("distance", [
      [78.4867, 17.385],
      [78.4877, 17.386],
    ]);
    expect(fc.features).toHaveLength(3); // 2 points + 1 line
    expect(fc.features.some((f) => f.geometry.type === "LineString")).toBe(true);
  });

  it("adds a closed Polygon once 3+ points exist in area mode", () => {
    const fc = buildMeasureGeoJSON("area", [
      [78.4867, 17.385],
      [78.4877, 17.385],
      [78.4877, 17.386],
    ]);
    const polygon = fc.features.find((f) => f.geometry.type === "Polygon");
    expect(polygon).toBeDefined();
    const ring = (polygon!.geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]); // auto-closed
  });

  it("returns an empty collection when mode is off", () => {
    const fc = buildMeasureGeoJSON("off", [[78.4867, 17.385]]);
    // Points still render even when mode flips to "off" mid-frame, but no
    // line/polygon is drawn since neither branch matches "off".
    expect(fc.features.every((f) => f.geometry.type === "Point")).toBe(true);
  });
});

describe("one formatter, one unit system", () => {
  /**
   * There were two exported functions named `formatDistance`. One took a
   * unit preference and supported imperial; the other took neither. Three
   * files imported the first and four imported the second, and nothing at a
   * call site told you which you had.
   *
   * The visible symptom: a reader who chose Imperial in Settings got miles
   * in Directions and metres in the measurement tool, spatial analysis
   * results and the map command bar. Half the product quietly ignored the
   * setting, and both functions were individually correct, which is why it
   * survived so long.
   */
  it("leaves no second formatter behind to drift from this one", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src", "features", "measure", "measureMath.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/export function format(Distance|Area)/);
  });

  it("honours the imperial setting everywhere it is passed", async () => {
    const { formatDistance, formatArea } = await import("../../src/features/map/geo");
    // Feet below 1,000 of them, miles above: 500m is 1,640ft, and tenths of
    // a mile is how US apps conventionally read at that range.
    expect(formatDistance(200, "imperial")).toBe("656 ft");
    expect(formatDistance(500, "imperial")).toBe("0.3 mi");
    expect(formatDistance(10_000, "imperial")).toBe("6.2 mi");
    // Acres, not square feet: nobody reads "218,000 sq ft" as a size.
    expect(formatArea(20_000, "imperial")).toBe("4.94 acres");
    expect(formatArea(500, "imperial")).toBe("5382 sq ft");
    expect(formatArea(3_000_000, "imperial")).toBe("1.16 sq mi");
  });

  it("still gives metric exactly what it gave before", async () => {
    const { formatDistance, formatArea } = await import("../../src/features/map/geo");
    expect(formatDistance(250)).toBe("250 m");
    expect(formatArea(500)).toBe("500 m²");
    expect(formatArea(50_000)).toBe("5.00 ha");
    expect(formatArea(2_000_000)).toBe("2.00 km²");
  });
});
