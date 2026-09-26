import { describe, expect, it } from "vitest";
import { classifyFeatures } from "../../api/_routes/gis";
import { analyzeProperty } from "../../src/features/property/propertyAnalyzer";
import type { GISEvidence } from "../../src/types/gis";

/**
 * The Waverock regression.
 *
 * Waverock in Khajaguda, Hyderabad is a large commercial office complex
 * (Accenture, Amazon, Honeywell). This app classified it RESIDENTIAL at 68%
 * confidence with a VERIFIED badge, and users in India, Canada and the USA
 * reported the same shape of error across roughly two thirds of the
 * locations they tried.
 *
 * Nothing was broken. With the real counts from that location, the old
 * scorer computed:
 *
 *   commercial  = 6 shops x3 + 10 offices x2 + 10 amenities x0.5 = 43
 *   residential = 40 buildings x2                                 = 80
 *
 * Residential won, and the confidence formula produced exactly 68%.
 *
 * The flaw was that every feature inside 250m counted the same whether it
 * sat under the pin or 249 metres away, so the question being answered was
 * "what is this neighbourhood mostly made of" while the panel presented the
 * answer as "what is this property". Residential buildings are the most
 * numerous building type in nearly every populated place on earth, which is
 * why this was structural rather than regional.
 */

const PIN = { lat: 17.41861, lon: 78.34682 };

/** Places a feature a given distance north of the pin. */
function at(metresNorth: number, tags: Record<string, string>) {
  return {
    type: "way" as const,
    id: Math.round(metresNorth * 1000 + Object.keys(tags).length),
    center: { lat: PIN.lat + metresNorth / 111_320, lon: PIN.lon },
    tags,
  };
}

/**
 * Waverock as OpenStreetMap actually has it: an office tower on the spot,
 * a scattering of commercial features nearby, and the residential fabric of
 * Khajaguda spread across the rest of the 250m radius.
 */
function waverock() {
  return [
    at(3, { building: "office", name: "Wave Rock Tower 2.3" }),
    at(40, { building: "office", name: "Wave Rock Tower 2.2" }),
    at(70, { office: "company", name: "Accenture" }),
    ...Array.from({ length: 6 }, (_, i) => at(120 + i * 15, { shop: "convenience" })),
    ...Array.from({ length: 7 }, (_, i) => at(90 + i * 20, { office: "company" })),
    ...Array.from({ length: 10 }, (_, i) => at(100 + i * 12, { amenity: "restaurant" })),
    // The forty that used to win the argument.
    ...Array.from({ length: 40 }, (_, i) => at(110 + i * 3.5, { building: "apartments" })),
  ];
}

function asEvidence(result: ReturnType<typeof classifyFeatures>, radiusMeters = 250): GISEvidence {
  return {
    trust: "verified",
    radiusMeters,
    counts: result.counts,
    scores: result.scores,
    subject: result.subject,
    features: [],
    source: "OpenStreetMap / Overpass",
    fetchedAt: new Date().toISOString(),
  };
}

describe("a commercial building surrounded by housing", () => {
  it("was classified Residential before the fix, on these exact inputs", () => {
    /*
      Pinning the old behaviour so the regression is a fact in the suite
      rather than a story in a commit message. Called without a centre,
      classifyFeatures weighs every feature equally, which is precisely
      what it used to do for every caller.
    */
    const { scores } = classifyFeatures(waverock());
    expect(scores.residential).toBeGreaterThan(scores.commercial);
  });

  it("is classified Commercial once distance is taken into account", () => {
    const result = classifyFeatures(waverock(), PIN, 250);
    expect(analyzeProperty(asEvidence(result)).classification).toBe("Commercial");
  });

  it("names the building it is talking about, so the claim can be checked", () => {
    // A classification nobody can verify is just an assertion. The whole
    // product's premise is that every answer shows where it came from.
    const analysis = analyzeProperty(asEvidence(classifyFeatures(waverock(), PIN, 250)));
    expect(analysis.reasoning).toContain("Wave Rock Tower 2.3");
    expect(analysis.evidence[0]).toContain("Wave Rock Tower 2.3");
  });

  it("still reports the forty residential buildings as raw evidence", () => {
    /*
      The weighting decides the classification and must not touch the facts.
      "40 residential buildings within 250m" is true and useful, and the
      Evidence tab should go on saying it.
    */
    const { counts } = classifyFeatures(waverock(), PIN, 250);
    expect(counts.residential).toBe(40);
    // Two office buildings plus eight tagged company offices.
    expect(counts.offices).toBe(10);
  });
});

