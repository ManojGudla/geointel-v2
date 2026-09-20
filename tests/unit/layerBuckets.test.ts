import { describe, expect, it } from "vitest";
import { bucketFeature, pickVisibleLayer, LAYER_DEFS, LAYER_GROUPS, ungroupedLayerIds } from "../../src/features/gis/layerBuckets";
import type { GISFeature } from "../../src/types/gis";

/**
 * Regression coverage for the bug the user hit: "if I turn on turn off
 * [a GIS layer checkbox] also there nothing change." Root cause was that a
 * residential/industrial/institutional building belongs to BOTH its
 * specific subtype layer and the generic "buildings" layer (same for
 * amenity subtypes under "amenities"), and the generic layer - always
 * checked by default - was always picked first, so the specific checkbox's
 * state had zero visible effect. pickVisibleLayer() is the fix: prefer a
 * specific, checked layer over a generic one.
 */
describe("pickVisibleLayer", () => {
  it("prefers a specific layer over a generic one when both are visible", () => {
    const layers = ["buildings", "residential"] as const;
    const visibility = { buildings: true, residential: true };
    expect(pickVisibleLayer([...layers], visibility)).toBe("residential");
  });

  it("falls back to the generic layer when the specific one is unchecked", () => {
    const layers = ["buildings", "residential"] as const;
    const visibility = { buildings: true, residential: false };
    expect(pickVisibleLayer([...layers], visibility)).toBe("buildings");
  });

  it("renders the specific layer alone when the generic one is unchecked", () => {
    const layers = ["buildings", "industrial"] as const;
    const visibility = { buildings: false, industrial: true };
    expect(pickVisibleLayer([...layers], visibility)).toBe("industrial");
  });

  it("returns undefined (not rendered) when nothing in the feature's layers is checked", () => {
    const layers = ["buildings", "institutional"] as const;
    const visibility = { buildings: false, institutional: false };
    expect(pickVisibleLayer([...layers], visibility)).toBeUndefined();
  });

  it("end-to-end: a residential building's bucketed layers pick 'residential' once that checkbox is on", () => {
    const feature: GISFeature = {
      id: 1,
      osmType: "node",
      lat: 1,
      lon: 2,
      tags: { building: "apartments", name: "Test Apartments" },
    };
    const layers = bucketFeature(feature);
    expect(layers).toEqual(expect.arrayContaining(["buildings", "residential"]));

    // Default GIS panel state: Buildings on, Residential off.
    expect(pickVisibleLayer(layers, { buildings: true, residential: false })).toBe("buildings");
    // After the user checks "Residential" - this used to stay "buildings"
    // (the bug); it must now flip to "residential".
    expect(pickVisibleLayer(layers, { buildings: true, residential: true })).toBe("residential");
  });

  it("end-to-end: an amenity subtype (hospital) prefers its specific layer over the generic 'amenities' bucket", () => {
    const feature: GISFeature = { id: 2, osmType: "node", lat: 1, lon: 2, tags: { amenity: "hospital", name: "Test Hospital" } };
    const layers = bucketFeature(feature);
    expect(layers).toEqual(expect.arrayContaining(["amenities", "hospitals", "institutional"]));
    expect(pickVisibleLayer(layers, { amenities: true, hospitals: false, institutional: false })).toBe("amenities");
    expect(pickVisibleLayer(layers, { amenities: true, hospitals: true, institutional: false })).toBe("hospitals");
  });
});

describe("layer grouping", () => {
  /**
   * A layer that exists in LAYER_DEFS but appears in no group would vanish
   * from the layer panel entirely - present in the data model, invisible and
   * unreachable in the interface. Nothing in the source makes that visible,
   * so this is the check that catches it.
   */
  it("puts every defined layer into exactly one group", () => {
    expect(ungroupedLayerIds()).toEqual([]);

    const seen = new Map<string, number>();
    for (const group of LAYER_GROUPS) {
      for (const id of group.layers) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      expect(count, `layer "${id}" appears in more than one group`).toBe(1);
    }
  });

  it("references only layers that actually exist", () => {
    const known = new Set(LAYER_DEFS.map((l) => l.id));
    for (const group of LAYER_GROUPS) {
      for (const id of group.layers) {
        expect(known.has(id), `group "${group.id}" references unknown layer "${id}"`).toBe(true);
      }
    }
  });

  it("gives every group a plain-language hint", () => {
    for (const group of LAYER_GROUPS) {
      expect(group.hint.length, `group "${group.id}" needs a hint`).toBeGreaterThan(15);
    }
  });
});
