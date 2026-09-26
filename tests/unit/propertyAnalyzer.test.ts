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

describe("analyzeProperty", () => {
  it("never fabricates a classification when there is zero evidence", () => {
    const result = analyzeProperty(evidence());
    expect(result.classification).toBe("Unknown");
    expect(result.confidence).toBe(0);
    expect(result.trust).toBe("unavailable");
  });

  it("classifies a commercial-dominant area as Commercial, but only as an inference", () => {
    /*
      This test used to end `expect(result.trust).toBe("verified")`, and that
      assertion was the bug written down.

      "verified" was awarded whenever three or more features turned up
      anywhere in the radius. It meant "Overpass returned some things
      nearby" and said nothing whatever about whether the classification was
      right - so it sat, in capital letters, on top of answers that were
      wrong. Waverock, a commercial office complex in Hyderabad, was labelled
      RESIDENTIAL · VERIFIED at 68% confidence, and users in three countries
      reported the same shape of error.

      There is no subject feature in this fixture: nothing is mapped at the
      point, only around it. So the honest label is "inferred", and the
      confidence is capped, because reading the area is not the same as
      reading the building. See tests/unit/propertySubject.test.ts.
    */
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 40, shops: 30, offices: 15, residential: 2, industrial: 0, institutional: 1, amenities: 10, tourism: 0, transport: 0 },
        scores: { commercial: 95, residential: 4, institutional: 3, industrial: 0, landmark: 0, transport: 0 },
      })
    );
    expect(result.classification).toBe("Commercial");
    expect(result.confidence).toBeGreaterThan(50);
    expect(result.trust).toBe("inferred");
  });

  it("earns 'verified' only when a mapped feature sits on the point", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 40, shops: 30, offices: 15, residential: 2, industrial: 0, institutional: 1, amenities: 10, tourism: 0, transport: 0 },
        scores: { commercial: 95, residential: 4, institutional: 3, industrial: 0, landmark: 0, transport: 0 },
        subject: { name: "Wave Rock Tower 2.3", kind: "office building", category: "commercial", distanceMeters: 3 },
      })
    );
    expect(result.trust).toBe("verified");
    // And the badge is backed by something the reader can go and check.
    expect(result.reasoning).toContain("Wave Rock Tower 2.3");
  });

  it("classifies a closely-split area as Mixed Use rather than picking a false winner", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 10, shops: 5, offices: 2, residential: 5, industrial: 0, institutional: 0, amenities: 2, tourism: 0, transport: 0 },
        scores: { commercial: 21, residential: 20, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
      })
    );
    expect(result.classification).toBe("Mixed Use");
  });

  it("marks sparse evidence as inferred, not verified", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 1, shops: 1, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 0 },
        scores: { commercial: 3, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
      })
    );
    expect(result.trust).toBe("inferred");
  });

  it("always cites its source", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 5, shops: 5, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 0 },
        scores: { commercial: 15, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
      })
    );
    expect(result.sources).toContain("OpenStreetMap / Overpass");
  });

  // Regression test for the actual reported bug: a landmark's own OSM node
  // (tourism=attraction, no building/shop/office/amenity tag) used to
  // contribute zero evidence to totalEvidence, so it read as "Vacant /
  // Unknown" even though Overpass returned real data for exactly the thing
  // being looked up - e.g. searching the Eiffel Tower itself.
  it("classifies a tourism-dominant spot (a landmark) as Landmark, not Unknown", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 0, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 3, transport: 0 },
        scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0, landmark: 8, transport: 0 },
      })
    );
    expect(result.classification).toBe("Landmark");
    expect(result.trust).not.toBe("unavailable");
  });

  it("classifies a transit-dominant spot as Transport", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 0, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 4 },
        scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 8 },
      })
    );
    expect(result.classification).toBe("Transport");
  });

  it("gives real, non-nonsensical reasoning when buildings are mapped but unclassified (every score is 0)", () => {
    const result = analyzeProperty(
      evidence({
        counts: { buildings: 2, shops: 0, offices: 0, residential: 0, industrial: 0, institutional: 0, amenities: 0, tourism: 0, transport: 0 },
        scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
      })
    );
    expect(result.classification).toBe("Unknown");
    expect(result.reasoning.toLowerCase()).not.toContain("concentrated in vacant");
    expect(result.reasoning).toMatch(/2 features are mapped/i);
  });
});
