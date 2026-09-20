import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler, { rankScore, type SearchResultDto } from "../../api/_routes/geocode";

/**
 * Search ranking.
 *
 * These exist because real users couldn't find their own neighbourhood. The
 * handler sorted purely by Nominatim's `importance`, which is a GLOBAL
 * notability score - a residential colony scores near zero, so it sorted
 * below every large city that happened to share a word with it. Someone in
 * Hyderabad searching a local name got Delhi first and their own street last
 * or truncated off the list.
 *
 * The rule these lock in: when the user is clearly looking at somewhere,
 * nearness wins; when they aren't, fame decides.
 */

const HYDERABAD = { lat: 17.385, lon: 78.4867 };

const place = (name: string, lat: number, lon: number, importance: number): SearchResultDto => ({
  displayName: name,
  name,
  lat,
  lon,
  importance,
});

describe("rankScore", () => {
  it("falls back to importance alone when there is no viewport", () => {
    const famous = place("Delhi", 28.61, 77.2, 0.9);
    const local = place("Ameerpet", 17.437, 78.448, 0.05);
    expect(rankScore(famous, null)).toBeGreaterThan(rankScore(local, null));
  });

  it("puts a nearby unremarkable place above a distant famous one", () => {
    // This is the exact failure users reported.
    const famous = place("Delhi", 28.61, 77.2, 0.9);
    const local = place("Ameerpet", 17.437, 78.448, 0.05);
    expect(rankScore(local, HYDERABAD)).toBeGreaterThan(rankScore(famous, HYDERABAD));
  });

  it("prefers the closer of two equally obscure same-name places", () => {
    // "Gandhi Nagar" exists in dozens of Indian cities. The one two km away
    // is the one that was meant.
    const near = place("Gandhi Nagar", 17.44, 78.49, 0.04);
    const far = place("Gandhi Nagar", 23.22, 72.65, 0.04);
    expect(rankScore(near, HYDERABAD)).toBeGreaterThan(rankScore(far, HYDERABAD));
  });

  it("still lets a genuinely famous distant city win when nothing is close", () => {
    // Searching "Paris" from Hyderabad must still find Paris - proximity is a
    // bias, not a filter.
    const paris = place("Paris", 48.85, 2.35, 0.95);
    const obscure = place("Parisa village", 19.5, 80.1, 0.02);
    expect(rankScore(paris, HYDERABAD)).toBeGreaterThan(rankScore(obscure, HYDERABAD));
  });

  it("decays smoothly with distance rather than cutting off", () => {
    const at = (lat: number) => rankScore(place("X", lat, 78.4867, 0.1), HYDERABAD);
    const sameCity = at(17.40);
    const nextTown = at(17.80);
    const nextState = at(21.00);
    expect(sameCity).toBeGreaterThan(nextTown);
    expect(nextTown).toBeGreaterThan(nextState);
  });

  it("treats a missing importance as zero rather than as NaN", () => {
    const noImportance: SearchResultDto = { displayName: "X", name: "X", lat: 17.4, lon: 78.5 };
    expect(Number.isFinite(rankScore(noImportance, HYDERABAD))).toBe(true);
    expect(Number.isFinite(rankScore(noImportance, null))).toBe(true);
  });
});

function mockNominatim(results: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => results,
      text: async () => JSON.stringify(results),
    }))
  );
}

const raw = (name: string, lat: number, lon: number, importance: number) => ({
  display_name: name,
  name,
  lat: String(lat),
  lon: String(lon),
  importance,
  type: "suburb",
});

describe("api/geocode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("orders results by nearness when a viewport is given", async () => {
    mockNominatim([raw("Delhi", 28.61, 77.2, 0.9), raw("Ameerpet, Hyderabad", 17.437, 78.448, 0.05)]);
    const r = fakeReqRes({ q: "ameerpet-test-1", lat: String(HYDERABAD.lat), lon: String(HYDERABAD.lon) });
    await handler(r.req, r.res);

    const { results } = r.body as { results: SearchResultDto[] };
    expect(results[0]!.name).toContain("Ameerpet");
    // And it reports how far away each result is, so the list is readable.
    expect(results[0]!.distanceKm).toBeLessThan(20);
  });

  it("orders by importance when no viewport is given", async () => {
    mockNominatim([raw("Ameerpet, Hyderabad", 17.437, 78.448, 0.05), raw("Delhi", 28.61, 77.2, 0.9)]);
    const r = fakeReqRes({ q: "ameerpet-test-2" });
    await handler(r.req, r.res);
    const { results } = r.body as { results: SearchResultDto[] };
    expect(results[0]!.name).toBe("Delhi");
    expect(results[0]!.distanceKm).toBeUndefined();
  });

  it("ignores a nonsensical viewport instead of ranking by garbage", async () => {
    mockNominatim([raw("Delhi", 28.61, 77.2, 0.9), raw("Ameerpet", 17.437, 78.448, 0.05)]);
    const r = fakeReqRes({ q: "ameerpet-test-3", lat: "999", lon: "abc" });
    await handler(r.req, r.res);
    const { results } = r.body as { results: SearchResultDto[] };
    // Falls back to importance ordering rather than producing NaN scores.
    expect(results[0]!.name).toBe("Delhi");
  });

  it("caches per viewport, so one person's location can't fix everyone's results", async () => {
    // The old cache key was the query alone: whoever searched a word first
    // decided what that word meant for every later user.
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [raw("Somewhere", 17.4, 78.5, 0.1)],
      text: async () => "[]",
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const a = fakeReqRes({ q: "shared-word", lat: "17.4", lon: "78.5" });
    await handler(a.req, a.res);
    const b = fakeReqRes({ q: "shared-word", lat: "51.5", lon: "-0.1" });
    await handler(b.req, b.res);

    // Two different viewports must produce two real lookups, not one cached.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty query and returns nothing for a single character", async () => {
    const empty = fakeReqRes({});
    await handler(empty.req, empty.res);
    expect(empty.statusCode).toBe(400);

    const short = fakeReqRes({ q: "a" });
    await handler(short.req, short.res);
    expect(short.statusCode).toBe(200);
    expect((short.body as { results: unknown[] }).results).toEqual([]);
  });
});
