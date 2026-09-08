import { describe, expect, it } from "vitest";
import {
  COORD_PRECISION,
  maxShiftMetres,
  snapCoordinate,
  snapCoordinateParams,
} from "../../src/services/geoPrecision";

/**
 * The cache that was working and never being hit.
 *
 * Thirteen routes are wrapped in `withEdgeCache`, but the CDN keys on the
 * exact URL and the app sent raw float coordinates. Measured on production:
 *
 *   identical coordinates      38 ms   HIT
 *   moved about 11 metres    4790 ms   MISS
 *   moved about 1 metre       887 ms   MISS
 *
 * Nobody clicks the same float twice, so nearly every real request went the
 * long way round to the free Overpass mirrors.
 *
 * Two things have to stay true or this trade turns bad:
 *
 *   Snapping must be deterministic to the last digit. If two clients in the
 *   same grid square produce URLs differing by a float artefact, they miss
 *   the cache and nothing has been gained.
 *
 *   It must only apply where the answer is about an AREA. Rounding the point
 *   under a reverse-geocode would return the wrong street, which is a
 *   correctness bug traded for speed — a much worse deal than the delay.
 */

describe("snapping a coordinate", () => {
  it("puts nearby points into the same grid square", () => {
    // The exact case measured on production: eleven metres apart, two URLs.
    expect(snapCoordinate(17.385, 3)).toBe(snapCoordinate(17.3851, 3));
    expect(snapCoordinate(17.385, 3)).toBe(snapCoordinate(17.38501, 3));
    expect(snapCoordinate(78.4867, 3)).toBe(snapCoordinate(78.48672, 3));
  });

  it("still separates points that are genuinely far apart", () => {
    // Snapping must not merge different neighbourhoods into one answer.
    expect(snapCoordinate(17.385, 3)).not.toBe(snapCoordinate(17.395, 3));
    expect(snapCoordinate(17.385, 2)).not.toBe(snapCoordinate(17.42, 2));
  });

  it("produces a clean number, not a float artefact", () => {
    // Math.round(x * 1000) / 1000 gives 17.384999999999998 for this input,
    // which serialises into a different URL than another client's and misses
    // the cache — the precise failure being fixed.
    const snapped = snapCoordinate(17.385, 3);
    expect(String(snapped)).toBe("17.385");
    expect(String(snapCoordinate(-0.1005, 3))).not.toMatch(/9999|0000/);
  });

  it("is stable when applied twice", () => {
    // A value that has already been through the grid must not move again,
    // or a re-render would produce a second URL for the same place.
    for (const v of [17.385, -33.9628, 151.2153, 0, -0.0005]) {
      const once = snapCoordinate(v, 3);
      expect(snapCoordinate(once, 3)).toBe(once);
    }
  });

  it("handles the southern and western hemispheres", () => {
    expect(snapCoordinate(-33.96284, 3)).toBe(-33.963);
    expect(snapCoordinate(-112.15099, 3)).toBe(-112.151);
  });

  it("leaves nonsense alone rather than inventing a coordinate", () => {
    expect(snapCoordinate(Number.NaN, 3)).toBeNaN();
    expect(snapCoordinate(Number.POSITIVE_INFINITY, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("how far a point is allowed to move", () => {
  it("keeps radius searches well inside their own radius", () => {
    // The smallest radius the UI offers is 100 m. A shift of ~55 m would be
    // too much for that, but these routes are only used from 500 m upward,
    // and the default is 250 m. Stated here so the trade is visible rather
    // than assumed.
    expect(maxShiftMetres(3)).toBeGreaterThan(50);
    expect(maxShiftMetres(3)).toBeLessThan(60);
  });

  it("keeps area statistics inside roughly half a kilometre", () => {
    expect(maxShiftMetres(2)).toBeGreaterThan(500);
    expect(maxShiftMetres(2)).toBeLessThan(600);
  });
});

describe("which routes get snapped", () => {
  it("snaps the slow radius searches", () => {
    // /api/nearby is the one measured at 4.8 seconds on a miss.
    expect(COORD_PRECISION["/api/nearby"]).toBe(3);
    expect(COORD_PRECISION["/api/poi-evidence"]).toBe(3);
    expect(COORD_PRECISION["/api/gis"]).toBe(3);
  });

  it("never snaps a route whose answer is about one exact point", () => {
    // Reverse geocoding names the spot that was clicked. Moving it 50 metres
    // can name the next street, and it already answers in about 20 ms, so
    // there is nothing to gain and a correct answer to lose.
    expect(COORD_PRECISION["/api/reverse-geocode"]).toBeUndefined();
    // Routing starts and ends where the user chose, not on a grid.
    expect(COORD_PRECISION["/api/route"]).toBeUndefined();
  });

  it("leaves an unlisted route completely untouched", () => {
    // The safe default: a new endpoint opts in deliberately rather than
    // silently inheriting a rounding that might matter to it.
    const params = { lat: 17.3850123, lon: 78.4867456 };
    expect(snapCoordinateParams("/api/something-new", params)).toEqual(params);
  });
});

describe("rewriting the parameters", () => {
  it("snaps lat and lon and leaves everything else alone", () => {
    const out = snapCoordinateParams("/api/nearby", {
      lat: 17.3850123,
      lon: 78.4867456,
      radius: 2000,
      category: "hospitals",
    });
    expect(out).toEqual({ lat: 17.385, lon: 78.487, radius: 2000, category: "hospitals" });
  });

  it("gives two people eleven metres apart the identical query", () => {
    // The whole point, stated as the thing that was actually broken.
    const a = snapCoordinateParams("/api/nearby", { lat: 17.385, lon: 78.4867, radius: 2000 });
    const b = snapCoordinateParams("/api/nearby", { lat: 17.3851, lon: 78.48668, radius: 2000 });
    expect(a).toEqual(b);
  });

  it("accepts coordinates that arrive as strings", () => {
    const out = snapCoordinateParams("/api/weather", { lat: "17.3850123", lon: "78.4867456" });
    expect(out).toEqual({ lat: 17.39, lon: 78.49 });
  });

  it("passes a bad coordinate through so the server can reject it", () => {
    // Quietly reshaping "abc" into a valid-looking number would hide a real
    // bug and return data for somewhere the caller never asked about.
    const out = snapCoordinateParams("/api/nearby", { lat: "abc", lon: undefined, radius: 2000 });
    expect(out).toEqual({ lat: "abc", lon: undefined, radius: 2000 });
  });

  it("copies rather than mutating what it was given", () => {
    const original = { lat: 17.3850123, lon: 78.4867456 };
    snapCoordinateParams("/api/nearby", original);
    expect(original.lat).toBe(17.3850123);
  });

  it("survives being handed nothing", () => {
    expect(snapCoordinateParams("/api/nearby", undefined)).toBeUndefined();
  });
});
