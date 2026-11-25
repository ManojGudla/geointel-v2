import { describe, expect, it } from "vitest";
import { outlineCrossesItself, computeAreaSquareMeters } from "../../src/features/measure/measureMath";
import { reading } from "../../src/lib/reading";
import { forecastWeekday } from "../../src/features/weather/WeatherPanel";
import { formatArea, formatDistance } from "../../src/features/map/geo";

/**
 * Bugs from the 25 November 2026 audit (docs/audit/BUG_REPORT_2026-11-25.md)
 * where a gap or a failure was printed as a figure. The rule they share is
 * the product's own: a number on screen is either right or not there.
 */

describe("area of an outline that crosses itself (C2)", () => {
  // Four corners of a ~100 m square near Hyderabad.
  const a: [number, number] = [78.4867, 17.385];
  const b: [number, number] = [78.4876, 17.385];
  const c: [number, number] = [78.4876, 17.3859];
  const d: [number, number] = [78.4867, 17.3859];

  it("is flagged, because turf's signed lobes cancel to a too-small number", () => {
    // a -> c -> b -> d draws a figure-of-eight: the two diagonals cross.
    const bowTie = [a, c, b, d];
    expect(outlineCrossesItself(bowTie)).toBe(true);
    // This is the bug: the plain square is ~9,500 m², the bow-tie nearly 0.
    expect(computeAreaSquareMeters(bowTie)).toBeLessThan(computeAreaSquareMeters([a, b, c, d]) / 10);
  });

  it("is not flagged for an ordinary outline", () => {
    expect(outlineCrossesItself([a, b, c, d])).toBe(false);
  });

  it("is never flagged below four points, or for a point tapped twice", () => {
    expect(outlineCrossesItself([a, b, c])).toBe(false);
    expect(outlineCrossesItself([a, b, b, c])).toBe(false);
    expect(outlineCrossesItself([a, b, c, d, a])).toBe(false);
  });
});

describe("weather readings (H2)", () => {
  it("turns a missing reading into null, never 0 or NaN", () => {
    expect(reading(null)).toBeNull();
    expect(reading(undefined)).toBeNull();
    expect(reading(Number.NaN)).toBeNull();
    expect(reading(0)).toBe(0);
    expect(reading(21.6)).toBe(22);
    expect(reading(0.27, 1)).toBe(0.3);
  });

  it("names a forecast day by its own date, in every time zone", () => {
    // 2026-11-26 is a Thursday. new Date("2026-11-26") is midnight UTC,
    // which used to print as Wednesday anywhere in the Americas.
    expect(forecastWeekday("2026-11-26")).toMatch(/^Thu/);
    expect(forecastWeekday("not a date")).toBe("not a date");
  });
});

describe("distance and area formatting", () => {
  it("prints a dash for a non-finite figure, never 'NaN km'", () => {
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatArea(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDistance(1500)).toBe("1.5 km");
  });
});
