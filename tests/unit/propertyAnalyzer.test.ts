import { describe, expect, it } from "vitest";
import { analyzeProperty } from "@/features/property/propertyAnalyzer";
import type { GISEvidence } from "@/types/gis";

function evidence(overrides: Partial<GISEvidence> = {}): GISEvidence {
  return {
    trust: "verified",
    radiusMeters: 250,
    counts: { buildings: 0, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 0 },
    scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
    features: [],
    source: "OpenStreetMap / Overpass",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

/*
  Rewritten on 28 November 2026 at the owner's request: property type must
  be accurate, never a wrong guess, and when nothing is available it is
  Residential. These used to test a classifier that read the AREA when the
  building at the point could not be checked ("lots of shops around, so
  Commercial"). That reading was wrong for exactly the buildings people tap,
  so without the building check the answer is now the Residential default,
  said as such, and the area is context only. The building readings are in
  propertySite.test.ts.
*/
describe("analyzeProperty without the building check", () => {
  const commercialArea = evidence({
    counts: { buildings: 40, shops: 30, offices: 15, residential: 2, industrial: 0, institutional: 1, amenities: 10, tourism: 0, transport: 0 },
    scores: { commercial: 95, residential: 4, institutional: 3, industrial: 0, landmark: 0, transport: 0 },
  });

  it("never classifies from the area, however one-sided it is: the Residential default, said as such", () => {
    const result = analyzeProperty(commercialArea);
    expect(result.classification).toBe("Residential");
    expect(result.basis).toBe("default");
    expect(result.confidence).toBe(10);
    expect(result.reasoning).toContain("could not be checked just now");
    expect(result.reasoning).toContain("This is a default, not a finding.");
  });

  it("is never VERIFIED, even with a feature mapped near the spot", () => {
    const result = analyzeProperty({ ...commercialArea, subject: { name: "Wave Rock Tower 2.3", kind: "office building", category: "commercial", distanceMeters: 3 } });
    expect(result.trust).toBe("inferred");
    expect(result.classification).toBe("Residential");
  });

  it("keeps what is around as context, and cites its source", () => {
    const result = analyzeProperty(commercialArea);
    expect(result.evidence.join(" ")).toMatch(/30 shops/);
    expect(result.sources).toContain("OpenStreetMap / Overpass");
  });

  it("says nothing could be read when nothing loaded at all, rather than answering", () => {
    const result = analyzeProperty(null);
    expect(result.classification).toBe("Unknown");
    expect(result.trust).toBe("unavailable");
  });
});
