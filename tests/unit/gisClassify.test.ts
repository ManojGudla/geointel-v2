import { describe, expect, it } from "vitest";
import { classifyFeatures, totalEvidenceCount } from "../../api/_routes/gis";
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

  // Regression test for a real, reported bug: a genuinely 100% commercial
  // property was classified Residential. Root cause - building=commercial/
  // retail/office/supermarket/kiosk and landuse=commercial/retail
  // contributed NOTHING to the commercial score (only shop=/office=/amenity=
  // tags did), while the equivalent residential/industrial building
  // subtypes and landuse values DID feed their score. So a building tagged
  // just building=commercial (no separate shop=/office= tag - a very common
  // real-world OSM pattern) scored zero commercial evidence.
  it("counts a building=commercial/retail/office/supermarket/kiosk tag toward the commercial score, even with no shop/office/amenity tag", () => {
    const { counts, scores } = classifyFeatures([
      el({ building: "commercial" }),
      el({ building: "retail" }),
      el({ building: "office" }),
      el({ building: "supermarket" }),
      el({ building: "kiosk" }),
    ]);
    expect(counts.shops).toBe(4); // commercial, retail, supermarket, kiosk
    expect(counts.offices).toBe(1); // office
    expect(scores.commercial).toBeGreaterThan(0);
  });

  it("counts landuse=commercial/retail toward the commercial score, matching landuse=residential's treatment", () => {
    const { counts, scores } = classifyFeatures([el({ landuse: "commercial" }), el({ landuse: "retail" })]);
    expect(counts.shops).toBe(2);
    expect(scores.commercial).toBeGreaterThan(0);
  });

  it("classifies a building=commercial property as Commercial-leaning even at parity with nearby residential buildings (the actual reported bug)", () => {
    // Before the fix: building=commercial contributed ZERO to the
    // commercial score (only shop=/office=/amenity= tags did), while
    // building=house contributed +1 residential each. So even at an EQUAL
    // 2-vs-2 count, the old scorer produced commercial=0 vs residential=4 -
    // a real commercial property reads Residential purely because ordinary
    // homes are almost always mapped nearby too. After the fix, equal
    // counts correctly favor commercial (shop-weight x3 vs residential x2).
    const { scores } = classifyFeatures([
      el({ building: "commercial", name: "The property in question" }),
      el({ building: "commercial", name: "The property in question (2)" }),
      el({ building: "house" }),
      el({ building: "house" }),
    ]);
    expect(scores.commercial).toBeGreaterThan(scores.residential);
  });

  // Regression test for a real bug: a landmark like the Eiffel Tower is
  // tagged tourism=attraction with no building/shop/office/amenity tag of
  // its own. Before this fix, that meant its own OSM entry contributed ZERO
  // evidence and the location came back "Unknown" despite Overpass
  // returning real data for exactly the thing being looked up.
  it("counts a tourism=attraction node (e.g. a landmark with no building tag) toward the landmark score", () => {
    const { counts, scores } = classifyFeatures([el({ tourism: "attraction", name: "Eiffel Tower" })]);
    expect(counts.tourism).toBe(1);
    expect(scores.landmark).toBeGreaterThan(0);
    expect(totalEvidenceCount(counts)).toBeGreaterThan(0);
  });

  it("counts railway/public_transport/bus_stop features toward the transport score", () => {
    const { counts, scores } = classifyFeatures([
      el({ railway: "station" }),
      el({ public_transport: "stop_position" }),
      el({ highway: "bus_stop" }),
    ]);
    expect(counts.transport).toBe(3);
    expect(scores.transport).toBeGreaterThan(0);
  });
});

describe("totalEvidenceCount", () => {
  it("is zero only when every bucket is zero", () => {
    const { counts } = classifyFeatures([]);
    expect(totalEvidenceCount(counts)).toBe(0);
  });

  it("sums every bucket, not a hand-picked subset", () => {
    const { counts } = classifyFeatures([el({ tourism: "museum" }), el({ railway: "halt" })]);
    expect(totalEvidenceCount(counts)).toBe(2);
  });
});
