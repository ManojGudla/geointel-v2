import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../../src/features/play/data/world";
import {
  HINT_COST,
  MAX_ROUND_SCORE,
  PERFECT_KM,
  ROUNDS,
  applyHintCost,
  buildRounds,
  formatKm,
  hintsFor,
  judge,
  poolFor,
  scoreForDistance,
  verdictFor,
} from "../../src/features/play/games/country/countryEngine";

/**
 * Country Hunt, and the hint system.
 *
 * Two things here are easy to get wrong in ways nobody would notice for a
 * while. The first is a hint that contradicts its own answer - worse than no
 * hint, because it actively misleads. Every hint is derived from the same
 * bundled data as the answer, and these tests hold that.
 *
 * The second is hints being free. A free hint makes every score identical and
 * turns the button into a "win" button, so the game stops meaning anything.
 * Hints cost a share of the round, and that cost is asserted below.
 */

const india = COUNTRIES.find((c) => c.code === "IN")!;
const japan = COUNTRIES.find((c) => c.code === "JP")!;

describe("scoring", () => {
  it("gives full marks for landing on the country", () => {
    expect(scoreForDistance(0, "normal")).toBe(MAX_ROUND_SCORE);
    expect(scoreForDistance(PERFECT_KM, "normal")).toBe(MAX_ROUND_SCORE);
  });

  it("falls away with distance and never goes negative", () => {
    const steps = [0, 200, 800, 2000, 6000, 15000];
    const scores = steps.map((d) => scoreForDistance(d, "normal"));
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    expect(scores.at(-1)).toBe(0);
    expect(scoreForDistance(-5, "normal")).toBe(0);
    expect(scoreForDistance(Number.NaN, "normal")).toBe(0);
  });

  it("is kinder on easy than on hard at the same distance", () => {
    // Someone who lands on the right continent should be rewarded at easy and
    // pushed to do better at hard. One curve for everyone did neither.
    const d = 1500;
    expect(scoreForDistance(d, "easy")).toBeGreaterThan(scoreForDistance(d, "normal"));
    expect(scoreForDistance(d, "normal")).toBeGreaterThan(scoreForDistance(d, "hard"));
  });

  it("measures against the real country position", () => {
    const spotOn = judge(india, { lat: india.lat, lon: india.lon }, "normal", []);
    expect(spotOn.distanceKm).toBeLessThan(1);
    expect(spotOn.score).toBe(MAX_ROUND_SCORE);

    const wrongContinent = judge(india, { lat: -33.9, lon: 18.4 }, "normal", []);
    expect(wrongContinent.distanceKm).toBeGreaterThan(7000);
    expect(wrongContinent.score).toBe(0);
  });
});

describe("hints cost what they say they cost", () => {
  it("takes the stated share off the round", () => {
    const { score, penalty } = applyHintCost(1000, ["region"]);
    expect(penalty).toBe(Math.round(1000 * HINT_COST.region));
    expect(score).toBe(1000 - penalty);
  });

  it("stacks when more than one is used", () => {
    const one = applyHintCost(1000, ["region"]).score;
    const two = applyHintCost(1000, ["region", "neighbours"]).score;
    const three = applyHintCost(1000, ["region", "neighbours", "narrow"]).score;
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });

  it("never drives a score below zero, even with every hint", () => {
    const { score } = applyHintCost(1000, ["region", "neighbours", "narrow", "narrow", "narrow"]);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("leaves an unhinted round untouched", () => {
    // The whole point: a player who takes no help keeps their full score, so
    // their result stays comparable with everyone else's.
    expect(applyHintCost(1000, [])).toEqual({ score: 1000, penalty: 0 });
  });

  it("reports the penalty on the result, so the cost is visible", () => {
    const result = judge(india, { lat: india.lat, lon: india.lon }, "normal", ["region"]);
    expect(result.hintPenalty).toBeGreaterThan(0);
    expect(result.score).toBe(MAX_ROUND_SCORE - result.hintPenalty);
  });
});

describe("the hints themselves", () => {
  const round = { country: japan, decoys: [] };
  const hints = hintsFor(round);

  it("offers three, ordered vaguest first", () => {
    expect(hints.map((h) => h.kind)).toEqual(["region", "neighbours", "narrow"]);
    expect(hints[0]!.cost).toBeLessThan(hints[1]!.cost);
    expect(hints[1]!.cost).toBeLessThan(hints[2]!.cost);
  });

  it("never contradicts the answer it is helping you find", () => {
    // A hint derived from different data than the answer is the one failure
    // that makes a hint system worse than having none.
    expect(hints[0]!.text).toContain(japan.region);
    expect(hints[2]!.text).toContain(japan.capital);
  });

  it("names genuinely nearby places, not random ones", () => {
    const nearHint = hintsFor({ country: india, decoys: [] })[1]!.text;
    // Whatever it names must actually be closer to India than a far country.
    const named = COUNTRIES.filter((c) => nearHint.includes(c.name) && c.code !== "IN");
    expect(named.length).toBeGreaterThan(0);
    for (const c of named) {
      expect(Math.abs(c.lat - india.lat) + Math.abs(c.lon - india.lon)).toBeLessThan(60);
    }
  });

  it("does not claim a land border it cannot know about", () => {
    // There is no boundary data bundled, so the wording has to stay honest
    // about being distance between capitals.
    for (const hint of hints) {
      expect(hint.text.toLowerCase()).not.toContain("borders");
    }
  });
});

describe("rounds", () => {
  it("builds the asked-for number with no country repeated", () => {
    const rounds = buildRounds(ROUNDS, "normal", "seed-1");
    expect(rounds).toHaveLength(ROUNDS);
    expect(new Set(rounds.map((r) => r.country.code)).size).toBe(ROUNDS);
  });

  it("is reproducible from its seed and different between seeds", () => {
    const a = buildRounds(ROUNDS, "normal", "same").map((r) => r.country.code);
    const b = buildRounds(ROUNDS, "normal", "same").map((r) => r.country.code);
    const c = buildRounds(ROUNDS, "normal", "other").map((r) => r.country.code);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("only asks about well-known countries on easy", () => {
    const easy = poolFor("easy");
    expect(easy.length).toBeGreaterThanOrEqual(15);
    expect(easy.length).toBeLessThan(COUNTRIES.length);
    expect(easy.map((c) => c.code)).toContain("IN");
  });

  it("gives every round three decoys that are not the answer", () => {
    for (const round of buildRounds(ROUNDS, "hard", "decoys")) {
      expect(round.decoys).toHaveLength(3);
      expect(round.decoys.map((d) => d.code)).not.toContain(round.country.code);
      expect(new Set(round.decoys.map((d) => d.code)).size).toBe(3);
    }
  });
});

describe("feedback in words, not just numbers", () => {
  it("describes how close you were", () => {
    expect(verdictFor(10)).toBe("Spot on.");
    expect(verdictFor(400)).toContain("Right country");
    expect(verdictFor(1200)).toContain("Right part of the world");
    expect(verdictFor(3000)).toContain("Right continent");
    expect(verdictFor(9000)).toContain("Wrong part");
  });

  it("formats distances readably", () => {
    expect(formatKm(42.4)).toBe("42 km");
    expect(formatKm(5231)).toBe("5,231 km");
  });
});
