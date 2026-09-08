import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/officials";
import type { OfficialEntry } from "../../api/_routes/officials";

/**
 * api/officials.ts (Official / Authority Intelligence) is built around one
 * hard rule: never invent a name. These tests exercise that rule directly —
 * a resolved Wikidata officeholder must come through as "verified" with a
 * name + source, and every path where resolution fails or is ambiguous must
 * come through as "unavailable" with name: null, never a guess. Wikidata's
 * own SPARQL endpoint isn't reachable from this sandbox (see project notes),
 * so `fetch` is mocked here with canned SPARQL JSON responses in the exact
 * call order api/officials.ts makes them (country, then state, then city,
 * then district) — the real end-to-end query needs verification on a
 * machine that can reach query.wikidata.org.
 */

function uriVal(value: string) {
  return { type: "uri", value };
}
function litVal(value: string) {
  return { type: "literal", value };
}
function sparqlBody(bindings: unknown[]) {
  return { results: { bindings } };
}

function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  // vitest records a call in fn.mock.calls synchronously, before this
  // implementation runs — so by the time we're executing for the Nth call,
  // mock.calls.length is already N. Index with -1 to land on the response
  // meant for *this* call, not the next one.
  const fn = vi.fn(async () => {
    const index = Math.min(fn.mock.calls.length - 1, responses.length - 1);
    const r = responses[index]!;
    return { ok: r.ok, status: r.ok ? 200 : 500, json: async () => r.body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("api/officials handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires countryCode", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("merges head of state and head of government into one verified entry when the same person holds both (US President)", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q30"),
            placeLabel: litVal("United States of America"),
            hos: uriVal("http://www.wikidata.org/entity/Q22686"),
            hosLabel: litVal("Donald Trump"),
            hosStart: litVal("2025-01-20T00:00:00Z"),
            hog: uriVal("http://www.wikidata.org/entity/Q22686"),
            hogLabel: litVal("Donald Trump"),
            hogStart: litVal("2025-01-20T00:00:00Z"),
          },
        ]),
      },
    ]);

    const result = fakeReqRes({ country: "United States", countryCode: "US" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { officials: OfficialEntry[] };
    expect(body.officials).toHaveLength(1);
    expect(body.officials[0]).toMatchObject({
      level: "country",
      role: "President",
      name: "Donald Trump",
      status: "verified",
      sourceUrl: "https://www.wikidata.org/wiki/Q30",
      sourceLabel: "Wikidata",
    });
  });

  it("keeps head of state and head of government as separate verified entries when they're different people, at both country and state level (India)", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q668"),
            placeLabel: litVal("India"),
            hos: uriVal("http://www.wikidata.org/entity/Q1"),
            hosLabel: litVal("Droupadi Murmu"),
            hosStart: litVal("2022-07-25T00:00:00Z"),
            hog: uriVal("http://www.wikidata.org/entity/Q2"),
            hogLabel: litVal("Narendra Modi"),
            hogStart: litVal("2014-05-26T00:00:00Z"),
          },
        ]),
      },
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q1445"),
            placeLabel: litVal("Telangana"),
            hos: uriVal("http://www.wikidata.org/entity/Q3"),
            hosLabel: litVal("Jishnu Dev Varma"),
            hosStart: litVal("2024-07-01T00:00:00Z"),
            hog: uriVal("http://www.wikidata.org/entity/Q4"),
            hogLabel: litVal("Revanth Reddy"),
            hogStart: litVal("2023-12-07T00:00:00Z"),
          },
        ]),
      },
    ]);

    const result = fakeReqRes({ country: "India", countryCode: "IN", state: "Telangana", stateCode: "IN-TG" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { officials: OfficialEntry[] };
    const roles = body.officials.map((o) => `${o.level}:${o.role}:${o.name}`);
    expect(roles).toEqual([
      "country:President:Droupadi Murmu",
      "country:Prime Minister:Narendra Modi",
      "state:Governor:Jishnu Dev Varma",
      "state:Chief Minister:Revanth Reddy",
    ]);
    expect(body.officials.every((o) => o.status === "verified" && o.sourceUrl?.startsWith("https://www.wikidata.org/wiki/"))).toBe(true);
  });

  // Regression test for a real bug seen live: a Prime Minister card that
  // literally read "Q1058" instead of a name. Wikidata's own SERVICE
  // wikibase:label falls back to returning the entity's bare QID as the
  // label value when no real label is found in any language — this treats
  // that fallback as "no label", not a name, so it degrades to "Unable to
  // verify" instead of ever showing a raw Wikidata ID to the user.
  it('treats a bare QID coming back as a *Label value as "no real label" — reports Unable to verify, never shows a Wikidata ID as a name', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q668"),
            placeLabel: litVal("India"),
            hos: uriVal("http://www.wikidata.org/entity/Q1"),
            hosLabel: litVal("Droupadi Murmu"),
            hosStart: litVal("2022-07-25T00:00:00Z"),
            hog: uriVal("http://www.wikidata.org/entity/Q1058"),
            // The label service's own "nothing found" fallback: the raw QID.
            hogLabel: litVal("Q1058"),
            hogStart: litVal("2014-05-26T00:00:00Z"),
          },
        ]),
      },
    ]);

    const result = fakeReqRes({ country: "India", countryCode: "IN" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { officials: OfficialEntry[] };
    const pm = body.officials.find((o) => o.role === "Prime Minister");
    expect(pm).toMatchObject({ name: null, status: "unavailable" });
    expect(pm?.name).not.toBe("Q1058");
    // Head of state resolved normally in the same response — this isn't a
    // blanket failure, just the one field that had no real label.
    const president = body.officials.find((o) => o.role === "President");
    expect(president).toMatchObject({ name: "Droupadi Murmu", status: "verified" });
  });

  it('reports "Unable to verify" — never a guessed name — when the country can\'t be resolved on Wikidata', async () => {
    mockFetchSequence([{ ok: true, body: sparqlBody([]) }]);

    const result = fakeReqRes({ country: "Nowhereland", countryCode: "ZZ" });
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { officials: OfficialEntry[] };
    expect(body.officials).toHaveLength(1);
    expect(body.officials[0]).toMatchObject({ level: "country", name: null, status: "unavailable" });
    expect(body.officials[0]!.note).toMatch(/Could not resolve/);
  });

  it("skips state lookup (marks it unavailable) when only a state NAME is available without a precise ISO 3166-2 code, rather than guessing which same-named subdivision it is", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q30"),
            placeLabel: litVal("United States of America"),
            hos: uriVal("http://www.wikidata.org/entity/Q22686"),
            hosLabel: litVal("Donald Trump"),
            hog: uriVal("http://www.wikidata.org/entity/Q22686"),
            hogLabel: litVal("Donald Trump"),
          },
        ]),
      },
    ]);

    const result = fakeReqRes({ countryCode: "US", state: "Some State" });
    await handler(result.req, result.res);

    const body = result.body as { officials: OfficialEntry[] };
    const stateEntry = body.officials.find((o) => o.level === "state");
    expect(stateEntry).toMatchObject({ name: null, status: "unavailable" });
    expect(stateEntry!.note).toMatch(/No precise subdivision code/);
  });

  it("refuses to guess among multiple same-named cities — marks city unavailable instead of picking one", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q30"),
            placeLabel: litVal("United States of America"),
            hos: uriVal("http://www.wikidata.org/entity/Q22686"),
            hosLabel: litVal("Donald Trump"),
            hog: uriVal("http://www.wikidata.org/entity/Q22686"),
            hogLabel: litVal("Donald Trump"),
          },
        ]),
      },
      {
        ok: true,
        body: sparqlBody([
          { place: uriVal("http://www.wikidata.org/entity/Q28513"), placeLabel: litVal("Springfield, Illinois") },
          { place: uriVal("http://www.wikidata.org/entity/Q49255"), placeLabel: litVal("Springfield, Missouri") },
        ]),
      },
    ]);

    const result = fakeReqRes({ countryCode: "US", city: "Springfield" });
    await handler(result.req, result.res);

    const body = result.body as { officials: OfficialEntry[] };
    const cityEntry = body.officials.find((o) => o.level === "city");
    expect(cityEntry).toMatchObject({ name: null, status: "unavailable" });
    expect(cityEntry!.note).toMatch(/uniquely match/);
  });

  it("resolves a unique city match to a verified Mayor entry", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q145"),
            placeLabel: litVal("United Kingdom"),
            hos: uriVal("http://www.wikidata.org/entity/Q41213"),
            hosLabel: litVal("Charles III"),
            hog: uriVal("http://www.wikidata.org/entity/Q84"),
            hogLabel: litVal("Keir Starmer"),
          },
        ]),
      },
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q84"),
            placeLabel: litVal("London"),
            hog: uriVal("http://www.wikidata.org/entity/Q4653"),
            hogLabel: litVal("Sadiq Khan"),
            hogStart: litVal("2016-05-09T00:00:00Z"),
          },
        ]),
      },
    ]);

    const result = fakeReqRes({ countryCode: "GB", city: "London" });
    await handler(result.req, result.res);

    const body = result.body as { officials: OfficialEntry[] };
    const cityEntry = body.officials.find((o) => o.level === "city");
    expect(cityEntry).toMatchObject({ role: "Mayor", name: "Sadiq Khan", status: "verified", sourceUrl: "https://www.wikidata.org/wiki/Q84" });
  });

  it("caches a response and doesn't re-query Wikidata for the same location within the TTL", async () => {
    const fn = mockFetchSequence([
      {
        ok: true,
        body: sparqlBody([
          {
            place: uriVal("http://www.wikidata.org/entity/Q17"),
            placeLabel: litVal("Japan"),
            hos: uriVal("http://www.wikidata.org/entity/Q57330"),
            hosLabel: litVal("Naruhito"),
            hog: uriVal("http://www.wikidata.org/entity/Q297764"),
            hogLabel: litVal("Shigeru Ishiba"),
          },
        ]),
      },
    ]);

    const first = fakeReqRes({ countryCode: "JP" });
    await handler(first.req, first.res);
    const second = fakeReqRes({ countryCode: "JP" });
    await handler(second.req, second.res);

    expect(fn.mock.calls.length).toBe(1);
    expect((first.body as { cached: boolean }).cached).toBe(false);
    expect((second.body as { cached: boolean }).cached).toBe(true);
    expect((second.body as { officials: OfficialEntry[] }).officials).toEqual((first.body as { officials: OfficialEntry[] }).officials);
  });

  it("never throws when Wikidata is unreachable — every level reports unavailable instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const result = fakeReqRes({ countryCode: "FR" });
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(200);
    const body = result.body as { officials: OfficialEntry[] };
    expect(body.officials.every((o) => o.status === "unavailable" && o.name === null)).toBe(true);
  });
});
