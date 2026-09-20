import { describe, expect, it } from "vitest";
import { buildShareUrl, decodeViewState, encodeViewState, VIEW_PARAMS } from "../../src/features/share/viewState";

/**
 * The link is the growth loop.
 *
 * Everything this product does to acquire users runs through one action:
 * somebody gets an interesting answer and sends it to somebody else. If the
 * link does not carry the answer, that loop is broken no matter how good the
 * answer was - the recipient opens a default map and has to rebuild the
 * interesting part themselves, which they will not do.
 *
 * So these tests hold three things. A link carries the view. An old link still
 * works. And a hostile link cannot take the app down, which is not theoretical:
 * `?lat=999` used to throw inside MapLibre, unmount the map and every panel,
 * and land on an error boundary that does not recover. A URL is the easiest
 * thing in the world to hand to someone.
 */

describe("encoding a view", () => {
  it("always carries the position", () => {
    const q = encodeViewState({ lat: 17.385, lon: 78.4867 });
    expect(q).toContain("lat=17.385");
    expect(q).toContain("lon=78.4867");
  });

  it("rounds coordinates to about a metre", () => {
    // Full float precision adds a dozen characters per link and pins a shared
    // point to a specific doorway, which is more precision about somebody's
    // location than a link should carry.
    const q = encodeViewState({ lat: 17.3851234567, lon: 78.4867987654 });
    expect(q).toContain("lat=17.38512");
    expect(q).toContain("lon=78.4868");
  });

  it("omits everything that matches the default", () => {
    // A plain place share should stay short, and a link's length should
    // reflect how much state it is actually carrying.
    const q = encodeViewState(
      { lat: 17.385, lon: 78.487, zoom: 12, basemap: "standard", radiusMeters: 250, section: "place", tab: "overview" },
      { zoom: 12, radiusMeters: 250 }
    );
    expect(q).toBe("lat=17.385&lon=78.487");
  });

  it("carries everything that differs from the default", () => {
    const q = encodeViewState(
      {
        lat: 17.385,
        lon: 78.487,
        zoom: 16.5,
        basemap: "satellite",
        radiusMeters: 2000,
        section: "tools",
        tab: "site",
        question: "hospitals within 2 km",
      },
      { zoom: 12, radiusMeters: 250 }
    );
    const p = new URLSearchParams(q);
    expect(p.get("z")).toBe("16.5");
    expect(p.get("map")).toBe("satellite");
    expect(p.get("r")).toBe("2000");
    expect(p.get("s")).toBe("tools");
    expect(p.get("t")).toBe("site");
    expect(p.get("q")).toBe("hospitals within 2 km");
  });

  it("survives a round trip", () => {
    const view = {
      lat: 17.385,
      lon: 78.4868,
      zoom: 16.5,
      basemap: "satellite" as const,
      radiusMeters: 2000,
      section: "tools" as const,
      tab: "site" as const,
      question: "hospitals within 2 km",
    };
    expect(decodeViewState(encodeViewState(view))).toEqual(view);
  });
});

