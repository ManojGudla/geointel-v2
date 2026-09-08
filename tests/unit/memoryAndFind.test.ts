import { describe, expect, it } from "vitest";
import {
  GRID_COLUMNS,
  applyPeek,
  buildDeck,
  flipCard,
  hideUnmatched,
  isComplete,
  memoryScore,
  peekAll,
  type GridSize,
} from "@/features/play/games/memory/memoryEngine";
import { buildLevel, scoreFind, timeForLevel } from "@/features/play/games/findit/findItEngine";

const SIZES: GridSize[] = [12, 16, 20];

describe("geo memory deck", () => {
  it("builds exactly two of every card and nothing else", () => {
    for (const size of SIZES) {
      const deck = buildDeck(size, "seed");
      expect(deck).toHaveLength(size);
      const counts = new Map<string, number>();
      for (const c of deck) counts.set(c.pairId, (counts.get(c.pairId) ?? 0) + 1);
      expect(counts.size).toBe(size / 2);
      for (const n of counts.values()) expect(n).toBe(2);
    }
  });

  it("starts every card face down", () => {
    for (const c of buildDeck(16, "seed")) {
      expect(c.flipped).toBe(false);
      expect(c.matched).toBe(false);
    }
  });

  it("indexes cards by their board position", () => {
    buildDeck(20, "seed").forEach((c, i) => expect(c.id).toBe(i));
  });

  it("lays out in a sensible number of columns", () => {
    for (const size of SIZES) {
      expect(size % GRID_COLUMNS[size]).toBe(0);
    }
  });

  it("gives a different layout for a different seed", () => {
    const a = buildDeck(16, "a").map((c) => c.pairId).join();
    const b = buildDeck(16, "b").map((c) => c.pairId).join();
    expect(a).not.toBe(b);
  });
});

describe("geo memory play", () => {
  const deck = () => buildDeck(12, "fixed");
  /** The two indices holding the same flag. */
  const pairIndices = (cards: ReturnType<typeof deck>) => {
    const first = cards[0]!;
    const other = cards.findIndex((c, i) => i !== 0 && c.pairId === first.pairId);
    return [0, other] as const;
  };

  it("turns one card face up", () => {
    const cards = deck();
    const r = flipCard(cards, 3);
    expect(r.cards[3]!.flipped).toBe(true);
    expect(r.movesDelta).toBe(0); // a move is a completed attempt, not a tap
  });

  it("counts a move only when the second card is turned", () => {
    const cards = deck();
    const one = flipCard(cards, 0);
    expect(one.movesDelta).toBe(0);
    const [, other] = pairIndices(cards);
    const two = flipCard(one.cards, other === 1 ? 2 : 1);
    expect(two.movesDelta).toBe(1);
  });

  it("keeps a genuine pair face up", () => {
    const cards = deck();
    const [a, b] = pairIndices(cards);
    const r = flipCard(flipCard(cards, a).cards, b);
    expect(r.matched).toBe(true);
    expect(r.mismatch).toBe(false);
    expect(r.cards[a]!.matched).toBe(true);
    expect(r.cards[b]!.matched).toBe(true);
  });

  it("reports a mismatch and hides both again", () => {
    const cards = deck();
    const [a, b] = pairIndices(cards);
    const wrong = cards.findIndex((c, i) => i !== a && i !== b);
    const r = flipCard(flipCard(cards, a).cards, wrong);
    expect(r.mismatch).toBe(true);
    const hidden = hideUnmatched(r.cards);
    expect(hidden.filter((c) => c.flipped)).toHaveLength(0);
  });

  it("refuses a third card while two are face up", () => {
    // Without this, rapid clicking flips the whole board and the game is over.
    const cards = deck();
    const [a, b] = pairIndices(cards);
    const wrong = cards.findIndex((c, i) => i !== a && i !== b);
    const two = flipCard(flipCard(cards, a).cards, wrong);
    const third = flipCard(two.cards, cards.findIndex((c, i) => i !== a && i !== b && i !== wrong));
    expect(third.cards).toBe(two.cards); // same reference — nothing happened
    expect(third.movesDelta).toBe(0);
  });

  it("refuses to re-flip a card that is already up or matched", () => {
    const cards = deck();
    const one = flipCard(cards, 4);
    expect(flipCard(one.cards, 4).cards).toBe(one.cards);
  });

  it("ignores an id that isn't on the board", () => {
    const cards = deck();
    expect(flipCard(cards, 999).cards).toBe(cards);
    expect(flipCard(cards, -1).cards).toBe(cards);
  });

  it("never mutates the board it is given", () => {
    const cards = deck();
    const before = JSON.stringify(cards);
    flipCard(cards, 2);
    expect(JSON.stringify(cards)).toBe(before);
  });

  it("is complete only when every card is matched", () => {
    const cards = deck();
    expect(isComplete(cards)).toBe(false);
    expect(isComplete(cards.map((c) => ({ ...c, matched: true })))).toBe(true);
    expect(isComplete([])).toBe(false);
  });
});

