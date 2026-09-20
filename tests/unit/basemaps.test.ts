import { describe, expect, it } from "vitest";
import { buildBasemapStyle } from "../../src/features/map/basemaps";

/**
 * Regression test for a real bug seen live: the Dark style showed a grey
 * checkerboard reading "Map data not yet available" once zoomed in past a
 * certain point. Esri's free Dark Gray Canvas base/reference tiles only
 * have real imagery out to ~z16 (a lower-resolution cartographic basemap,
 * unlike the z19 satellite imagery layer) - declaring maxzoom: 19 for it
 * made MapLibre request tiles past what the service actually has, and
 * ArcGIS Online serves its own "not yet available" placeholder for those.
 */
describe("buildBasemapStyle", () => {
  it("caps the Dark basemap (and its label overlay) at Esri's real z16 tile ceiling, not z19", () => {
    const style = buildBasemapStyle("dark");
    expect((style.sources.base as { maxzoom?: number }).maxzoom).toBe(16);
    expect((style.sources.labels as { maxzoom?: number }).maxzoom).toBe(16);
  });

  it("keeps the satellite basemap at z19 - Esri World Imagery genuinely has coverage that deep", () => {
    const style = buildBasemapStyle("satellite");
    expect((style.sources.base as { maxzoom?: number }).maxzoom).toBe(19);
  });

  it("keeps the standard basemap at z19", () => {
    const style = buildBasemapStyle("standard");
    expect((style.sources.base as { maxzoom?: number }).maxzoom).toBe(19);
  });

  it("only adds a labels source/layer for the dark basemap", () => {
    expect(buildBasemapStyle("standard").sources.labels).toBeUndefined();
    expect(buildBasemapStyle("satellite").sources.labels).toBeUndefined();
    expect(buildBasemapStyle("terrain").sources.labels).toBeUndefined();
    expect(buildBasemapStyle("dark").sources.labels).toBeDefined();
  });
});