describe("decoding a link somebody sent", () => {
  it("still opens links shared before any of this existed", () => {
    // The old format was lat/lon and nothing else. Those links are already out
    // in the world and must keep working exactly as they did.
    expect(decodeViewState("?lat=17.385&lon=78.4867")).toEqual({ lat: 17.385, lon: 78.4867 });
  });

  it("refuses a position that would crash the map", () => {
    /*
      The regression this file exists for. MapLibre's LngLat throws outside
      ±90, inside an effect with no try/catch, which unmounts the workspace and
      lands on an error boundary that does not self-recover. One link killed
      the whole app for whoever opened it.
    */
    expect(decodeViewState("?lat=999&lon=0")).toBeNull();
    expect(decodeViewState("?lat=0&lon=200")).toBeNull();
    expect(decodeViewState("?lat=abc&lon=0")).toBeNull();
    expect(decodeViewState("?lat=NaN&lon=0")).toBeNull();
  });

  it("returns nothing at all when the URL has no position in it", () => {
    /*
      Caught by this test rather than in production, which is the point of it.

      `Number(null)` is 0, not NaN, so a missing parameter used to pass every
      check and decode to { lat: 0, lon: 0 } - Null Island, in the Atlantic.
      This function runs against window.location.search on every page load, so
      the plain home page with no query string would have produced a valid
      "shared view" and flown the map into the ocean on every first visit.
    */
    expect(decodeViewState("")).toBeNull();
    expect(decodeViewState("?")).toBeNull();
    expect(decodeViewState("?utm_source=twitter")).toBeNull();
    expect(decodeViewState("?lat=17.385")).toBeNull();
    expect(decodeViewState("?lon=78.487")).toBeNull();
    // An explicit 0,0 is still a real place and must survive.
    expect(decodeViewState("?lat=0&lon=0")).toEqual({ lat: 0, lon: 0 });
  });

  it("ignores an invalid field rather than clamping it", () => {
    /*
      Ignoring leaves the app on its own default for that one field and still
      opens. Clamping would quietly show something the link did not say - a
      radius of 5 km where the URL asked for 50 km - which is worse than
      visibly falling back, because nobody can tell it happened.
    */
    const v = decodeViewState("?lat=17.385&lon=78.487&z=99&r=999999&map=hologram&s=nonsense&t=nope");
    expect(v).toEqual({ lat: 17.385, lon: 78.487 });
  });

  it("accepts only the enum values the app actually has", () => {
    expect(decodeViewState("?lat=1&lon=1&map=satellite")?.basemap).toBe("satellite");
    expect(decodeViewState("?lat=1&lon=1&map=Satellite")?.basemap).toBeUndefined();
    expect(decodeViewState("?lat=1&lon=1&s=tools")?.section).toBe("tools");
    expect(decodeViewState("?lat=1&lon=1&t=site")?.tab).toBe("site");
  });

  it("keeps the radius inside the range the analysis can actually run", () => {
    expect(decodeViewState("?lat=1&lon=1&r=2000")?.radiusMeters).toBe(2000);
    expect(decodeViewState("?lat=1&lon=1&r=50")?.radiusMeters).toBeUndefined();
    expect(decodeViewState("?lat=1&lon=1&r=100000")?.radiusMeters).toBeUndefined();
  });

  it("cleans the one free-text field a link can carry", () => {
    // The question is the only thing in a URL the app acts on. It is capped,
    // stripped of control and zero-width characters, and only ever handed to
    // parseMapCommand, which returns a structured command or nothing.
    expect(decodeViewState("?lat=1&lon=1&q=hospitals%20within%202%20km")?.question).toBe("hospitals within 2 km");
    expect(decodeViewState("?lat=1&lon=1&q=hos%00pitals")?.question).toBe("hospitals");
    expect(decodeViewState("?lat=1&lon=1&q=hos%E2%80%8Bpitals")?.question).toBe("hospitals");
    expect(decodeViewState(`?lat=1&lon=1&q=${"x".repeat(500)}`)?.question).toHaveLength(200);
    expect(decodeViewState("?lat=1&lon=1&q=%20%20")?.question).toBeUndefined();
  });

  it("does not choke on a query string full of unrelated parameters", () => {
    // Links get utm tags stapled to them the moment they touch anything social.
    const v = decodeViewState("?utm_source=whatsapp&lat=17.385&lon=78.487&fbclid=abc&map=satellite");
    expect(v).toEqual({ lat: 17.385, lon: 78.487, basemap: "satellite" });
  });
});

describe("the URL handed to a person", () => {
  it("is an absolute link to the app", () => {
    const url = buildShareUrl({ lat: 17.385, lon: 78.487, basemap: "satellite" });
    expect(url).toMatch(/^https?:\/\/[^/]+\/\?/);
    expect(url).toContain("map=satellite");
  });

  it("lists every parameter it owns, so the restore can strip exactly those", () => {
    // A parameter added to the codec and forgotten here would be left sitting
    // in the address bar after restore, and would re-trigger on every refresh.
    const encoded = encodeViewState({
      lat: 1,
      lon: 1,
      zoom: 16,
      basemap: "dark",
      radiusMeters: 1000,
      section: "tools",
      tab: "site",
      question: "q",
    });
    for (const key of new URLSearchParams(encoded).keys()) {
      expect(VIEW_PARAMS).toContain(key);
    }
  });
});
