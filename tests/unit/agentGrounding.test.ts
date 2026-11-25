import { describe, expect, it } from "vitest";
import {
  INSUFFICIENT,
  allowedNumbers,
  asOfLabel,
  checkAnswer,
  confidenceFor,
  evidenceTable,
  numbersIn,
  sourcesOf,
} from "../../api/_lib/evidence/grounding";
import type { EvidenceItem } from "../../src/types/ai";

const AS_OF = "2026-11-25T07:30:00.000Z";

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", label: "Place name", value: "Banjara Hills", kind: "retrieved", source: "OpenStreetMap Nominatim", retrievedAt: AS_OF },
  { id: "E2", label: "Hospitals and clinics within 1 km", value: "4 (closest: Care Clinic, 350 m)", kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: AS_OF },
  { id: "E3", label: "Temperature now", value: "31 °C", kind: "retrieved", source: "Open-Meteo", retrievedAt: AS_OF },
  { id: "E4", label: "Route distance", value: "12.46 km", kind: "retrieved", source: "OSRM", retrievedAt: AS_OF },
  { id: "E5", label: "Population of Hyderabad", value: "6,809,970 (2011)", kind: "retrieved", source: "Wikidata", retrievedAt: AS_OF },
  { id: "E6", label: "Weather now", value: "Unavailable", kind: "unavailable", source: "Open-Meteo", note: "It did not answer within 8 seconds." },
];

describe("numbers in text", () => {
  it("reads integers, decimals and thousands separators", () => {
    expect(numbersIn("4 hospitals, 12.46 km and 6,809,970 people")).toEqual([4, 12.46, 6809970]);
  });

  it("ignores the sign, so -2 °C and 2 °C are the same number to check", () => {
    expect(numbersIn("-2 °C")).toEqual([2]);
  });
});

describe("which numbers an answer may use", () => {
  it("includes every number in the evidence, and each one rounded", () => {
    const allowed = allowedNumbers(EVIDENCE);
    for (const n of [4, 350, 31, 1, 12.46, 12.5, 12, 6809970, 2011, 8]) expect(allowed.has(n)).toBe(true);
  });

  it("does not hand out the as-of date's numbers for other uses", () => {
    // "25 Nov 2026" must not make "25 minutes" acceptable.
    const allowed = allowedNumbers(EVIDENCE);
    for (const n of [25, 2026]) expect(allowed.has(n)).toBe(false);
  });

  it("accepts an as-of time quoted the way the evidence writes it", () => {
    for (const text of ["It was 31 °C as of 07:30 UTC [E3].", "It was 31 °C on 25 Nov 2026 [E3].", "It was 31 °C at 07:30 [E3]."]) {
      expect(checkAnswer(text, EVIDENCE).removed).toBe(0);
    }
  });

  it("does not include numbers that appear nowhere", () => {
    const allowed = allowedNumbers(EVIDENCE);
    for (const n of [5, 40, 13, 7000000]) expect(allowed.has(n)).toBe(false);
  });
});

