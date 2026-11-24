import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler, { areaToKm2, pickFigures, MAX_PLAUSIBLE_DENSITY } from "../../api/_routes/population";

/**
 * Population is the feature most likely to be quietly wrong, because a number
 * on a map looks authoritative whatever produced it. These tests hold the
 * handler to the rule the whole product runs on: report what the source says,
 * WITH its year and provenance, and return nothing rather than a guess.
 *
 * The live query itself could not be run from the build container - Wikidata
 * and Overpass are both blocked by its egress policy - so these exercise the
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
 * Overpass responses must carry a plausible replica timestamp - the wrapper
 * rejects mirrors without one, because a corrupted mirror returning an empty
 * element list is indistinguishable from "nothing is there" and would quietly
 * produce wrong answers. Mocks have to include it or they aren't testing the
 * real path.
 */
const overpass = (elements: unknown[]) => ({
  osm3s: { timestamp_osm_base: new Date().toISOString().replace(/\.\d+Z$/, "Z") },
  elements,
});

/**
 * Wikidata is asked first and Overpass second, and each has its own response
 * format. Giving both the same body used to "work" only because an Overpass
 * failure was silently treated as "no figure"; now that a failure is reported
 * as a failure, each source gets a realistic reply.
 */
function mockSequence(...bodies: unknown[]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    })
  );
}

/** Each test needs fresh coordinates - the handler caches by rounded lat/lon. */
let seed = 0;
const coords = () => {
  seed += 0.01;
  return { lat: `${17.385 + seed}`, lon: `${78.4867 + seed}` };
};

const sparql = (bindings: unknown[]) => ({ results: { bindings } });

/** Wikidata IRIs the query returns for units and statement ranks. */
const unit = (qid: string) => ({ value: `http://www.wikidata.org/entity/${qid}` });
const KM2 = unit("Q712226");
const NORMAL = { value: "http://wikiba.se/ontology#NormalRank" };
const PREFERRED = { value: "http://wikiba.se/ontology#PreferredRank" };

/**
 * One result row in the shape the query returns: a population statement
 * (value, date, rank) beside an area statement (amount, unit, rank).
 */
const hyderabad = {
  place: { value: "http://www.wikidata.org/entity/Q1361" },
  placeLabel: { value: "Hyderabad" },
  population: { value: "6809970" },
  date: { value: "2011-01-01T00:00:00Z" },
  popRank: PREFERRED,
  areaAmount: { value: "650" },
  areaUnit: KM2,
  areaRank: NORMAL,
};

