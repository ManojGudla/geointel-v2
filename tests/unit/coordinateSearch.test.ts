import { describe, expect, it } from "vitest";
import { parseCoordinatePair, formatCoordinateLabel, formatDms } from "../../src/features/search/coordinateSearch";

describe("parseCoordinatePair", () => {
  it("parses a comma-separated decimal pair", () => {
    expect(parseCoordinatePair("17.385044, 78.486671")).toEqual({ lat: 17.385044, lon: 78.486671 });
  });

  it("parses a whitespace-separated pair with no comma", () => {
    expect(parseCoordinatePair("17.385044 78.486671")).toEqual({ lat: 17.385044, lon: 78.486671 });
  });

  it("parses negative coordinates (southern/western hemisphere)", () => {
    expect(parseCoordinatePair("-33.8688, 151.2093")).toEqual({ lat: -33.8688, lon: 151.2093 });
  });

  it("accepts a leading '@' (common when pasted from a Google Maps URL/share text)", () => {
    expect(parseCoordinatePair("@17.385044,78.486671")).toEqual({ lat: 17.385044, lon: 78.486671 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCoordinatePair("  17.385044,  78.486671  ")).toEqual({ lat: 17.385044, lon: 78.486671 });
  });

  it("rejects an out-of-range latitude or longitude rather than treating it as a place search fallthrough silently wrong", () => {
    expect(parseCoordinatePair("187.385044, 78.486671")).toBeNull();
    expect(parseCoordinatePair("17.385044, 278.486671")).toBeNull();
  });

  it("returns null for an ordinary place-name query", () => {
    expect(parseCoordinatePair("Eiffel Tower")).toBeNull();
    expect(parseCoordinatePair("500032")).toBeNull();
    expect(parseCoordinatePair("Wave rock road, Khajaguda")).toBeNull();
  });

  it("returns null for a partial/still-typing number", () => {
    expect(parseCoordinatePair("17.3")).toBeNull();
    expect(parseCoordinatePair("")).toBeNull();
  });

  /**
   * Hemisphere letters instead of a minus sign. Common when someone copies
   * the coordinate text off a page rather than using a "copy coordinates"
   * menu item, which is exactly when they'd paste it into a search box.
   */
  describe("decimal degrees with hemisphere letters", () => {
    it("parses letters after each number, with or without the degree symbol", () => {
      expect(parseCoordinatePair("17.385044° N, 78.486671° E")).toEqual({ lat: 17.385044, lon: 78.486671 });
      expect(parseCoordinatePair("17.385044 N 78.486671 E")).toEqual({ lat: 17.385044, lon: 78.486671 });
    });

    it("parses letters before each number", () => {
      expect(parseCoordinatePair("N 17.385044, E 78.486671")).toEqual({ lat: 17.385044, lon: 78.486671 });
    });

    it("applies S and W as negative", () => {
      const parsed = parseCoordinatePair("33.8688 S, 151.2093 W");
      expect(parsed?.lat).toBeCloseTo(-33.8688, 6);
      expect(parsed?.lon).toBeCloseTo(-151.2093, 6);
    });

    // Without this, "17 38" (two bare integers separated by a space) could be
    // read as a hemisphere-qualified pair with the letters simply missing.
    it("requires exactly one hemisphere letter per component, never both or neither", () => {
      expect(parseCoordinatePair("N 17.385044 N, E 78.486671 E")).toBeNull();
      expect(parseCoordinatePair("17.385044 N, 78.486671")).toBeNull();
    });
  });

  /** The format Google Maps shows on a place card, so it's what people read off the screen and retype. */
  describe("degrees, minutes and seconds", () => {
    it("parses a full DMS pair with seconds", () => {
      const parsed = parseCoordinatePair("17°23'06.2\"N 78°29'12.0\"E");
      expect(parsed?.lat).toBeCloseTo(17.385056, 5);
      expect(parsed?.lon).toBeCloseTo(78.486667, 5);
    });

    it("parses degrees and minutes with the seconds omitted", () => {
      const parsed = parseCoordinatePair("17°23'N 78°29'E");
      expect(parsed?.lat).toBeCloseTo(17.383333, 5);
      expect(parsed?.lon).toBeCloseTo(78.483333, 5);
    });

    it("applies S and W as negative", () => {
      const parsed = parseCoordinatePair("33°52'04.0\"S 151°12'36.0\"E");
      expect(parsed?.lat).toBeCloseTo(-33.867778, 5);
      expect(parsed?.lon).toBeCloseTo(151.21, 5);
    });
  });
});

describe("formatDms", () => {
  it("renders degrees, minutes and seconds with hemisphere letters", () => {
    expect(formatDms({ lat: 17.385044, lon: 78.486671 })).toBe("17°23'06.2\"N 78°29'12.0\"E");
  });

  it("uses S and W for negative values", () => {
    expect(formatDms({ lat: -33.8688, lon: -151.2093 })).toBe("33°52'07.7\"S 151°12'33.5\"W");
  });

  /**
   * Rounding seconds to one decimal can land on 60.0, which is not a valid
   * seconds value - it has to carry into minutes (and minutes into degrees)
   * rather than being printed as 59°60'00.0".
   */
  it("carries a rounded 60 seconds up into minutes instead of printing 60", () => {
    expect(formatDms({ lat: 1.0166666, lon: 0 })).toBe("1°01'00.0\"N 0°00'00.0\"E");
  });
});

describe("formatCoordinateLabel", () => {
  it("formats to 6 decimal places", () => {
    expect(formatCoordinateLabel({ lat: 17.385044, lon: 78.4866712345 })).toBe("17.385044, 78.486671");
  });
});