describe("checking an answer against the evidence", () => {
  it("keeps cited sentences and records what they cite", () => {
    const checked = checkAnswer("There are 4 hospitals and clinics within 1 km [E2]. It is 31 °C right now [E3].", EVIDENCE);
    expect(checked.removed).toBe(0);
    expect(checked.findings).toEqual([
      { text: "There are 4 hospitals and clinics within 1 km.", evidenceIds: ["E2"] },
      { text: "It is 31 °C right now.", evidenceIds: ["E3"] },
    ]);
    expect(checked.summary).toBe("There are 4 hospitals and clinics within 1 km. It is 31 °C right now.");
  });

  it("drops a sentence with a number the evidence does not hold", () => {
    const checked = checkAnswer("There are 4 hospitals nearby [E2]. The route takes about 25 minutes in traffic [E4].", EVIDENCE);
    expect(checked.removed).toBe(1);
    expect(checked.findings.map((f) => f.text)).toEqual(["There are 4 hospitals nearby."]);
  });

  it("drops a unit conversion the model did itself", () => {
    // 12.46 km is in the evidence; 7.7 miles is the model's own arithmetic.
    const checked = checkAnswer("The route is 7.7 miles long [E4].", EVIDENCE);
    expect(checked.removed).toBe(1);
    expect(checked.findings).toEqual([]);
  });

  it("allows a fair rounding of an evidence number", () => {
    const checked = checkAnswer("The route is about 12.5 km [E4].", EVIDENCE);
    expect(checked.removed).toBe(0);
  });

  it("keeps interpretation without numbers, with no citation", () => {
    const checked = checkAnswer("This suggests a well-served residential area.", EVIDENCE);
    expect(checked.findings).toEqual([{ text: "This suggests a well-served residential area.", evidenceIds: [] }]);
  });

  it("keeps a citation written after the full stop with its sentence", () => {
    const checked = checkAnswer("It is 31 °C. [E3] There are 4 clinics. [E2]", EVIDENCE);
    expect(checked.findings).toEqual([
      { text: "It is 31 °C.", evidenceIds: ["E3"] },
      { text: "There are 4 clinics.", evidenceIds: ["E2"] },
    ]);
  });

  it("accepts several ids in one citation, and ignores ids that do not exist", () => {
    const checked = checkAnswer("Banjara Hills has 4 clinics within 1 km [E1, E2, E99].", EVIDENCE);
    expect(checked.findings[0]!.evidenceIds).toEqual(["E1", "E2"]);
  });

  it("does not count the digits inside a citation as numbers", () => {
    const checked = checkAnswer("The place is Banjara Hills [E1].", [...EVIDENCE.slice(0, 1)]);
    expect(checked.removed).toBe(0);
  });

  it("leaves nothing when every sentence invents a number, so the caller can say so", () => {
    const checked = checkAnswer("There are 9 schools [E2]. Rent is 25,000 a month.", EVIDENCE);
    expect(checked.findings).toEqual([]);
    expect(checked.removed).toBe(2);
    expect(INSUFFICIENT).toBe("Insufficient verified data to provide a reliable conclusion.");
  });
});

describe("confidence comes from which sources answered", () => {
  it("is high only when every source answered in full", () => {
    expect(confidenceFor("travel", [{ tool: "place", status: "ok" }, { tool: "weather", status: "ok" }, { tool: "nearby", status: "ok" }]).level).toBe("high");
  });

  it("is medium when an optional source failed", () => {
    const c = confidenceFor("travel", [{ tool: "place", status: "failed", problem: "The place name lookup did not answer." }, { tool: "weather", status: "ok" }, { tool: "nearby", status: "ok" }]);
    expect(c).toEqual({ level: "medium", reason: "The place name lookup did not answer." });
  });

  it("is medium when a required source was partial", () => {
    expect(confidenceFor("gis", [{ tool: "place", status: "ok" }, { tool: "gis", status: "partial", problem: "Overpass stopped part-way." }, { tool: "population", status: "ok" }]).level).toBe("medium");
  });

  it("is low when most required sources failed", () => {
    expect(confidenceFor("travel", [{ tool: "weather", status: "failed" }, { tool: "nearby", status: "partial" }]).level).toBe("low");
  });

  it("is insufficient when no required source answered", () => {
    const c = confidenceFor("navigation", [{ tool: "place", status: "ok" }, { tool: "route", status: "failed", problem: "No route is planned yet." }]);
    expect(c).toEqual({ level: "insufficient", reason: "No route is planned yet." });
  });
});

describe("what the model and the reader see", () => {
  it("writes one line per item with its id, source and time", () => {
    const table = evidenceTable(EVIDENCE.slice(1, 2));
    expect(table).toBe("E2 | Hospitals and clinics within 1 km | 4 (closest: Care Clinic, 350 m) | retrieved | OpenStreetMap via Overpass | as of 25 Nov 2026, 07:30 UTC");
  });

  it("gives no as-of time when there is none, rather than inventing one", () => {
    expect(asOfLabel(undefined)).toBeNull();
    expect(asOfLabel("not a date")).toBeNull();
    expect(evidenceTable(EVIDENCE.slice(5))).toBe("E6 | Weather now | Unavailable | unavailable | Open-Meteo | It did not answer within 8 seconds.");
  });

  it("lists only sources that actually supplied something", () => {
    expect(sourcesOf(EVIDENCE)).toEqual(["OpenStreetMap Nominatim", "OpenStreetMap via Overpass", "Open-Meteo", "OSRM", "Wikidata"]);
    expect(sourcesOf(EVIDENCE.slice(5))).toEqual([]);
  });
});
