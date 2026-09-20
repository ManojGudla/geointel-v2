import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler, { parseSrcDate, selectFootprint } from "../../api/_routes/imagery";
import { describeAge } from "../../src/features/map/ImageryDate";

/**
 * Satellite imagery capture dates.
 *
 * This feature exists because real users said "old imagery is coming
 * everywhere". The imagery genuinely IS old in places - Esri World Imagery is
 * a free mosaic photographed area by area over years - and the fault was not
 * the age but the silence about it. A photograph with no date invites the
 * assumption that it is current.
 *
 * So the rule these tests hold is the same one the population endpoint
 * follows: report what the source publishes, or report nothing. Never
 * estimate a date, and never leave the reader to assume one.
 *
 * The shapes below are the real response format, taken from live queries
 * against the Esri service while building this.
 */

function mockLayers(featuresPerCall: unknown[][]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const features = featuresPerCall[call] ?? [];
      call += 1;
      const body = { features: features.map((attributes) => ({ attributes })) };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    })
  );
}

/** Each test needs fresh coordinates - the handler caches by rounded lat/lon. */
let seed = 0;
const coords = () => {
  seed += 0.05;
  return { lat: `${17.3 + seed}`, lon: `${78.4 + seed}`, zoom: "16" };
};

/** A real record returned for Hyderabad by layer 9. */
const hyderabad = {
  SRC_DATE: 20251115,
  SAMP_RES: 0.3,
  SRC_RES: 0.46,
  NICE_DESC: "Vantor",
  NICE_NAME: "Vivid Advanced",
  MinMapLevel: 12,
  MaxMapLevel: 19,
};

describe("parseSrcDate", () => {
  it("reads Esri's numeric YYYYMMDD into an ISO date", () => {
    expect(parseSrcDate(20251115)).toBe("2025-11-15");
    expect(parseSrcDate("20250830")).toBe("2025-08-30");
  });

  it("refuses anything that isn't exactly eight digits", () => {
    // A half-parsed date would be worse than none: it would print a
    // confident wrong day next to a photograph.
    for (const bad of [undefined, null, "", "2025", "2025-11-15", 202511151, "2025111x"]) {
      expect(parseSrcDate(bad)).toBeNull();
    }
  });

  it("refuses impossible months and days rather than passing them through", () => {
    expect(parseSrcDate(20251315)).toBeNull(); // month 13
    expect(parseSrcDate(20251100)).toBeNull(); // day 0
    expect(parseSrcDate(20251132)).toBeNull(); // day 32
    expect(parseSrcDate(18001115)).toBeNull(); // before satellites existed
  });
});

describe("selectFootprint", () => {
  it("returns null when nothing has a usable date", () => {
    expect(selectFootprint([], 16)).toBeNull();
    expect(selectFootprint([{ SAMP_RES: 0.3 }, { SRC_DATE: 999 }], 16)).toBeNull();
  });

  it("prefers a footprint whose zoom range covers the current zoom", () => {
    // The coarse one is not "wrong", it is simply not what is being drawn at
    // z18 - reporting its date would describe a different picture.
    const coarse = { SRC_DATE: 20180101, SAMP_RES: 15, MinMapLevel: 0, MaxMapLevel: 10 };
    const fine = { SRC_DATE: 20251115, SAMP_RES: 0.3, MinMapLevel: 12, MaxMapLevel: 19 };
    expect(selectFootprint([coarse, fine], 18)).toBe(fine);
    expect(selectFootprint([coarse, fine], 5)).toBe(coarse);
  });

  it("picks the finest resolution among footprints that all cover the zoom", () => {
    // Overlapping coverage is normal; the sharpest one is drawn on top, so
    // it is the picture the visitor is actually looking at.
    const blurry = { SRC_DATE: 20200101, SAMP_RES: 2.4, MinMapLevel: 10, MaxMapLevel: 19 };
    const sharp = { SRC_DATE: 20251115, SAMP_RES: 0.3, MinMapLevel: 10, MaxMapLevel: 19 };
    expect(selectFootprint([blurry, sharp], 16)).toBe(sharp);
  });

  it("still answers when no footprint's range covers the zoom", () => {
    // A date slightly outside its ideal band is still the truth about this
    // ground, and better than an empty panel that implies nothing is known.
    const only = { SRC_DATE: 20220401, SAMP_RES: 0.6, MinMapLevel: 12, MaxMapLevel: 17 };
    expect(selectFootprint([only], 20)).toBe(only);
  });

  it("falls back to SRC_RES when SAMP_RES is missing", () => {
    const withSamp = { SRC_DATE: 20240101, SAMP_RES: 1.2, MinMapLevel: 0, MaxMapLevel: 22 };
    const withSrcOnly = { SRC_DATE: 20240101, SRC_RES: 0.5, MinMapLevel: 0, MaxMapLevel: 22 };
    expect(selectFootprint([withSamp, withSrcOnly], 16)).toBe(withSrcOnly);
  });
});

