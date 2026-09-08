import { describe, expect, it } from "vitest";
import { classifyFeatures } from "../../api/gis";
import type { OverpassElement } from "../../api/_lib/overpass";

function el(tags: Record<string, string>): OverpassElement {
  return { type: "node", id: Math.random(), lat: 17.36, lon: 78.47, tags };
}

describe("classifyFeatures", () => {
  it("returns all-zero counts and scores for no elements", () => {
    const { counts, scores } = classifyFeatures([]);
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
    expect(Object.values(scores).every((v) => v === 0)).toBe(true);
  });

  it("counts shops and offices toward the commercial score", () => {
    const { counts, scores } = classifyFeatures([el({ shop: "supermarket" }), el({ office: "company" })]);
    expect(counts.shops).toBe(1);
    expect(counts.offices).toBe(1);
    expect(scores.commercial).toBeGreaterThan(0);
  });

  it("counts residential buildings and landuse toward the residential score", () => {
    const { counts, scores } = classifyFeatures([el({ building: "house" }), el({ landuse: "residential" })]);
    expect(counts.residential).toBe(2);
    expect(scores.residential).toBeGreaterThan(0);
  });

  it("counts schools/hospitals toward institutional, not amenities-only", () => {
    const { counts } = classifyFeatures([el({ amenity: "school" }), el({ amenity: "hospital" })]);
    expect(counts.institutional).toBe(2);
    expect(counts.amenities).toBe(2);
  });
});
