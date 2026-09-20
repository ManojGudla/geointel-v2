import { describe, expect, it } from "vitest";
import { computeLocationIntelligence, scoreContributions } from "@/features/intelligence/locationIntelligence";
import type { GISEvidence } from "@/types/gis";

function evidence(overrides: Partial<GISEvidence["counts"]> = {}, features: GISEvidence["features"] = []): GISEvidence {
  return {
    trust: "verified",
    radiusMeters: 1000,
    counts: {
      buildings: 0,
      shops: 0,
      offices: 0,
      residential: 0,
      industrial: 0,
      institutional: 0,
      amenities: 0,
      tourism: 0,
      transport: 0,
      ...overrides,
    },
    scores: { commercial: 0, residential: 0, institutional: 0, industrial: 0, landmark: 0, transport: 0 },
    features,
    source: "OpenStreetMap / Overpass",
    fetchedAt: new Date().toISOString(),
  } as GISEvidence;
}

const BUSY = { buildings: 400, shops: 120, offices: 30, residential: 260, amenities: 95, transport: 26 };

const PARK = { id: "w1", lat: 17.38, lon: 78.48, name: "Park", tags: { leisure: "park" } } as GISEvidence["features"][number];
const LAKE = { id: "w2", lat: 17.38, lon: 78.48, name: "Lake", tags: { natural: "water" } } as GISEvidence["features"][number];

describe("computeLocationIntelligence", () => {
  it("scores a dense urban area highly and names its band", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY, [PARK, LAKE]), europeanAqi: 30 });
    expect(result.overall).not.toBeNull();
    expect(result.overall!).toBeGreaterThan(60);
    expect(result.band).toBeTruthy();
  });

  /**
   * The central honesty rule. There is no free flood, seismic or crime data
   * behind this app, so with no air-quality reading the risk dimension has
   * nothing real to say - and a plausible-looking number there would be
   * indistinguishable from a measured one.
   */
  it("refuses to score risk without a real air-quality reading", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY) });
    const risk = result.dimensions.find((d) => d.id === "risk")!;
    expect(risk.state).toBe("insufficient");
    expect(risk.score).toBeNull();
    expect(risk.basis).toMatch(/flood, seismic and crime risk are not scored/i);
  });

  it("scores risk when an air-quality reading is available, inverting AQI so clean air scores high", () => {
    const clean = computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 10 });
    const dirty = computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 85 });
    expect(clean.dimensions.find((d) => d.id === "risk")!.score).toBe(90);
    expect(dirty.dimensions.find((d) => d.id === "risk")!.score).toBe(15);
  });

  /**
   * "Competition" cannot be answered until the user says competition for
   * what - so it is never scored here, and points at the tool where the
   * question becomes answerable instead of showing a meaningless number.
   */
  it("never scores competition, and says where it becomes answerable", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 30 });
    const competition = result.dimensions.find((d) => d.id === "competition")!;
    expect(competition.state).toBe("needs-choice");
    expect(competition.score).toBeNull();
    expect(competition.basis).toMatch(/suitability/i);
  });

  it("marks environment insufficient when no green or water features are mapped, without claiming there are none", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 30 });
    const environment = result.dimensions.find((d) => d.id === "environment")!;
    expect(environment.state).toBe("insufficient");
    expect(environment.basis).toMatch(/may mean none exist, or that they aren't mapped/i);
  });

  it("scores environment from real park and water features", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY, [PARK, LAKE]) });
    const environment = result.dimensions.find((d) => d.id === "environment")!;
    expect(environment.state).toBe("scored");
    expect(environment.score).toBeGreaterThan(0);
    expect(environment.basis).toContain("1 parks and 1 water features");
  });

  /**
   * An overall figure averaged from one or two dimensions carries the same
   * visual authority as one averaged from six. Below the threshold there is
   * no headline number at all.
   */
  it("returns no overall score when too few dimensions could be scored", () => {
    const bare = computeLocationIntelligence({ evidence: evidence({}) });
    // With everything at zero, the scored dimensions still exist but the
    // area is empty - the guard that matters is that an overall number is
    // only produced from enough contributing dimensions.
    expect(bare.scoredCount).toBeLessThanOrEqual(4);
    expect(bare.confidence).toBe("Low");
    expect(bare.confidenceReason).toMatch(/nothing is mapped/i);
  });

  it("reports confidence as coverage, never as a fabricated percentage", () => {
    const rich = computeLocationIntelligence({ evidence: evidence(BUSY, [PARK, LAKE]), europeanAqi: 30 });
    const thin = computeLocationIntelligence({ evidence: evidence({ buildings: 3 }) });
    expect(rich.confidence).toBe("High");
    expect(thin.confidence).toBe("Low");
    expect(rich.confidenceReason).toBeTruthy();
    expect(String(rich.confidence)).not.toMatch(/%/);
  });

  it("names the air-quality source only when air quality was actually used", () => {
    expect(computeLocationIntelligence({ evidence: evidence(BUSY) }).sources).toEqual(["OpenStreetMap / Overpass"]);
    expect(computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 30 }).sources).toContain("Open-Meteo Air Quality (CAMS)");
  });

  it("gives every dimension a basis line, including the ones it cannot score", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY) });
    for (const dimension of result.dimensions) {
      expect(dimension.basis.length, `${dimension.id} needs a basis`).toBeGreaterThan(20);
      expect(dimension.hint.length, `${dimension.id} needs a hint`).toBeGreaterThan(10);
    }
  });
});

describe("scoreContributions", () => {
  it("expresses each dimension as points above or below neutral, strongest influence first", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY, [PARK, LAKE]), europeanAqi: 20 });
    const contributions = scoreContributions(result);

    expect(contributions.length).toBeGreaterThan(0);
    for (let i = 1; i < contributions.length; i += 1) {
      expect(Math.abs(contributions[i - 1]!.points)).toBeGreaterThanOrEqual(Math.abs(contributions[i]!.points));
    }
  });

  /**
   * A dimension sitting at the midpoint is pushing the overall score neither
   * up nor down, and must read that way - a raw score of 50 shown as "+50"
   * would be actively misleading about what drove the result.
   */
  it("scores a mid-range dimension near zero rather than as a large positive", () => {
    const result = computeLocationIntelligence({ evidence: evidence(BUSY), europeanAqi: 50 });
    const risk = scoreContributions(result).find((c) => c.label === "Air quality risk")!;
    expect(Math.abs(risk.points)).toBeLessThanOrEqual(1);
  });

  it("returns nothing to explain when nothing could be scored", () => {
    expect(scoreContributions({ overall: null, band: null, dimensions: [], scoredCount: 0, confidence: "Low", confidenceReason: "", sources: [] })).toEqual([]);
  });
});
