import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every raster tile source must declare a maxzoom.
 *
 * This test exists because of a bug real users reported. The RainViewer radar
 * source had no maxzoom, so MapLibre kept requesting tiles past the depth
 * RainViewer actually serves. Crucially, RainViewer does NOT answer those with
 * a 404 - it returns a PNG with "Zoom Level Not Supported" printed on it, and
 * MapLibre paints that like any other tile. The result was grey placards
 * plastered over the streets whenever the radar layer was on and the user
 * zoomed in.
 *
 * A missing maxzoom is invisible until someone zooms in far enough on a
 * provider that behaves this way, which is exactly the kind of defect that
 * reaches production. Scanning the source for it is cheap and catches it at
 * the point it is written.
 */

const FILES = [
  "src/features/map/MapView.tsx",
  "src/features/map/basemaps.ts",
  "src/features/play/components/GameMap.tsx",
];

/**
 * Counts tile SOURCES and the maxzoom declarations that must accompany them.
 *
 * Keyed on `tiles:` rather than on `type: "raster"`: a raster LAYER also has
 * type "raster" but references a source by id and has no tiles of its own, so
 * counting tiles keys counts exactly the things that fetch from a provider.
 * An earlier version matched `tiles: [` and silently found nothing in
 * basemaps.ts, where the array is passed by reference as
 * `tiles: RASTER_TILES[basemap]` - a test that quietly checks nothing is
 * worse than no test.
 */
function counts(source: string): { tileSources: number; maxzooms: number } {
  return {
    tileSources: (source.match(/^\s*tiles:/gm) ?? []).length,
    maxzooms: (source.match(/^\s*maxzoom:/gm) ?? []).length,
  };
}

describe("raster tile sources", () => {
  for (const file of FILES) {
    it(`declares maxzoom on every raster source in ${file}`, () => {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      const { tileSources, maxzooms } = counts(contents);
      // Guards the guard: if this drops to zero the file was renamed or
      // restructured and the check below would pass vacuously.
      expect(tileSources).toBeGreaterThan(0);
      expect(
        maxzooms,
        `${file} has ${tileSources} tile source(s) but only ${maxzooms} maxzoom declaration(s). Without a maxzoom, MapLibre requests tiles the provider does not serve - and providers like RainViewer answer with a "Zoom Level Not Supported" IMAGE rather than a 404, which then gets painted over the map.`
      ).toBeGreaterThanOrEqual(tileSources);
    });
  }

  it("caps the radar well below its real data resolution", async () => {
    const contents = readFileSync(join(process.cwd(), "src/features/map/MapView.tsx"), "utf8");
    const match = contents.match(/const RADAR_MAX_ZOOM = (\d+)/);
    expect(match).not.toBeNull();
    const cap = Number(match![1]);
    // The radar composite is roughly a 1 km grid. Past about z10 there is no
    // real detail to show, and every provider's depth limit sits above this,
    // so the cap is safe in both directions.
    expect(cap).toBeGreaterThanOrEqual(6);
    expect(cap).toBeLessThanOrEqual(11);
  });
});
