import { describe, expect, it } from "vitest";
import { buildGibsTileUrl, clampGibsDate, GIBS_EARLIEST, GIBS_LAYERS, gibsLatestDate, timelineStops } from "@/features/timeline/gibs";

const NOW = new Date("2026-09-02T10:00:00Z");

describe("gibsLatestDate", () => {
  /**
   * GIBS publishes a day's global mosaic only after that day is processed,
   * so "today" reliably returns blank tiles — which on screen is
   * indistinguishable from a broken layer. The upper bound has to sit
   * behind the present.
   */
  it("stays several days behind today, because the newest days aren't published yet", () => {
    expect(gibsLatestDate(NOW)).toBe("2026-08-30");
  });

  it("handles a month boundary without producing an invalid date", () => {
    expect(gibsLatestDate(new Date("2026-03-01T00:00:00Z"))).toBe("2026-02-26");
  });
});

describe("clampGibsDate", () => {
  it("refuses a date before the archive begins", () => {
    expect(clampGibsDate("1994-01-01", NOW)).toBe(GIBS_EARLIEST);
  });

  it("refuses a date newer than the newest published imagery", () => {
    expect(clampGibsDate("2026-09-02", NOW)).toBe("2026-08-30");
  });

  it("leaves a valid date alone", () => {
    expect(clampGibsDate("2015-02-15", NOW)).toBe("2015-02-15");
  });
});

describe("timelineStops", () => {
  const stops = timelineStops(NOW);

  it("gives one stop per year plus the newest available imagery", () => {
    expect(stops).toHaveLength(15);
    expect(stops[0]).toBe("2012-02-15");
    expect(stops[stops.length - 1]).toBe("2026-08-30");
  });

  it("is strictly increasing, so dragging the slider right always moves forward in time", () => {
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i]! > stops[i - 1]!).toBe(true);
    }
  });

  it("never produces a stop outside the archive", () => {
    for (const stop of stops) {
      expect(clampGibsDate(stop, NOW)).toBe(stop);
    }
  });
});

describe("buildGibsTileUrl", () => {
  const layer = GIBS_LAYERS[0]!;

  it("includes the date and MapLibre's tile placeholders", () => {
    const url = buildGibsTileUrl(layer, "2015-02-15");
    expect(url).toContain("/2015-02-15/");
    expect(url).toContain(layer.product);
    // GIBS's EPSG:3857 endpoint is {z}/{y}/{x} — NOT the {z}/{x}/{y} that
    // most tile services use. Getting this the usual way round returns
    // tiles from the wrong place on Earth, which is far worse than an
    // error because it renders perfectly.
    expect(url.endsWith("/{z}/{y}/{x}.jpg")).toBe(true);
  });

  it("uses each layer's own format", () => {
    for (const l of GIBS_LAYERS) {
      expect(buildGibsTileUrl(l, "2020-02-15").endsWith(`.${l.format}`)).toBe(true);
    }
  });
});