describe("api/population", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Regression: the live endpoint returned "Andhra Pradesh (1956-2014)" -
   * 84 million - for a point in Hyderabad. The query asked only for the most
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
    // The YEAR is the point - a figure without one invites the reader to
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
    mockFetch(sparql([{ ...hyderabad, areaAmount: undefined, areaUnit: undefined, areaRank: undefined }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.areaKm2).toBeNull();
    expect(population.densityPerKm2).toBeNull();
  });

  it("answers null when no source has a figure, rather than estimating", async () => {
    // Wikidata returns nothing, then Overpass returns nothing.
    mockSequence(sparql([]), overpass([]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { population: unknown }).population).toBeNull();
  });

  it("reports an outage as an outage, not as 'no published figure'", async () => {
    // Both sources unreachable. This used to answer 200 with population: null,
    // which the panel shows as "no published population figure for this
    // area", cached for a day. That is a false statement about the world.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(502);
    expect((r.body as { code?: string }).code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("reports an outage when Wikidata errors even if the error comes back as HTTP 200 with no result set", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 429, json: async () => ({}), text: async () => "" };
        throw new Error("overpass down");
      })
    );
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(502);
  });

  it("ignores a zero or negative population from a malformed record", async () => {
    // Wikidata's only figure is unusable, and Overpass has nothing either.
    mockSequence(sparql([{ ...hyderabad, population: { value: "0" } }]), overpass([]));
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

describe("area units and density (audit P1-A)", () => {
  /*
    Regression for the density bug: the query used to read wdt:P2046, the
    bare number with its unit discarded, and divide by it as if it were
    always km². Wikidata stores areas in whatever unit the editor used.
  */
  it("converts every supported area unit to km²", () => {
    expect(areaToKm2("650", KM2.value)).toBe(650);
    expect(areaToKm2("65000", unit("Q35852").value)).toBeCloseTo(650, 9); // hectares
    expect(areaToKm2("650000000", unit("Q25343").value)).toBeCloseTo(650, 9); // square metres
    expect(areaToKm2("251", unit("Q232291").value)).toBeCloseTo(650.087, 2); // square miles
    expect(areaToKm2("160618", unit("Q81292").value)).toBeCloseTo(650, 0); // acres
    expect(areaToKm2("+650", KM2.value)).toBe(650); // Wikidata writes a leading plus sign
  });

  it("rejects units that are not area, unknown units, and non-positive amounts", () => {
    expect(areaToKm2("650", unit("Q11573").value)).toBeNull(); // metre: a length, not an area
    expect(areaToKm2("650", unit("Q199").value)).toBeNull(); // the unitless "1"
    expect(areaToKm2("650", undefined)).toBeNull();
    expect(areaToKm2("0", KM2.value)).toBeNull();
    expect(areaToKm2("-5", KM2.value)).toBeNull();
    expect(areaToKm2("abc", KM2.value)).toBeNull();
  });

  it("computes density from an area given in hectares correctly", async () => {
    mockFetch(sparql([{ ...hyderabad, areaAmount: { value: "65000" }, areaUnit: unit("Q35852") }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.areaKm2).toBe(650);
    // Was 6_809_970 / 65_000 = 105 people per km², a hundred times too low.
    expect(population.densityPerKm2).toBe(Math.round(6_809_970 / 650));
  });

  it("shows no area or density for an unsupported unit, instead of a wrong one", async () => {
    mockFetch(sparql([{ ...hyderabad, areaUnit: unit("Q11573") }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.population).toBe(6_809_970);
    expect(population.areaKm2).toBeNull();
    expect(population.densityPerKm2).toBeNull();
  });

  it("withholds a density no real place could have", async () => {
    // 650 entered as km² but really m²-scale: 6.8 million people on 0.00065 km².
    mockFetch(sparql([{ ...hyderabad, areaAmount: { value: "650" }, areaUnit: unit("Q25343") }]));
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.densityPerKm2).toBeNull();
    expect(population.areaKm2).toBeNull();
    expect(MAX_PLAUSIBLE_DENSITY).toBeLessThan(6_809_970 / 0.00065);
  });
});

describe("which population figure is reported", () => {
  const row = (population: string, year: string | null, rank: { value: string }) => ({
    ...hyderabad,
    population: { value: population },
    date: year ? { value: `${year}-01-01T00:00:00Z` } : undefined,
    popRank: rank,
  });

  it("prefers the statement Wikidata marks as preferred", () => {
    const picked = pickFigures([row("7000000", "2021", NORMAL), row("6809970", "2011", PREFERRED)]);
    expect(picked?.population).toBe(6_809_970);
    expect(picked?.year).toBe(2011);
  });

  it("without a preferred one, reports the most recent figure, not the largest", () => {
    // A shrinking town: the old census was bigger. Taking the largest value
    // used to report the old figure as if it were current.
    const picked = pickFigures([row("52000", "2001", NORMAL), row("48000", "2011", NORMAL), row("50000", null, NORMAL)]);
    expect(picked?.population).toBe(48_000);
    expect(picked?.year).toBe(2011);
  });

  it("ignores an unbelievable census year rather than reporting it", () => {
    const picked = pickFigures([row("48000", "1200", NORMAL)]);
    expect(picked?.population).toBe(48_000);
    expect(picked?.year).toBeNull();
  });

  it("prefers a preferred-rank area over a normal one", () => {
    const picked = pickFigures([
      { ...hyderabad, areaAmount: { value: "217" }, areaUnit: KM2, areaRank: NORMAL },
      { ...hyderabad, areaAmount: { value: "650" }, areaUnit: KM2, areaRank: PREFERRED },
    ]);
    expect(picked?.areaKm2).toBe(650);
  });
});

describe("if Wikidata rejects the detailed query", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("still reports the sourced population, just without area or density", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 400, json: async () => ({}), text: async () => "query error" };
        const body = sparql([{ ...hyderabad, areaAmount: undefined, areaUnit: undefined, areaRank: undefined }]);
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      })
    );
    const r = fakeReqRes(coords());
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(200);
    const { population } = r.body as { population: Record<string, unknown> };
    expect(population.population).toBe(6_809_970);
    expect(population.year).toBe(2011);
    expect(population.densityPerKm2).toBeNull();
  });
});