describe("geo memory scoring", () => {
  it("rewards a perfect game over a wasteful one", () => {
    expect(memoryScore(16, 8, 40)).toBeGreaterThan(memoryScore(16, 20, 40));
  });

  it("rewards being quick", () => {
    expect(memoryScore(16, 10, 30)).toBeGreaterThan(memoryScore(16, 10, 120));
  });

  it("scores a bigger board higher for the same play", () => {
    expect(memoryScore(20, 10, 40)).toBeGreaterThan(memoryScore(12, 10, 40));
  });

  it("never drops to zero, however badly it went", () => {
    expect(memoryScore(12, 500, 3000)).toBeGreaterThan(0);
  });
});

describe("find it levels", () => {
  it("puts exactly one target on the board", () => {
    for (let level = 1; level <= 14; level++) {
      const l = buildLevel(level, "seed");
      expect(l.cells.filter((c) => c === l.target)).toHaveLength(1);
      expect(l.cells[l.targetIndex]).toBe(l.target);
    }
  });

  it("grows the board as levels go up", () => {
    expect(buildLevel(1, "s").cells.length).toBeLessThan(buildLevel(6, "s").cells.length);
    expect(buildLevel(6, "s").cells.length).toBeLessThan(buildLevel(12, "s").cells.length);
  });

  it("lays out in whole rows", () => {
    for (let level = 1; level <= 14; level++) {
      const l = buildLevel(level, "s");
      expect(l.cells.length % l.columns).toBe(0);
    }
  });

  it("gives less time as levels go up, but never an impossible amount", () => {
    expect(timeForLevel(1)).toBeGreaterThan(timeForLevel(5));
    expect(timeForLevel(5)).toBeGreaterThan(timeForLevel(9));
    for (let level = 1; level <= 60; level++) {
      expect(timeForLevel(level)).toBeGreaterThanOrEqual(2600);
    }
  });

  it("uses only same-family decoys once it gets hard", () => {
    // From level 5 every decoy must be a genuine look-alike, or the later
    // levels are no harder to scan than the early ones.
    const l = buildLevel(9, "seed");
    const distinct = new Set(l.cells);
    expect(distinct.size).toBeLessThanOrEqual(6);
    expect(distinct.has(l.target)).toBe(true);
  });

  it("is reproducible from its seed", () => {
    expect(buildLevel(4, "abc").cells).toEqual(buildLevel(4, "abc").cells);
    expect(buildLevel(4, "abc").targetIndex).toBe(buildLevel(4, "abc").targetIndex);
  });
});

describe("find it scoring", () => {
  it("pays more for being fast", () => {
    expect(scoreFind(3, 500, 6000)).toBeGreaterThan(scoreFind(3, 5500, 6000));
  });

  it("pays more at higher levels", () => {
    expect(scoreFind(10, 1000, 4000)).toBeGreaterThan(scoreFind(2, 1000, 4000));
  });

  it("still pays something for a slow correct find", () => {
    expect(scoreFind(1, 6999, 7000)).toBeGreaterThan(0);
  });
});

