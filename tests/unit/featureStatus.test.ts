import { describe, expect, it } from "vitest";
import { FEATURE_STATUS, countByStatus, totalFeatureCount } from "../../src/data/featureStatus";

describe("featureStatus data", () => {
  it("has no empty categories and every item has a non-empty name", () => {
    expect(FEATURE_STATUS.length).toBeGreaterThan(0);
    for (const cat of FEATURE_STATUS) {
      expect(cat.category.length).toBeGreaterThan(0);
      expect(cat.items.length).toBeGreaterThan(0);
      for (const item of cat.items) {
        expect(item.name.length).toBeGreaterThan(0);
        expect(["live", "partial", "planned"]).toContain(item.status);
      }
    }
  });

  it("has no duplicate feature names", () => {
    const names = FEATURE_STATUS.flatMap((c) => c.items.map((i) => i.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("counts add up to the total", () => {
    const counts = countByStatus();
    expect(counts.live + counts.partial + counts.planned).toBe(totalFeatureCount());
  });

  it("covers a substantial, real feature set", () => {
    // Not pinned to an exact number - this is a living inventory that grows
    // as passes ship - just a floor so an accidental near-empty file fails.
    expect(totalFeatureCount()).toBeGreaterThan(80);
  });
});
