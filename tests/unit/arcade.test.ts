import { describe, expect, it } from "vitest";
import { FACTS, factsByTruth } from "../../src/features/play/data/facts";
import {
  IMPOSTOR_STATEMENTS,
  buildImpostorGame,
  buildImpostorRound,
  buildRealOrFakeQueue,
  impostorPoints,
  realOrFakePoints,
} from "../../src/features/play/games/arcade/factGames";
import {
  buildCodeGame,
  buildCodePuzzle,
  buildPatternGame,
  buildPatternPuzzle,
  puzzlePoints,
} from "../../src/features/play/games/arcade/puzzles";

/**
 * The four arcade games.
 *
 * Two different classes of risk here, and both are the kind that only shows up
 * in front of a player.
 *
 * The fact games assert things about the world. A single wrong "fact" in a
 * product whose whole claim is that its answers are traceable does more damage
 * than the game is worth, so the bank is checked structurally: every claim has
 * a source, no duplicates, and enough of both truths and falsehoods to build a
 * round without repeating itself.
 *
 * The puzzle games generate their own content, so nothing can be factually
 * wrong - but a puzzle can be UNSOLVABLE, which is worse. The version of Crack
 * the Code that circulates online is genuinely broken: three lines that are
 * permutations of the same symbols with three different totals, which addition
 * makes impossible. These tests brute-force every generated system to prove it
 * has exactly one solution and that the answer given is that solution.
 */

describe("the claim bank", () => {
  it("sources every single claim", () => {
    // The rule that keeps this game consistent with the rest of the product.
    const unsourced = FACTS.filter((f) => !f.source || f.source.trim().length < 4);
    expect(unsourced.map((f) => f.id)).toEqual([]);
  });

  it("explains every claim rather than just marking it", () => {
    const thin = FACTS.filter((f) => !f.because || f.because.trim().length < 30);
    expect(thin.map((f) => f.id)).toEqual([]);
  });

  it("has no duplicate ids or duplicate claims", () => {
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length);
    expect(new Set(FACTS.map((f) => f.claim.toLowerCase())).size).toBe(FACTS.length);
  });

  it("has enough of both kinds to build rounds without repeating", () => {
    // A round needs one false and four true. Too few falsehoods and the same
    // impostor keeps reappearing, which players spot within two games.
    expect(factsByTruth(false).length).toBeGreaterThanOrEqual(10);
    expect(factsByTruth(true).length).toBeGreaterThanOrEqual(25);
  });

  it("writes claims as statements, not questions", () => {
    // "Is Antarctica a desert?" cannot be marked REAL or FAKE.
    const questions = FACTS.filter((f) => f.claim.trim().endsWith("?"));
    expect(questions.map((f) => f.id)).toEqual([]);
  });
});

describe("The Impostor", () => {
  it("always deals exactly one false statement among five", () => {
    // The whole game. Two false statements makes it unwinnable; none makes it
    // unanswerable.
    for (let i = 0; i < 60; i++) {
      const round = buildImpostorRound(`seed-${i}`, i);
      expect(round.statements).toHaveLength(IMPOSTOR_STATEMENTS);
      const falses = round.statements.filter((s) => !s.isTrue);
      expect(falses, `round ${i}`).toHaveLength(1);
      expect(falses[0]!.id).toBe(round.impostorId);
    }
  });

  it("never repeats a statement inside one round", () => {
    for (let i = 0; i < 40; i++) {
      const round = buildImpostorRound(`dupe-${i}`, i);
      expect(new Set(round.statements.map((s) => s.id)).size).toBe(IMPOSTOR_STATEMENTS);
    }
  });

  it("does not put the impostor in the same slot every time", () => {
    // A fixed position would be learnable in three rounds.
    const positions = new Set(
      Array.from({ length: 30 }, (_, i) => {
        const round = buildImpostorRound(`pos-${i}`, i);
        return round.statements.findIndex((s) => s.id === round.impostorId);
      })
    );
    expect(positions.size).toBeGreaterThanOrEqual(4);
  });

  it("never reuses the same impostor across one game", () => {
    const game = buildImpostorGame("game-seed");
    expect(game.length).toBeGreaterThan(0);
    expect(new Set(game.map((r) => r.impostorId)).size).toBe(game.length);
  });

  it("rewards speed but never punishes into the negative", () => {
    expect(impostorPoints(true, 1)).toBeGreaterThan(impostorPoints(true, 15));
    expect(impostorPoints(false, 1)).toBe(0);
    expect(impostorPoints(true, 999)).toBeGreaterThan(0);
  });
});

