import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  bufferPolygon,
  compassPoint,
  distanceMeters,
  invertedScore,
  nearest,
  saturatingScore,
  scoreBand,
  weightedScore,
  within,
  type Located,
} from "@/features/analysis/spatialMath";

const CHARMINAR = { lat: 17.361664, lon: 78.474663 };

function place(id: string, distanceMeters: number, lat = 17.36, lon = 78.47): Located {
  return { id, name: id, lat, lon, distanceMeters };
}

describe("distance and bearing", () => {
  /**
   * Checked against a known pair rather than against turf's own output, so
   * this would catch a units mistake (the single most likely error here -
   * turf defaults to kilometres, and a silent 1000x is the kind of thing that
   * looks plausible on screen).
   */
  it("measures a real-world distance in metres", () => {
    // Charminar to Golconda Fort is about 8.5 km.
    const golconda = { lat: 17.383333, lon: 78.401111 };
    expect(distanceMeters(CHARMINAR, golconda)).toBeGreaterThan(7500);
    expect(distanceMeters(CHARMINAR, golconda)).toBeLessThan(9500);
  });

  it("returns 0 for the same point", () => {
    expect(distanceMeters(CHARMINAR, CHARMINAR)).toBeCloseTo(0, 5);
  });

  it("reports due north as 0 and due east as 90", () => {
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 1);
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 1);
  });

  // turf returns bearings in -180..180; anything reported to a user has to be
  // the 0..360 form, so a south-westerly heading must not come back negative.
  it("normalises a westerly bearing into 0-360 rather than leaving it negative", () => {
    const bearing = bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: -1 });
    expect(bearing).toBeGreaterThan(180);
    expect(bearing).toBeCloseTo(270, 1);
  });

  it("names the compass sector", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(45)).toBe("NE");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(350)).toBe("N");
    expect(compassPoint(-10)).toBe("N");
  });
});

describe("bufferPolygon", () => {
  it("produces a closed polygon whose edge sits at the requested radius", () => {
    const polygon = bufferPolygon(CHARMINAR, 1000);
    expect(polygon.geometry.type).toBe("Polygon");
    const ring = polygon.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);

    for (const [lon, lat] of ring) {
      expect(distanceMeters(CHARMINAR, { lat: lat as number, lon: lon as number })).toBeCloseTo(1000, -1);
    }
  });
});

describe("within and nearest", () => {
  const items = [place("far", 4000), place("near", 250), place("mid", 1200)];

  it("keeps only what is inside the radius, nearest first", () => {
    expect(within(items, 1500).map((i) => i.id)).toEqual(["near", "mid"]);
  });

  it("includes an item exactly on the boundary", () => {
    expect(within([place("edge", 1000)], 1000)).toHaveLength(1);
  });

  it("finds the closest item", () => {
    expect(nearest(items)?.id).toBe("near");
  });

  it("returns null rather than throwing when there is nothing to choose from", () => {
    expect(nearest([])).toBeNull();
  });
});

describe("scoring", () => {
  it("scores zero for nothing and approaches 100 well past the reference", () => {
    expect(saturatingScore(0, 20)).toBe(0);
    expect(saturatingScore(100, 20)).toBe(100);
  });

  it("rises with count but never exceeds 100", () => {
    const low = saturatingScore(5, 20);
    const high = saturatingScore(15, 20);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });

  /**
   * The reason for a saturating rather than linear curve: a site with a lot
   * of something should not keep gaining score indefinitely, and two sites
   * that both have plenty should land close together.
   */
  it("saturates, so twice 'plenty' scores close to 'plenty' rather than double", () => {
    const plenty = saturatingScore(20, 20);
    const double = saturatingScore(40, 20);
    expect(double - plenty).toBeLessThan(15);
  });

  it("inverts for factors where more is worse", () => {
    expect(invertedScore(0, 10)).toBe(100);
    expect(invertedScore(100, 10)).toBe(0);
  });

  it("weights factors by importance", () => {
    const score = weightedScore([
      { id: "a", label: "A", weight: 3, score: 100, basis: "" },
      { id: "b", label: "B", weight: 1, score: 0, basis: "" },
    ]);
    expect(score).toBe(75);
  });

  /**
   * Weights are normalised rather than required to sum to 1, so that dragging
   * one slider in the UI doesn't silently rescale the others. Doubling every
   * weight must therefore leave the result unchanged.
   */
  it("normalises weights, so their absolute scale doesn't change the result", () => {
    const factors = [
      { id: "a", label: "A", weight: 30, score: 80, basis: "" },
      { id: "b", label: "B", weight: 70, score: 40, basis: "" },
    ];
    const doubled = factors.map((f) => ({ ...f, weight: f.weight * 2 }));
    expect(weightedScore(factors)).toBe(weightedScore(doubled));
  });

  it("returns 0 instead of dividing by zero when every weight is zeroed out", () => {
    expect(weightedScore([{ id: "a", label: "A", weight: 0, score: 90, basis: "" }])).toBe(0);
  });

  it("bands a score into plain language", () => {
    expect(scoreBand(90)).toBe("Strong");
    expect(scoreBand(60)).toBe("Moderate");
    expect(scoreBand(40)).toBe("Weak");
    expect(scoreBand(10)).toBe("Poor");
  });
});
