import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/population";

/**
 * Population is the feature most likely to be quietly wrong, because a number
 * on a map looks authoritative whatever produced it. These tests hold the
 * handler to the rule the whole product runs on: report what the source says,
 * WITH its year and provenance, and return nothing rather than a guess.
 *
 * The live query itself could not be run from the build container — Wikidata
 * and Overpass are both blocked by its egress policy — so these exercise the
 * handler against recorded response shapes. The shapes are the documented
 * SPARQL JSON results format and the Overpass JSON format respectively.
 */
function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  );
}

/**
 * Overpass responses must carry a plausible replica timestamp — the wrapper
 * rejects mirrors without one, because a corrupted mirror returning an empty
 * element list is indistinguishable from "nothing is there" and would quietly
 * produce wrong answers. Mocks have to include it or they aren't testing the
 * real path.
 */
const overpass = (elements: unknown[]) => ({
  osm3s: { timestamp_osm_base: new Date().toISOString().replace(/\.\d+Z$/, "Z") },
  elements,
});

/** Each test needs fresh coordinates — the handler caches by rounded lat/lon. */
let seed = 0;
const coords = () => {
  seed += 0.01;
  return { lat: `${17.385 + seed}`, lon: `${78.4867 + seed}` };
};

const sparql = (bindings: unknown[]) => ({ results: { bindings } });

const hyderabad = {
  place: { value: "http://www.wikidata.org/entity/Q1361" },
  placeLabel: { value: "Hyderabad" },
  population: { value: "6809970" },
  date: { value: "2011-01-01T00:00:00Z" },
  area: { value: "650" },
};

describe("api/population", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Regression: the live endpoint returned "Andhra Pradesh (1956-2014)" —
   * 84 million — for a point in Hyderabad. The query asked only for the most
   * populous thing with coordinates nearby, and administrative regions have
   * both, at populations no city can match. It also happened to be a state
   * that no longer exists. Both filters are asserted here because neither is
   * visible in the response shape: if someone simplifies the SPARQL later,
   * this is what catches it.
   */
  it("asks only for existing human settlements, never regions or dissolved entities", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => sparql([hyderabad]),
      text: async () => JSON.stringify(sparql([hyderabad])),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = fakeReqRes(coords());
    await handler(r.req, r.res);

    const sent = decodeURIComponent(String(fetchSpy.mock.calls[0]?.[0] ?? "")) + String(fetchSpy.mock.calls[0]?.[1] ? JSON.stringify(fetchSpy.mock.calls[0][1]) : "");
    // Q486972 is "human settlement"; the P279* walk covers city/town/village
    // and every subclass, so a state or district can never win the sort.
    expect(sent).toContain("Q486972");
    // P576 is "dissolved, abolished or demolished date".
    expect(sent).toContain("P576");
  });

  it("rejects missing or non-numeric coordinates", async () => {
    for (const q of [{}, { lat: "abc", lon: "12" }, { lat: "17" }]) {
      const r = fakeReqRes(q);
      await handler(r.req, r.res);
      expect(r.statusCode).toBe(400);
    }
  });

  it("rejects coordinates outside the world", async () => {
    for (const q of [{ lat: "91", lon: "0" }, { lat: "0", lon: "181" }, { lat: "-91", lon: "0" }]) {
      const r = fakeReqRes(q);
      await handler(r.req, r.res);
      expect(r.statusCode).toBe(400);
    }
  });

  it("returns the population with the year, area, density and a checkable source", async () => {
    mockFetch(sparql([hyderabad]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);

    expect(r.statusCode).toBe(200);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.place).toBe("Hyderabad");
    expect(population.population).toBe(6_809_970);
    // The YEAR is the point — a figure without one invites the reader to
    // assume it's current.
    expect(population.year).toBe(2011);
    expect(population.areaKm2).toBe(650);
    expect(population.densityPerKm2).toBe(Math.round(6_809_970 / 650));
    expect(population.source).toBe("Wikidata");
    expect(population.sourceUrl).toContain("Q1361");
  });

  it("reports a null year rather than inventing one when the source has no date", async () => {
    mockFetch(sparql([{ ...hyderabad, date: undefined }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.year).toBeNull();
    expect(population.population).toBe(6_809_970);
  });

  it("omits density when the area is unknown instead of guessing an area", async () => {
    mockFetch(sparql([{ ...hyderabad, area: undefined }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.areaKm2).toBeNull();
    expect(population.densityPerKm2).toBeNull();
  });

  it("answers null when no source has a figure, rather than estimating", async () => {
    // Wikidata returns nothing, then Overpass returns nothing.
    mockFetch(sparql([]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { population: unknown }).population).toBeNull();
  });

  it("survives a provider outage without inventing a number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { population: unknown }).population).toBeNull();
  });

  it("ignores a zero or negative population from a malformed record", async () => {
    mockFetch(sparql([{ ...hyderabad, population: { value: "0" } }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect((r.body as { population: unknown }).population).toBeNull();
  });

  it("falls back to OpenStreetMap when Wikidata has nothing", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        const body =
          call === 1
            ? sparql([])
            : overpass([{ type: "node", id: 1, lat: 17.4, lon: 78.5, tags: { place: "town", name: "Kukatpally", population: "1,200,000", "population:date": "2011-03-01" } }]);
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      })
    );

    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.place).toBe("Kukatpally");
    // Comma separators are stripped; the figure is not otherwise reinterpreted.
    expect(population.population).toBe(1_200_000);
    expect(population.year).toBe(2011);
    expect(population.source).toBe("OpenStreetMap");
  });

  it("discards an OSM population tag that isn't a clean number", async () => {
    // "approx 50000" parsed as 50000 would invent a precision the tag doesn't
    // have. Free-text tags are common in OSM, so this matters.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        const body =
          call === 1
            ? sparql([])
            : overpass([{ type: "node", id: 1, tags: { place: "village", name: "Somewhere", population: "approx 50000" } }]);
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      })
    );

    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect((r.body as { population: unknown }).population).toBeNull();
  });
});
