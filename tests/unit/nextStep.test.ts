import { describe, it, expect } from "vitest";
import { nextStep } from "@/features/workspace/nextStep";

/**
 * The suggestion under the toolbar.
 *
 * Worth testing because the value is entirely in the priority order and in
 * one property that is easy to lose: every sentence must contain a real fact
 * about the selected place. The moment one of these degrades into "see
 * what's nearby" it is instruction rather than observation, and it stops
 * earning the click it asks for.
 */

const base = { hasLocation: true, evidenceCount: 400, radiusMeters: 250, is3D: false, zoom: 16 };

describe("when there is nothing to say", () => {
  it("says nothing before a place is chosen", () => {
    // The row already carries its own "pick a place" hint. Two prompts saying
    // the same thing is worse than one.
    expect(nextStep({ ...base, hasLocation: false })).toBeNull();
  });

  it("says nothing while the evidence is still loading", () => {
    // Flashing a suggestion and then replacing it reads as the app changing
    // its mind, which is worse than a second of quiet.
    expect(nextStep({ ...base, evidenceCount: null })).toBeNull();
  });
});

describe("priority order", () => {
  it("answers an empty area honestly rather than suggesting a dead end", () => {
    const step = nextStep({ ...base, evidenceCount: 0 });
    expect(step?.action).toBe("imagery");
    expect(step?.text).toContain("Nothing is mapped");
    // It must not pretend the area is interesting. But it must offer the
    // thing the app can still do here.
    expect(step?.label).toBe("See it from space");
  });

  it("leads with 3D in a dense place, because it is the feature nobody finds", () => {
    const step = nextStep({ ...base, evidenceCount: 1240 });
    expect(step?.action).toBe("show3D");
    expect(step?.text).toContain("1,240");
  });

  it("does not suggest 3D when the map is too far out for footprints to load", () => {
    // Suggesting a button that produces nothing is the exact failure the
    // whole 3D flow was fixed to avoid.
    const step = nextStep({ ...base, evidenceCount: 1240, zoom: 8 });
    expect(step?.action).not.toBe("show3D");
  });

  it("moves on to analysis once they are already in 3D", () => {
    const step = nextStep({ ...base, is3D: true });
    expect(step?.action).toBe("analyse");
  });

  it("offers a wider area when the default radius is hiding the neighbourhood", () => {
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 250 });
    expect(step?.action).toBe("widenRadius");
    expect(step?.text).toContain("250 m");
  });

  it("falls back to the assistant once the obvious steps are done", () => {
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 2000 });
    expect(step?.action).toBe("ask");
    expect(step?.text).toContain("2 km");
  });
});

describe("every suggestion names something real", () => {
  const cases = [
    { ...base, evidenceCount: 0 },
    { ...base, evidenceCount: 1240 },
    { ...base, is3D: true },
    { ...base, evidenceCount: 40, radiusMeters: 250 },
    { ...base, evidenceCount: 40, radiusMeters: 2000 },
  ];

  it("carries a number or a concrete noun in every case, and a verb on every button", () => {
    for (const input of cases) {
      const step = nextStep(input);
      expect(step).not.toBeNull();
      // A digit (a count or a distance) or a named thing the app can do here.
      expect(step!.text).toMatch(/\d|café|clinic|warehouse/);
      expect(step!.label.length).toBeGreaterThan(3);
      expect(step!.text.length).toBeLessThan(120);
    }
  });
});