describe("what the VERIFIED badge is allowed to mean", () => {
  it("is earned only when there is a mapped feature at the point", () => {
    /*
      It used to be awarded for totalEvidence >= 3 - "Overpass returned at
      least three things nearby" - which says nothing about whether the
      classification is right. It was the strongest word on the panel
      attached to the weakest claim, and it is what turned a wrong answer
      into a confidently wrong one.
    */
    const onABuilding = analyzeProperty(asEvidence(classifyFeatures(waverock(), PIN, 250)));
    expect(onABuilding.trust).toBe("verified");

    // The same neighbourhood, but the pin is on open ground between things.
    const emptySpot = analyzeProperty(
      asEvidence(classifyFeatures(waverock().filter((el) => el.tags.name !== "Wave Rock Tower 2.3"), PIN, 250))
    );
    expect(emptySpot.trust).toBe("inferred");
  });

  it("caps confidence when it is reading the area rather than the building", () => {
    // A guess from context is never as good as reading the label, and no
    // amount of nearby evidence should be able to lift it past one.
    const analysis = analyzeProperty(
      asEvidence(classifyFeatures(waverock().filter((el) => el.tags.name !== "Wave Rock Tower 2.3"), PIN, 250))
    );
    expect(analysis.confidence).toBeLessThanOrEqual(60);
    expect(analysis.reasoning).toContain("Nothing is mapped at this exact point");
  });

  it("says nothing is here rather than guessing, when nothing is mapped", () => {
    const analysis = analyzeProperty(asEvidence(classifyFeatures([], PIN, 250)));
    expect(analysis.classification).toBe("Unknown");
    expect(analysis.trust).toBe("unavailable");
  });
});

describe("the property is the property, not the postcode", () => {
  it("calls a house in a business district a house", () => {
    /*
      The converse of the Waverock bug, and the test that proves the fix is
      a principle rather than a thumb on the scale for "commercial". If the
      thing under the pin is a home, that is the answer, however many
      offices surround it.
    */
    const elements = [
      at(2, { building: "house", name: "12 Wave Rock Road" }),
      ...Array.from({ length: 30 }, (_, i) => at(60 + i * 6, { building: "office" })),
      ...Array.from({ length: 15 }, (_, i) => at(80 + i * 8, { shop: "convenience" })),
    ];
    const analysis = analyzeProperty(asEvidence(classifyFeatures(elements, PIN, 250)));
    expect(analysis.classification).toBe("Residential");
    // And it is honest that the surroundings disagree.
    expect(analysis.reasoning).toContain("lean commercial");
  });

  it("does not let a zoning polygon overrule the building you are standing in", () => {
    /*
      A landuse=residential polygon can cover a whole suburb, so its centroid
      says nothing about where you are. Treating one as the subject would
      reintroduce the original bug through a different door.
    */
    const elements = [at(1, { landuse: "residential" }), at(4, { building: "office", name: "Tower A" })];
    const { subject } = classifyFeatures(elements, PIN, 250);
    expect(subject?.name).toBe("Tower A");
  });

  it("widens its focus when the user widens the radius", () => {
    /*
      Someone who sets the radius to 1km is asking about a district, and
      should not get an answer still dominated by the 50 metres around the
      pin. The decay scales with the radius the user chose.
    */
    const far = Array.from({ length: 30 }, (_, i) => at(400 + i * 10, { building: "apartments" }));
    const tight = classifyFeatures(far, PIN, 250).scores.residential;
    const wide = classifyFeatures(far, PIN, 2000).scores.residential;
    expect(wide).toBeGreaterThan(tight);
  });
});
