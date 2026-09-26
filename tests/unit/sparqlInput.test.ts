import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import { sparqlEscape } from "../../api/_lib/wikidata";
import handler from "../../api/_routes/officials";

/**
 * Place names from the browser go into Wikidata SPARQL. They must stay inside
 * their string literal, and codes must look like the codes they claim to be.
 */

afterEach(() => vi.unstubAllGlobals());

describe("sparqlEscape", () => {
  it("keeps quotes and backslashes inside the literal", () => {
    expect(sparqlEscape('Hyder"abad\\')).toBe('Hyder\\"abad\\\\');
  });

  it("escapes line breaks, which are a syntax error inside a literal", () => {
    expect(sparqlEscape("a\nb\rc\td")).toBe("a\\nb\\rc\\td");
  });

  it("drops other control characters", () => {
    expect(sparqlEscape("Pune\u0000\u0007")).toBe("Pune");
  });
});

describe("officials input", () => {
  it("rejects a country code that is not two letters", async () => {
    const call = fakeReqRes({ countryCode: 'IN"} UNION {' });
    await handler(call.req, call.res);
    expect(call.statusCode).toBe(400);
  });

  it("ignores a malformed state code rather than querying with it", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(decodeURIComponent(String(url)));
        return { ok: true, status: 200, json: async () => ({ results: { bindings: [] } }), text: async () => "{}" };
      })
    );
    const call = fakeReqRes({ countryCode: "zz", stateCode: "ZZ-TG'} ; DROP" });
    await handler(call.req, call.res);
    expect(seen.join("\n")).not.toContain("DROP");
  });
});