describe("achievement honesty", () => {
  it("only unlocks Total Recall from a real memory board, not a perfect quiz", async () => {
    const { applyRound } = await import("@/features/play/progress/applyRound");
    const base = {
      xp: 0, games: {}, flags: {}, unlocked: [], currentStreak: 0, longestStreak: 0,
      lastPlayedDate: null, dailyCompleted: 0, lastDailyDate: null, knownGameCount: 10,
    };

    // A perfect QUIZ must not unlock the memory achievement.
    const quiz = applyRound(base, { gameId: "world-quiz", score: 100, outcome: "complete", perfect: true }, "2026-09-01");
    expect(quiz.stats.unlocked).toContain("quiz-perfect");
    expect(quiz.stats.unlocked).not.toContain("memory-perfect");

    // A perfect MEMORY board must.
    const memory = applyRound(
      base,
      { gameId: "geo-memory", score: 900, outcome: "complete", perfect: true, flags: ["geo-memory:perfect"] },
      "2026-09-01"
    );
    expect(memory.stats.unlocked).toContain("memory-perfect");
  });

  it("only unlocks Sharp Eyes from actually reaching level 10", async () => {
    const { applyRound } = await import("@/features/play/progress/applyRound");
    const base = {
      xp: 0, games: {}, flags: {}, unlocked: [], currentStreak: 0, longestStreak: 0,
      lastPlayedDate: null, dailyCompleted: 0, lastDailyDate: null, knownGameCount: 10,
    };
    const short = applyRound(base, { gameId: "find-it", score: 400, outcome: "complete" }, "2026-09-01");
    expect(short.stats.unlocked).not.toContain("findit-10");

    const long = applyRound(base, { gameId: "find-it", score: 2000, outcome: "complete", flags: ["find-it:level-10"] }, "2026-09-01");
    expect(long.stats.unlocked).toContain("findit-10");
  });
});

describe("Geo Memory teaches something now", () => {
  /**
   * The board used to pair a flag with an identical flag, so you could clear
   * it without knowing a single country — a pure memory drill with geography
   * painted on. Every pair is now one flag card and one country-name card, so
   * finishing the board means you matched each flag to its country.
   */
  it("gives every pair one flag card and one name card", () => {
    const deck = buildDeck(16, "faces");
    const byPair = new Map<string, string[]>();
    for (const card of deck) {
      byPair.set(card.pairId, [...(byPair.get(card.pairId) ?? []), card.face]);
    }
    expect(byPair.size).toBe(8);
    for (const [pair, faces] of byPair) {
      expect(faces.sort(), `pair ${pair}`).toEqual(["flag", "name"]);
    }
  });

  it("still matches the two halves of a pair", () => {
    // The faces differ, so a matcher that compared what is DRAWN rather than
    // the pairId would now never match anything.
    const deck = buildDeck(12, "match");
    const first = deck[0]!;
    const partner = deck.find((c) => c.pairId === first.pairId && c.id !== first.id)!;
    expect(partner.face).not.toBe(first.face);

    const afterOne = flipCard(deck, first.id);
    const afterTwo = flipCard(afterOne.cards, partner.id);
    expect(afterTwo.matched).toBe(true);
  });

  it("charges for a peek, and leaves an unhinted game alone", () => {
    // A free peek would let anyone clear the board instantly and make every
    // score identical, which is the same reason Country Hunt prices its hints.
    const clean = memoryScore(16, 8, 30);
    expect(applyPeek(clean, false)).toBe(clean);
    expect(applyPeek(clean, true)).toBeLessThan(clean);
    expect(applyPeek(clean, true)).toBeGreaterThanOrEqual(50);
  });

  it("turns every unmatched card face up when peeking, and leaves matches alone", () => {
    const deck = buildDeck(12, "peek").map((c, i) => (i < 2 ? { ...c, matched: true } : c));
    const peeked = peekAll(deck);
    expect(peeked.every((c) => c.flipped || c.matched)).toBe(true);
    expect(peeked.filter((c) => c.matched)).toHaveLength(2);
  });
});
