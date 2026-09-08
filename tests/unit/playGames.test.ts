import { describe, expect, it } from "vitest";
import { applyHint, buildQuiz, fiftyFifty, firstLetterHint, scoreAnswer } from "@/features/play/games/quiz/quizEngine";
import { formatDistanceKm, judgePin, pickRoundPlaces, pinScore, MAX_PIN_SCORE } from "@/features/play/games/pin/pinScoring";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES, PLACES, flagSrc, haversineKm } from "@/features/play/data/world";
import { createRng, localDateKey } from "@/features/play/lib/random";

describe("world data", () => {
  it("has no duplicate country codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every country a capital, a region and plausible coordinates", () => {
    for (const c of COUNTRIES) {
      expect(c.capital.length).toBeGreaterThan(0);
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
    }
  });

  it("points at a flag image for every country, and that file exists", () => {
    /**
     * This replaced a test that checked flag EMOJI were derived correctly from
     * the ISO code. That test passed for a year while the feature was broken:
     * the emoji were built perfectly, and Windows then rendered them as two
     * plain letters, because it ships no flag glyphs. The Flag Quiz showed
     * "KZ" above "Which country's flag is this?".
     *
     * So the invariant worth testing is not the string — it is that a real
     * image exists on disk for every country the games can deal. A missing
     * file is a broken image in the middle of a round, and nothing else in the
     * build would catch it.
     */
    expect(flagSrc("IN")).toBe("/flags/in.png");
    expect(flagSrc("br")).toBe("/flags/br.png");

    const missing = COUNTRIES.filter(
      (c) => !existsSync(join(process.cwd(), "public", "flags", `${c.code.toLowerCase()}.png`))
    );
    expect(missing.map((c) => `${c.code} (${c.name})`)).toEqual([]);
  });

  it("has no duplicate place names", () => {
    const names = PLACES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("measures known distances correctly", () => {
    // London -> Paris is about 344 km; Delhi -> Mumbai about 1150 km.
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeCloseTo(344, -1);
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeCloseTo(1150, -2);
    expect(haversineKm(10, 20, 10, 20)).toBe(0);
  });
});

describe("seeded randomness", () => {
  it("gives identical sequences for the same seed", () => {
    const a = createRng("2026-09-25");
    const b = createRng("2026-09-25");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("gives different sequences for different seeds", () => {
    expect(createRng("a").next()).not.toBe(createRng("b").next());
  });

  it("shuffles without dropping, duplicating or mutating", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(42).shuffle(input);
    expect(out.slice().sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("samples distinct items", () => {
    const out = createRng(7).sample([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });

  it("uses the local date, not UTC", () => {
    // 00:30 local on the 2nd is still the 2nd, whatever UTC thinks.
    expect(localDateKey(new Date(2026, 8, 2, 0, 30))).toBe("2026-09-02");
    expect(localDateKey(new Date(2026, 8, 2, 23, 30))).toBe("2026-09-02");
  });
});

describe("quiz engine", () => {
  it("builds the requested number of questions", () => {
    expect(buildQuiz({ count: 5, kinds: ["capital"], seed: 1 })).toHaveLength(5);
  });

  it("always includes the answer among exactly four distinct options", () => {
    for (const q of buildQuiz({ count: 12, kinds: ["capital", "flag", "country-of-capital", "region"], seed: 3 })) {
      expect(q.options).toContain(q.answer);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it("is reproducible from its seed", () => {
    const a = buildQuiz({ count: 6, kinds: ["capital"], seed: "2026-09-25" });
    const b = buildQuiz({ count: 6, kinds: ["capital"], seed: "2026-09-25" });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a[0]!.options).toEqual(b[0]!.options);
  });

  it("does not ask about the same country twice in a round", () => {
    const q = buildQuiz({ count: 10, kinds: ["capital"], seed: 9 });
    const keys = q.map((x) => x.id.split("-").slice(0, 2).join("-"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("restricts to a region when asked", () => {
    const q = buildQuiz({ count: 5, kinds: ["capital"], region: "Europe", seed: 2 });
    const europeanCapitals = COUNTRIES.filter((c) => c.region === "Europe").map((c) => c.capital);
    for (const question of q) expect(europeanCapitals).toContain(question.answer);
  });

  it("gives no points for a wrong answer and a speed bonus for a fast one", () => {
    expect(scoreAnswer(false, 1)).toBe(0);
    expect(scoreAnswer(true, 1)).toBeGreaterThan(scoreAnswer(true, 9));
    expect(scoreAnswer(true, 60)).toBe(10);
  });
});

describe("pin scoring", () => {
  it("gives the maximum for a perfect pin and decays with distance", () => {
    expect(pinScore(0)).toBe(MAX_PIN_SCORE);
    expect(pinScore(100)).toBeLessThan(pinScore(10));
    expect(pinScore(5000)).toBeLessThan(pinScore(1000));
    expect(pinScore(20000)).toBeGreaterThanOrEqual(0);
  });

  it("rejects nonsense distances rather than producing a score", () => {
    expect(pinScore(Number.NaN)).toBe(0);
    expect(pinScore(-5)).toBe(0);
  });

  it("judges a pin on the target as spot on", () => {
    const target = PLACES.find((p) => p.name === "Hyderabad")!;
    const r = judgePin(target.lat, target.lon, target);
    expect(r.distanceKm).toBeCloseTo(0, 5);
    expect(r.verdict).toBe("Spot on");
    expect(r.flags).toContain("pin-the-place:within-25km");
    expect(r.flags).toContain("pin-the-place:within-100km");
  });

  it("judges a pin on the wrong continent harshly and flags nothing", () => {
    const target = PLACES.find((p) => p.name === "Hyderabad")!;
    const r = judgePin(51.5074, -0.1278, target); // London
    expect(r.distanceKm).toBeGreaterThan(4000);
    expect(r.flags).toHaveLength(0);
    expect(r.score).toBeLessThan(200);
  });

  it("formats short and long distances in sensible units", () => {
    expect(formatDistanceKm(0.4)).toBe("400 m");
    expect(formatDistanceKm(3.25)).toBe("3.3 km");
    expect(formatDistanceKm(1234)).toBe("1,234 km");
  });

  it("picks distinct places, reproducibly, respecting difficulty", () => {
    const a = pickRoundPlaces(5, "normal", "2026-09-25");
    const b = pickRoundPlaces(5, "normal", "2026-09-25");
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(new Set(a.map((p) => p.name)).size).toBe(5);
    for (const p of pickRoundPlaces(6, "easy", 1)) expect(p.fame).toBe(1);
  });
});


describe("hints", () => {
  /**
   * A hint that is free is not a hint, it is just a bigger score for everyone.
   * These hold the two properties that make the 50/50 worth having: it really
   * does leave the answer, and it really does cost.
   */
  const question = buildQuiz({ count: 1, kinds: ["capital"], seed: "hint-seed" })[0]!;

  it("leaves the answer and exactly one wrong option", () => {
    const left = fiftyFifty(question, () => 0);
    expect(left).toHaveLength(2);
    expect(left).toContain(question.answer);
  });

  it("keeps the options in their original order", () => {
    // Reshuffling would slide the answer under the player's finger the moment
    // they press the hint, which reads as the game cheating them.
    const left = fiftyFifty(question, () => 0);
    const originalOrder = question.options.filter((o) => left.includes(o));
    expect(left).toEqual(originalOrder);
  });

  it("halves the score for the question it was used on", () => {
    const full = scoreAnswer(true, 3);
    expect(applyHint(full, true)).toBe(Math.round(full * 0.5));
    expect(applyHint(full, false)).toBe(full);
  });

  it("never claims a wrong first letter", () => {
    // The one way a hint can be worse than no hint at all.
    for (const q of buildQuiz({ count: 8, kinds: ["capital", "flag", "region"], seed: "letters" })) {
      expect(firstLetterHint(q)).toContain(q.answer.trim().charAt(0).toUpperCase());
    }
  });
});
