import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  CORRECT_BONUS_SECONDS,
  MAX_MULTIPLIER,
  ROUND_SECONDS,
  WRONG_PENALTY_SECONDS,
  accuracy,
  applyAnswer,
  buildQueue,
  formatClock,
  initialState,
  multiplierFor,
  pointsFor,
  shareText,
} from "../../src/features/play/games/sixty/sixtyEngine";
import { COUNTRIES, haversineKm } from "../../src/features/play/data/world";

/**
 * 60 Seconds.
 *
 * The engine is pure on purpose. Ultimate Tic-Tac-Toe in this project froze
 * because its game logic lived inside a React effect: every engine test
 * passed and the game was unplayable. So the rules here - scoring, the
 * streak, the clock penalty - are all functions that can be checked exactly,
 * and the component only calls them.
 *
 * Two properties matter more than the rest:
 *
 *   The multiplier shown on screen must be what the next correct answer is
 *   actually worth. If the displayed figure and the awarded figure disagree,
 *   the game reads as dishonest, which is worse than it reading as hard.
 *
 *   Every generated question must have exactly one defensible answer. A timed
 *   game that punishes you four seconds for losing a coin toss is the fastest
 *   way to make someone stop playing, so the comparison generators enforce a
 *   minimum gap and these tests check it holds across a large sample.
 */

describe("the streak multiplier", () => {
  it("starts at one, so the first answer is worth the base score", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(pointsFor(0)).toBe(BASE_POINTS);
  });

  it("builds with each consecutive correct answer", () => {
    expect(multiplierFor(1)).toBeCloseTo(1.15, 5);
    expect(multiplierFor(4)).toBeCloseTo(1.6, 5);
    expect(multiplierFor(1)).toBeGreaterThan(multiplierFor(0));
    expect(multiplierFor(9)).toBeGreaterThan(multiplierFor(4));
  });

  it("stops at a cap, so a long run cannot run away with the scoreboard", () => {
    expect(multiplierFor(100)).toBe(MAX_MULTIPLIER);
    expect(multiplierFor(1000)).toBe(MAX_MULTIPLIER);
  });

  it("never returns something absurd for nonsense input", () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = multiplierFor(bad);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(MAX_MULTIPLIER);
    }
  });

  it("awards exactly what the screen promised", () => {
    // The property the whole scoring display rests on: the figure rendered
    // before the answer is the figure added after it.
    let s = initialState();
    for (let i = 0; i < 8; i++) {
      const promised = pointsFor(s.streak);
      const before = s.score;
      s = applyAnswer(s, true);
      expect(s.score - before).toBe(promised);
    }
  });
});

describe("answering", () => {
  it("counts a correct answer and extends the streak", () => {
    const s = applyAnswer(initialState(), true);
    expect(s.correct).toBe(1);
    expect(s.answered).toBe(1);
    expect(s.streak).toBe(1);
    expect(s.longestStreak).toBe(1);
    expect(s.score).toBe(BASE_POINTS);
  });

  it("resets the streak on a wrong answer but keeps the score earned", () => {
    let s = initialState();
    s = applyAnswer(s, true);
    s = applyAnswer(s, true);
    const earned = s.score;
    s = applyAnswer(s, false);
    expect(s.streak).toBe(0);
    expect(s.score).toBe(earned);
    expect(s.answered).toBe(3);
    expect(s.correct).toBe(2);
  });

  it("remembers the best streak after it is broken", () => {
    // Shown on the result screen, so it has to survive the reset.
    let s = initialState();
    for (let i = 0; i < 6; i++) s = applyAnswer(s, true);
    s = applyAnswer(s, false);
    expect(s.streak).toBe(0);
    expect(s.longestStreak).toBe(6);
  });

  it("takes time away for a wrong answer", () => {
    const s = applyAnswer(initialState(), false);
    expect(s.remainingMs).toBe((ROUND_SECONDS - WRONG_PENALTY_SECONDS) * 1000);
  });

  it("never takes the clock below zero", () => {
    // Otherwise a mistake in the last second leaves a negative clock on
    // screen and a progress bar with a negative width.
    let s = { ...initialState(), remainingMs: 1000 };
    s = applyAnswer(s, false);
    expect(s.remainingMs).toBe(0);
    s = applyAnswer(s, false);
    expect(s.remainingMs).toBe(0);
  });

  it("gives a second back for a correct answer, but never above the starting clock", () => {
    // The cap is what stops a fast player extending the round indefinitely
    // and turning a one-minute game into an endurance test.
    const mid = applyAnswer({ ...initialState(), remainingMs: 30_000 }, true);
    expect(mid.remainingMs).toBe(30_000 + CORRECT_BONUS_SECONDS * 1000);

    const full = applyAnswer(initialState(), true);
    expect(full.remainingMs).toBe(ROUND_SECONDS * 1000);
  });

  it("reports accuracy honestly, including before anything is answered", () => {
    expect(accuracy(initialState())).toBe(0);
    let s = initialState();
    s = applyAnswer(s, true);
    s = applyAnswer(s, false);
    expect(accuracy(s)).toBe(50);
  });
});