describe("Impossible or Real", () => {
  const queue = buildRealOrFakeQueue("rf");

  it("builds a long queue so a good run cannot exhaust it", () => {
    expect(queue.length).toBeGreaterThanOrEqual(30);
  });

  it("mixes true and false rather than dealing runs of one", () => {
    // If the answer is REAL five times running, the player learns to press
    // REAL and stops reading the claim, which is the whole game.
    const first20 = queue.slice(0, 20);
    const trues = first20.filter((f) => f.isTrue).length;
    expect(trues).toBeGreaterThan(3);
    expect(trues).toBeLessThan(17);

    let longestRun = 1;
    let run = 1;
    for (let i = 1; i < queue.length; i++) {
      run = queue[i]!.isTrue === queue[i - 1]!.isTrue ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    }
    expect(longestRun).toBeLessThanOrEqual(5);
  });

  it("pays more the longer the run goes", () => {
    expect(realOrFakePoints(0)).toBeLessThan(realOrFakePoints(5));
    expect(realOrFakePoints(5)).toBeLessThan(realOrFakePoints(20));
    expect(realOrFakePoints(-3)).toBeGreaterThan(0);
  });
});

describe("Crack the Code is actually solvable", () => {
  /** Brute-force every assignment of 1..18 to the three symbols. */
  function solutionsFor(equations: string[]): Array<Record<string, number>> {
    const symbols = [...new Set(equations.join(" ").match(/[▲●■★♦]/g) ?? [])];
    expect(symbols).toHaveLength(3);
    const parsed = equations.map((line) => {
      const [lhs, rhs] = line.split("=");
      const terms = (lhs!.match(/[▲●■★♦]/g) ?? []) as string[];
      return { terms, total: Number(rhs!.trim()) };
    });

    const found: Array<Record<string, number>> = [];
    for (let a = 1; a <= 18; a++) {
      for (let b = 1; b <= 18; b++) {
        for (let c = 1; c <= 18; c++) {
          const values: Record<string, number> = { [symbols[0]!]: a, [symbols[1]!]: b, [symbols[2]!]: c };
          if (parsed.every((eq) => eq.terms.reduce((sum, t) => sum + (values[t] ?? 0), 0) === eq.total)) {
            found.push(values);
          }
        }
      }
    }
    return found;
  }

  it("gives every puzzle exactly one solution", () => {
    // The failure this exists to catch: permutations of the same symbols with
    // different totals, which has NO solution. Puzzles like that circulate
    // widely and shipping one produces a stream of people who are right
    // telling you that you are wrong.
    for (let i = 0; i < 25; i++) {
      const puzzle = buildCodePuzzle("solve", i);
      const solutions = solutionsFor(puzzle.equations);
      expect(solutions.length, `puzzle ${i}: ${puzzle.equations.join(" | ")}`).toBe(1);
    }
  });

  it("marks the answer that the system actually produces", () => {
    for (let i = 0; i < 25; i++) {
      const puzzle = buildCodePuzzle("answer", i);
      const [solution] = solutionsFor(puzzle.equations);
      expect(solution![puzzle.target], puzzle.id).toBe(puzzle.answer);
    }
  });

  it("always offers the correct answer among the options", () => {
    for (const puzzle of buildCodeGame("options")) {
      expect(puzzle.options, puzzle.id).toContain(puzzle.answer);
      expect(new Set(puzzle.options).size, puzzle.id).toBe(puzzle.options.length);
      expect(puzzle.options.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Pattern Breaker", () => {
  it("shows enough terms for the rule to be findable", () => {
    // Three terms is a guess; four is a puzzle.
    for (const puzzle of buildPatternGame("terms", 20)) {
      expect(puzzle.terms.length, puzzle.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("always includes the right answer, with no duplicate options", () => {
    for (let i = 0; i < 40; i++) {
      const puzzle = buildPatternPuzzle("opts", i);
      expect(puzzle.options, puzzle.id).toContain(puzzle.answer);
      expect(new Set(puzzle.options).size, puzzle.id).toBe(puzzle.options.length);
    }
  });

  it("produces whole numbers, never a fraction on screen", () => {
    for (let i = 0; i < 40; i++) {
      const puzzle = buildPatternPuzzle("ints", i);
      for (const n of [...puzzle.terms, puzzle.answer, ...puzzle.options]) {
        expect(Number.isInteger(n), `${puzzle.id}: ${n}`).toBe(true);
      }
    }
  });

  it("explains the rule afterwards", () => {
    // Being told you are wrong without being told why is the reason people
    // abandon this kind of game.
    for (const puzzle of buildPatternGame("rules", 12)) {
      expect(puzzle.rule.length, puzzle.id).toBeGreaterThan(12);
    }
  });

  it("is reproducible from its seed", () => {
    expect(buildPatternGame("same").map((p) => p.answer)).toEqual(buildPatternGame("same").map((p) => p.answer));
    expect(buildPatternGame("a").map((p) => p.answer)).not.toEqual(buildPatternGame("b").map((p) => p.answer));
  });

  it("pays more for later puzzles and for speed", () => {
    expect(puzzlePoints(5, 2)).toBeGreaterThan(puzzlePoints(0, 2));
    expect(puzzlePoints(3, 1)).toBeGreaterThan(puzzlePoints(3, 14));
    expect(puzzlePoints(0, 999)).toBeGreaterThan(0);
  });
});
