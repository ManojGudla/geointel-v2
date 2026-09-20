import { describe, expect, it } from "vitest";
import { describeCommand, parseDistanceMeters, parseMapCommand } from "@/features/ai/mapCommands";

describe("parseDistanceMeters", () => {
  it("reads kilometres and metres", () => {
    expect(parseDistanceMeters("within 5 km")).toBe(5000);
    expect(parseDistanceMeters("within 5km")).toBe(5000);
    expect(parseDistanceMeters("800 m")).toBe(800);
    expect(parseDistanceMeters("1.5 kilometres")).toBe(1500);
  });

  it("converts miles", () => {
    expect(parseDistanceMeters("2 miles")).toBe(3219);
  });

  it("returns null when no distance is given, rather than guessing one", () => {
    expect(parseDistanceMeters("nearest hospital")).toBeNull();
  });

  it("rejects a zero or negative distance", () => {
    expect(parseDistanceMeters("0 km")).toBeNull();
  });
});

describe("parseMapCommand", () => {
  it("handles the canonical 'X within N km' shape", () => {
    expect(parseMapCommand("show me all hospitals within 10 km")).toEqual({
      operation: "within",
      category: "hospitals",
      radiusMeters: 10000,
    });
  });

  it("understands a category with no distance, using a sensible default", () => {
    expect(parseMapCommand("find schools")).toEqual({ operation: "within", category: "schools", radiusMeters: 2000 });
  });

  it("recognises nearest/closest", () => {
    expect(parseMapCommand("what's the nearest hospital")).toEqual({ operation: "nearest", category: "hospitals" });
    expect(parseMapCommand("closest petrol pump")).toEqual({ operation: "nearest", category: "petrol" });
  });

  /**
   * Ordering matters in the category table: "public transport" contains
   * "transport", and "petrol station" contains "station". A shorter pattern
   * matching first would silently classify these wrongly - the results would
   * still render, just for the wrong thing, which is the hardest kind of
   * error to notice in a demo.
   */
  it("prefers the longer category phrase when one contains another", () => {
    expect(parseMapCommand("public transport within 1 km")).toMatchObject({ category: "publicTransport" });
    expect(parseMapCommand("nearest metro station")).toMatchObject({ category: "publicTransport" });
    expect(parseMapCommand("nearest petrol station")).toMatchObject({ category: "petrol" });
  });

  it("maps everyday synonyms onto real categories", () => {
    expect(parseMapCommand("chemists nearby")).toMatchObject({ category: "pharmacies" });
    expect(parseMapCommand("places to eat within 500 m")).toMatchObject({ category: "restaurants" });
    expect(parseMapCommand("supermarkets within 3 km")).toMatchObject({ category: "shopping" });
    expect(parseMapCommand("nearest cash machine")).toMatchObject({ category: "atms" });
  });

  /**
   * "Is this a good place for a hospital" names a category AND asks an
   * assessment question. Read as a search it returns a list of hospitals -
   * a plausible-looking answer to a question nobody asked.
   */
  it("reads an assessment question as suitability, not as a search for that category", () => {
    expect(parseMapCommand("is this a good place for a hospital")).toEqual({
      operation: "suitability",
      presetId: "hospital",
      radiusMeters: 2000,
    });
    expect(parseMapCommand("score this site for a warehouse within 5 km")).toEqual({
      operation: "suitability",
      presetId: "warehouse",
      radiusMeters: 5000,
    });
    expect(parseMapCommand("suitability for a school")).toMatchObject({ operation: "suitability", presetId: "school" });
  });

  it("falls back to a plain buffer when a distance is given with no category", () => {
    expect(parseMapCommand("draw a 5 km buffer")).toEqual({ operation: "buffer", radiusMeters: 5000 });
    expect(parseMapCommand("what is within 800 m")).toEqual({ operation: "buffer", radiusMeters: 800 });
  });

  /**
   * Returning null is the whole point of the fallback path: an unparsed
   * question goes to the language model rather than being forced into the
   * nearest-looking operation.
   */
  it("returns null for anything it cannot confidently interpret", () => {
    expect(parseMapCommand("what is the history of this neighbourhood")).toBeNull();
    expect(parseMapCommand("")).toBeNull();
    expect(parseMapCommand("hello")).toBeNull();
  });
});

describe("describeCommand", () => {
  const categoryLabel = () => "Hospitals & clinics";
  const presetLabel = () => "Hospital or clinic";

  it("echoes back what it understood, so a misread is visible before results appear", () => {
    expect(describeCommand({ operation: "within", category: "hospitals", radiusMeters: 5000 }, categoryLabel, presetLabel)).toBe(
      "Finding hospitals & clinics within 5 km"
    );
    expect(describeCommand({ operation: "buffer", radiusMeters: 800 }, categoryLabel, presetLabel)).toBe(
      "Drawing a 800 m buffer and counting what's inside"
    );
    expect(describeCommand({ operation: "suitability", presetId: "hospital", radiusMeters: 2000 }, categoryLabel, presetLabel)).toBe(
      "Scoring this site for a hospital or clinic within 2 km"
    );
  });

  it("renders a fractional kilometre distance without dropping the decimal", () => {
    expect(describeCommand({ operation: "buffer", radiusMeters: 1500 }, categoryLabel, presetLabel)).toContain("1.5 km");
  });
});
