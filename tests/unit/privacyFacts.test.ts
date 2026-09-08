import { describe, expect, it } from "vitest";
import { NOT_YET, SECTIONS } from "@/features/privacy/privacyFacts";

/**
 * These tests exist to keep the privacy page honest. A trust page that drifts
 * out of step with the code is worse than none, so the shape of it is
 * enforced: every claim cites where it comes from, and the "not yet" section
 * can never be quietly emptied to make the page look better.
 */
describe("privacy page", () => {
  it("has a section for what is NOT yet true", () => {
    const gaps = SECTIONS.find((s) => s.id === "notyet");
    expect(gaps).toBeDefined();
    expect(gaps!.facts.length).toBeGreaterThan(0);
    expect(NOT_YET.length).toBeGreaterThan(0);
  });

  it("cites a source for every single claim", () => {
    for (const section of SECTIONS) {
      for (const fact of section.facts) {
        expect(fact.where.trim().length).toBeGreaterThan(0);
        expect(fact.claim.trim().length).toBeGreaterThan(0);
        expect(fact.detail.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("does not make absolute security promises", () => {
    // "100% secure", "completely safe" and friends are the phrases that turn
    // an honest page into marketing. No claim may contain one.
    const forbidden = ["100%", "completely secure", "totally secure", "unhackable", "military-grade", "absolutely safe"];
    const all = SECTIONS.flatMap((s) => s.facts)
      .flatMap((f) => [f.claim, f.detail])
      .join(" ")
      .toLowerCase();
    for (const phrase of forbidden) expect(all).not.toContain(phrase);
  });

  it("has no duplicate claims across sections", () => {
    const claims = SECTIONS.flatMap((s) => s.facts).map((f) => f.claim);
    expect(new Set(claims).size).toBe(claims.length);
  });

  it("gives every section an intro and at least one fact", () => {
    for (const section of SECTIONS) {
      expect(section.intro.trim().length).toBeGreaterThan(0);
      expect(section.facts.length).toBeGreaterThan(0);
      expect(section.title.trim().length).toBeGreaterThan(0);
    }
  });
});
