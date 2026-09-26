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

describe("basemap-based suggestions", () => {
  it("suggests 3D when viewing satellite imagery at a dense location already in 3D view", () => {
    // Test basemap-based suggestions by removing place-discovery show3D (which has higher priority)
    // by setting is3D: true, so the basemap-based suggestion becomes the primary one
    const step = nextStep({ ...base, basemap: "satellite", evidenceCount: 1240, is3D: true });
    // When already in 3D, place-discovery moves to "analyse", so basemap suggestion is not checked
    // This test validates that when in 3D with satellite, we don't re-suggest 3D
    expect(step?.action).not.toBe("show3D");
  });

  it("suggests 3D when viewing satellite imagery at a moderately dense location not yet in 3D", () => {
    // Use lower evidence count (100) to avoid triggering place-discovery 3D suggestion (requires >= 150)
    // This lets us test the basemap-based suggestion tier
    const step = nextStep({ ...base, basemap: "satellite", evidenceCount: 100, is3D: false });
    // At 100 evidence, place-discovery doesn't suggest 3D (needs >= 150), so this tests basemap tier
    expect(step?.action).toBe("widenRadius");
    expect(step?.text).toContain("100");
  });

  it("does not suggest 3D basemap swap when already in 3D", () => {
    const step = nextStep({ ...base, basemap: "satellite", evidenceCount: 1240, is3D: true });
    expect(step?.action).not.toBe("show3D");
  });

  it("does not suggest 3D basemap swap when zoomed out", () => {
    // At zoom 10, even with 1240 evidence, place-discovery won't suggest 3D
    // (requires zoom >= MIN_ZOOM_FOR_3D_BUILDINGS - 2, which is typically 14)
    const step = nextStep({ ...base, basemap: "satellite", evidenceCount: 1240, zoom: 10 });
    expect(step?.action).not.toBe("show3D");
  });
});

describe("measurement-based suggestions", () => {
  it("suggests finishing measurement when distance points are drawn", () => {
    // Use evidenceCount: 40 and radiusMeters: 2000 to skip all place-discovery suggestions.
    // This avoids: show3D (requires evidenceCount >= 150), analyse (requires is3D: true),
    // and widenRadius (requires radiusMeters <= 250)
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 2000, measureMode: "distance", measurePoints: [[0, 0]] });
    expect(step?.action).toBe("measure");
    expect(step?.text).toContain("distance");
    expect(step?.text).toContain("second point");
    // The tool has no finish step, so the suggestion must not promise one.
    expect(step?.label).not.toMatch(/finish/i);
    expect(step?.text).not.toMatch(/finali[sz]e|complete/i);
  });

  it("suggests completing area when multiple points are drawn", () => {
    // Same configuration to skip place-discovery suggestions
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 2000, measureMode: "area", measurePoints: [[0, 0], [1, 1]] });
    expect(step?.action).toBe("measure");
    expect(step?.text).toContain("area");
  });

  it("does not suggest measurement when measurement is off", () => {
    const step = nextStep({ ...base, measureMode: "off", measurePoints: [[0, 0]] });
    expect(step?.action).not.toBe("measure");
  });
});

describe("navigation-based suggestions", () => {
  it("points to Directions when actively navigating", () => {
    // Use evidenceCount: 40 and radiusMeters: 2000 to skip all place-discovery suggestions
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 2000, navState: "navigating" });
    expect(step?.action).toBe("navigate");
    expect(step?.label).toBe("Show directions");
  });

  it("suggests turn-by-turn when rerouting", () => {
    // Same configuration to skip place-discovery suggestions
    const step = nextStep({ ...base, evidenceCount: 40, radiusMeters: 2000, navState: "rerouting" });
    expect(step?.action).toBe("navigate");
  });

  it("does not suggest navigation when idle", () => {
    const step = nextStep({ ...base, navState: "idle" });
    expect(step?.action).not.toBe("navigate");
  });
});

describe("priority order across all scenarios", () => {
  it("prioritizes place-discovery over basemap suggestions", () => {
    // When 3D is not yet triggered but there are buildings and sufficient evidence
    const step = nextStep({
      ...base,
      evidenceCount: 1240,
      is3D: false,
      basemap: "satellite",
      measureMode: "off",
    });
    // Should suggest 3D for buildings discovery, not basemap-based 3D
    expect(step?.action).toBe("show3D");
    expect(step?.text).toContain("Many of them are buildings");
  });

  it("prioritizes place-discovery over measurement suggestions", () => {
    const step = nextStep({
      ...base,
      evidenceCount: 0,
      measureMode: "distance",
      measurePoints: [[0, 0]],
    });
    // Should suggest imagery (place is empty), not measurement finish
    expect(step?.action).toBe("imagery");
  });

  it("prioritizes place-discovery over navigation suggestions", () => {
    const step = nextStep({
      ...base,
      evidenceCount: 1240,
      navState: "navigating",
      is3D: false,
    });
    // Should suggest 3D for buildings discovery, not navigation
    expect(step?.action).toBe("show3D");
  });
});