describe("api/imagery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects missing, non-numeric or out-of-world coordinates", async () => {
    for (const q of [{}, { lat: "abc", lon: "12" }, { lat: "91", lon: "0" }, { lat: "0", lon: "181" }]) {
      const r = fakeReqRes(q);
      await handler(r.req, r.res);
      expect(r.statusCode).toBe(400);
    }
  });

  it("reports the capture date, resolution and provider from Esri's record", async () => {
    mockLayers([[hyderabad], [], [], []]);
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);

    expect(r.statusCode).toBe(200);
    const { imagery } = r.body as { imagery: Record<string, unknown> };
    expect(imagery.captured).toBe("2025-11-15");
    expect(imagery.year).toBe(2025);
    expect(imagery.resolutionMeters).toBe(0.3);
    expect(imagery.provider).toBe("Vantor");
    expect(imagery.product).toBe("Vivid Advanced");
  });

  it("answers null rather than guessing when Esri publishes no footprint", async () => {
    // Both the primary spread and the fallback spread come back empty.
    mockLayers([[], [], [], [], [], [], [], []]);
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { imagery: unknown }).imagery).toBeNull();
  });

  it("survives a provider outage without inventing a date", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { imagery: unknown }).imagery).toBeNull();
  });

  it("keeps the answer when only some of the parallel layers fail", async () => {
    // One bad layer must not lose a date another layer already returned.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("layer down");
        const body = { features: call === 2 ? [{ attributes: hyderabad }] : [] };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      })
    );

    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect((r.body as { imagery: { captured: string } | null }).imagery?.captured).toBe("2025-11-15");
  });

  it("ignores an Esri error payload returned with HTTP 200", async () => {
    // ArcGIS reports failures in the body with a 200 status, so trusting the
    // status code alone would treat an error as "no imagery here".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 400, message: "Invalid or missing input parameters." } }),
        text: async () => "{}",
      }))
    );
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { imagery: unknown }).imagery).toBeNull();
  });
});

describe("describeAge", () => {
  const captured = "2025-11-15";

  it("describes recent imagery in months and older imagery in years", () => {
    expect(describeAge(captured, new Date("2025-11-20T00:00:00Z"))).toBe("this month");
    expect(describeAge(captured, new Date("2025-12-25T00:00:00Z"))).toBe("1 month old");
    expect(describeAge(captured, new Date("2026-05-15T00:00:00Z"))).toBe("5 months old");
    expect(describeAge(captured, new Date("2027-01-15T00:00:00Z"))).toBe("about 1 year old");
    expect(describeAge(captured, new Date("2029-01-15T00:00:00Z"))).toBe("about 3 years old");
  });

  it("says nothing rather than something absurd for a future date", () => {
    // Bad data upstream must not produce "-2 months old" on screen.
    expect(describeAge(captured, new Date("2024-01-01T00:00:00Z"))).toBeNull();
    expect(describeAge("not-a-date")).toBeNull();
  });
});
