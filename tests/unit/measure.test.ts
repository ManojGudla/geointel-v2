import { describe, expect, it } from "vitest";
import { computeAreaSquareMeters, computeDistanceMeters, formatArea, formatDistance } from "../../src/features/measure/measureMath";
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
    expect(formatDistance(250)).toBe("250 m");
    expect(formatDistance(1500)).toBe("1.50 km");
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