describe("the question queue", () => {
  const queue = buildQueue("test-seed");

  it("is long enough that nobody can reach the end in a minute", () => {
    // A player answering every 1.5 seconds gets through roughly 40. Running
    // out mid-round would only ever happen to the best player.
    expect(queue.length).toBeGreaterThanOrEqual(60);
  });

  it("gives every question a real prompt, options and an answer among them", () => {
    const broken = queue.filter(
      (q) => !q.prompt || q.options.length < 2 || !q.options.includes(q.answer)
    );
    expect(broken.map((q) => q.id)).toEqual([]);
  });

  it("never offers the same option twice in one question", () => {
    // Two identical buttons means one of them is a correct answer that scores
    // as wrong depending on which the player happens to hit.
    const dupes = queue.filter((q) => new Set(q.options).size !== q.options.length);
    expect(dupes.map((q) => q.id)).toEqual([]);
  });

  it("keeps changing the kind of question", () => {
    // The entire premise. If the queue settles into one type the game becomes
    // the quiz that already exists, with a timer bolted on.
    const first20 = queue.slice(0, 20);
    const shapes = new Set(first20.map((q) => `${q.options.length}:${q.prompt.slice(0, 12)}`));
    expect(shapes.size).toBeGreaterThanOrEqual(5);

    // And no long run of identical prompts.
    let longestRun = 1;
    let run = 1;
    for (let i = 1; i < queue.length; i++) {
      const same = queue[i]!.prompt.slice(0, 12) === queue[i - 1]!.prompt.slice(0, 12);
      run = same ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    }
    expect(longestRun).toBeLessThanOrEqual(3);
  });

  it("includes the fast two-option comparisons", () => {
    const two = queue.filter((q) => q.options.length === 2);
    expect(two.length).toBeGreaterThan(10);
  });

  it("is reproducible from its seed and different between seeds", () => {
    expect(buildQueue("abc").map((q) => q.id)).toEqual(buildQueue("abc").map((q) => q.id));
    expect(buildQueue("abc").map((q) => q.id)).not.toEqual(buildQueue("xyz").map((q) => q.id));
  });
});

describe("comparison questions are decidable, not coin tosses", () => {
  // Sampled across many seeds, because the failure this guards against is
  // rare by nature: one pair in fifty that happens to be nearly identical.
  const all = Array.from({ length: 25 }, (_, i) => buildQueue(`fair-${i}`)).flat();
  const byCapital = new Map(COUNTRIES.map((c) => [c.capital, c]));

  it("makes 'further north' a real difference every time", () => {
    const north = all.filter((q) => q.prompt.startsWith("Which capital is further north"));
    expect(north.length).toBeGreaterThan(20);

    const tooClose = north.filter((q) => {
      const [a, b] = q.options.map((o) => byCapital.get(o));
      if (!a || !b) return true;
      return Math.abs(a.lat - b.lat) < 5;
    });
    expect(tooClose.map((q) => q.id)).toEqual([]);
  });

  it("marks the genuinely northern capital as the answer", () => {
    for (const q of all.filter((x) => x.prompt.startsWith("Which capital is further north"))) {
      const [a, b] = q.options.map((o) => byCapital.get(o)!);
      const trueAnswer = a.lat > b.lat ? a.capital : b.capital;
      expect(q.answer, q.id).toBe(trueAnswer);
    }
  });

  it("makes 'closer to' a clear gap, and marks the genuinely closer one", () => {
    const closer = all.filter((q) => q.prompt.startsWith("Which is closer to"));
    expect(closer.length).toBeGreaterThan(20);

    for (const q of closer) {
      const anchorName = q.prompt.replace("Which is closer to ", "").replace("?", "");
      const anchor = byCapital.get(anchorName);
      const [a, b] = q.options.map((o) => byCapital.get(o));
      if (!anchor || !a || !b) throw new Error(`unresolvable comparison: ${q.id}`);

      const da = haversineKm(anchor.lat, anchor.lon, a.lat, a.lon);
      const db = haversineKm(anchor.lat, anchor.lon, b.lat, b.lon);
      const nearer = da < db ? a.capital : b.capital;
      expect(q.answer, q.id).toBe(nearer);
      // And the gap is wide enough to be readable without a calculator.
      expect(Math.max(da, db) / Math.min(da, db), q.id).toBeGreaterThan(1.3);
    }
  });
});

describe("presentation helpers", () => {
  it("keeps the clock the same width all the way down", () => {
    // A clock that changes width shifts the score sitting next to it on every
    // single tick.
    expect(formatClock(60_000)).toBe("0:60");
    expect(formatClock(9_400)).toBe("0:10");
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-500)).toBe("0:00");
    const widths = new Set([formatClock(60_000).length, formatClock(5_000).length, formatClock(0).length]);
    expect(widths.size).toBe(1);
  });

  it("shares the score without leaking the questions", () => {
    let s = initialState();
    for (let i = 0; i < 5; i++) s = applyAnswer(s, true);
    const text = shareText(s, 0);
    expect(text).toContain("60 Seconds");
    expect(text).toContain("manowj.com");
    expect(text).toContain("5 best streak");
    // The whole point of a shareable score is that it does not spoil the game
    // for whoever reads it.
    for (const country of COUNTRIES.slice(0, 40)) {
      expect(text).not.toContain(country.capital);
    }
  });

  it("only claims a personal best when it is one", () => {
    let s = initialState();
    s = applyAnswer(s, true);
    expect(shareText(s, 999_999)).not.toContain("personal best");
    expect(shareText(s, 0)).toContain("personal best");
    // And never on a scoreless round.
    expect(shareText(initialState(), 0)).not.toContain("personal best");
  });
});
