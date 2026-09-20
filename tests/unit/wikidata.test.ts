import { describe, expect, it } from "vitest";
import { qidFromUri, entityUrl, sparqlEscape } from "../../api/_lib/wikidata";

/**
 * These are the pure, network-free helpers in wikidata.ts. The
 * network-dependent resolver functions (resolveCountryWithOfficeholders,
 * etc.) are exercised indirectly via tests/unit/officials.test.ts, which
 * mocks fetch - see that file's header comment for why.
 */
describe("qidFromUri", () => {
  it("extracts a QID from a full Wikidata entity URI", () => {
    expect(qidFromUri("http://www.wikidata.org/entity/Q30")).toBe("Q30");
  });

  it("returns null for a non-QID uri", () => {
    expect(qidFromUri("http://www.wikidata.org/entity/P297")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(qidFromUri(undefined)).toBeNull();
  });
});

describe("entityUrl", () => {
  it("builds a wikidata.org wiki link from a QID", () => {
    expect(entityUrl("Q30")).toBe("https://www.wikidata.org/wiki/Q30");
  });
});

describe("sparqlEscape", () => {
  it("escapes backslashes and double quotes so untrusted place names can't break out of a SPARQL string literal", () => {
    expect(sparqlEscape('Say "hi"')).toBe('Say \\"hi\\"');
    expect(sparqlEscape("back\\slash")).toBe("back\\\\slash");
    // A classic injection attempt: closing the string literal and appending
    // another clause. After escaping, the quote is neutralized and the
    // whole thing stays inside one string literal instead of breaking out.
    expect(sparqlEscape('x" } UNION { ?a ?b ?c')).toBe('x\\" } UNION { ?a ?b ?c');
  });
});
