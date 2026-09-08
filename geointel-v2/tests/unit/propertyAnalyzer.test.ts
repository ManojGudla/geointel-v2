import { describe, expect, it } from "vitest";
import { analyzeProperty } from "@/features/property/propertyAnalyzer";
import type { GISEvidence } from "@/types/gis";

function evidence(overrides: Partial<GISEvidence> = {}): GISEvidence {
  return {
    trust: "verified",
    radiusMeters: 250,
    counts: { buildings: 0, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0 },
    scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0 },
    features: [],
    source: "OpenStreetMap / Overpass",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzeProperty", () => {
  it("never fabricates a classification when there is zero evidence", () => {
    const result = analyzeProperty(evidence());
    expect(result.classification).toBe("Vacant / Unknown");
    expect(result.confidence).toBe(0);
    expect(result.trust).toBe("unavailable");
  });

  it("classifies a commercial-dominant area as Commercial with high confidence", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 40, shops: 30, offices: 15, residential: 2, industrial: 0, institutional: 1, amenities: 10 },
        scores: { commercial: 95, residential: 4, institutional: 3, industrial: 0 },
      })
    );
    expect(result.classification).toBe("Commercial");
    expect(result.confidence).toBeGreaterThan(50);
    expect(result.trust).toBe("verified");
  });

  it("classifies a closely-split area as Mixed Use rather than picking a false winner", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 10, shops: 5, offices: 2, residential: 5, industrial: 0, institutional: 0, amenities: 2 },
        scores: { commercial: 21, residential: 20, institutional: 0, industrial: 0 },
      })
    );
    expect(result.classification).toBe("Mixed Use");
  });

  it("marks sparse evidence as inferred, not verified", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 1, shops: 1, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0 },
        scores: { commercial: 3, residential: 0, institutional: 0, industrial: 0 },
      })
    );
    expect(result.trust).toBe("inferred");
  });

  it("always cites its source", () => {
    const result = analyzeProperty(evidence({ counts: { buildings: 5, shops: 5, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0 }, scores: { commercial: 15, residential: 0, institutional: 0, industrial: 0 } }));
    expect(result.sources).toContain("OpenStreetMap / Overpass");
  });
});
