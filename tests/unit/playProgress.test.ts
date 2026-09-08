import { describe, expect, it } from "vitest";
import { applyRound, daysBetween } from "@/features/play/progress/applyRound";
import { levelForXp, levelProgress, xpForLevel, xpForRound } from "@/features/play/progress/xp";
import { ACHIEVEMENTS, newlyUnlocked } from "@/features/play/progress/achievements";
import type { PlayStats } from "@/features/play/progress/types";

function fresh(overrides: Partial<PlayStats> = {}): PlayStats {
  return {
    xp: 0,
    games: {},
    flags: {},
    unlocked: [],
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    dailyCompleted: 0,
    lastDailyDate: null,
    knownGameCount: 8,
    ...overrides,
  };
}

describe("xp and levels", () => {
  it("starts at level 1 with no xp", () => {
    expect(levelForXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
  });

  it("increases the cost of each level", () => {
    const costs = [2, 3, 4, 5, 6].map((l) => xpForLevel(l) - xpForLevel(l - 1));
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    }
  });

  it("puts the level boundary exactly where xpForLevel says", () => {
    for (const level of [2, 3, 5, 9]) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it("reports progress within a level as a 0-1 fraction", () => {
    const p = levelProgress(xpForLevel(3));
    expect(p.level).toBe(3);
    expect(p.fraction).toBe(0);
    expect(p.intoLevel).toBe(0);
    expect(p.xpToNext).toBe(xpForLevel(4) - xpForLevel(3));
  });

  it("awards more xp for a win than a loss, and caps the total", () => {
    expect(xpForRound({ score: 100, won: true })).toBeGreaterThan(xpForRound({ score: 100, won: false }));
    expect(xpForRound({ score: 1_000_000, won: true, perfect: true })).toBeLessThanOrEqual(300);
  });

  it("never awards negative xp", () => {
    expect(xpForRound({ score: 0, won: false })).toBeGreaterThanOrEqual(0);
  });
});

describe("recording a round", () => {
  it("counts the round and the win", () => {
    const { stats } = applyRound(fresh(), { gameId: "four-in-a-row", score: 1, outcome: "win" }, "2026-09-01");
    expect(stats.games["four-in-a-row"]!.rounds).toBe(1);
    expect(stats.games["four-in-a-row"]!.wins).toBe(1);
    expect(stats.games["four-in-a-row"]!.losses).toBe(0);
  });

  it("records a personal best only when the score actually beats the old one", () => {
    const first = applyRound(fresh(), { gameId: "map-race", score: 800, outcome: "complete" }, "2026-09-01");
    expect(first.newPersonalBest).toBe(true);
    expect(first.stats.games["map-race"]!.bestScore).toBe(800);

    const worse = applyRound(first.stats, { gameId: "map-race", score: 500, outcome: "complete" }, "2026-09-01");
    expect(worse.newPersonalBest).toBe(false);
    expect(worse.stats.games["map-race"]!.bestScore).toBe(800);

    const better = applyRound(worse.stats, { gameId: "map-race", score: 900, outcome: "complete" }, "2026-09-02");
    expect(better.newPersonalBest).toBe(true);
    expect(better.stats.games["map-race"]!.bestScore).toBe(900);
    expect(better.stats.games["map-race"]!.bestScoreDate).toBe("2026-09-02");
  });

  it("never mutates the stats it was given", () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    applyRound(before, { gameId: "quiz", score: 50, outcome: "complete" }, "2026-09-01");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("streaks", () => {
  const round = { gameId: "quiz", score: 10, outcome: "complete" as const };

  it("starts at 1 on the first ever round", () => {
    const { stats, streakExtended } = applyRound(fresh(), round, "2026-09-01");
    expect(stats.currentStreak).toBe(1);
    expect(streakExtended).toBe(true);
  });

  it("does not grow when you play twice on the same day", () => {
    const a = applyRound(fresh(), round, "2026-09-01");
    const b = applyRound(a.stats, round, "2026-09-01");
    expect(b.stats.currentStreak).toBe(1);
    expect(b.streakExtended).toBe(false);
  });

  it("grows on consecutive days", () => {
    let s = fresh();
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      s = applyRound(s, round, day).stats;
    }
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });

  it("resets to 1 after a missed day but keeps the longest", () => {
    let s = fresh();
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-03"]) s = applyRound(s, round, day).stats;
    s = applyRound(s, round, "2026-09-06").stats;
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(3);
  });

  it("survives a month boundary", () => {
    const a = applyRound(fresh(), round, "2026-09-30");
    const b = applyRound(a.stats, round, "2026-10-01");
    expect(b.stats.currentStreak).toBe(2);
  });

  it("leaves the streak alone if the device clock goes backwards", () => {
    const a = applyRound(fresh({ currentStreak: 4, longestStreak: 4, lastPlayedDate: "2026-09-10" }), round, "2026-09-08");
    expect(a.stats.currentStreak).toBe(4);
  });

  it("counts days across a leap-day boundary correctly", () => {
    expect(daysBetween("2028-02-28", "2028-02-29")).toBe(1);
    expect(daysBetween("2028-02-29", "2028-03-01")).toBe(1);
  });
});

describe("daily challenge counting", () => {
  const daily = { gameId: "daily", score: 100, outcome: "complete" as const, daily: true };

  it("counts the first daily finish of a date", () => {
    const { stats } = applyRound(fresh(), daily, "2026-09-01");
    expect(stats.dailyCompleted).toBe(1);
  });

  it("does not count a replay of the same day", () => {
    const a = applyRound(fresh(), daily, "2026-09-01");
    const b = applyRound(a.stats, daily, "2026-09-01");
    expect(b.stats.dailyCompleted).toBe(1);
  });

  it("counts a new day", () => {
    const a = applyRound(fresh(), daily, "2026-09-01");
    const b = applyRound(a.stats, daily, "2026-09-02");
    expect(b.stats.dailyCompleted).toBe(2);
  });
});

describe("achievements", () => {
  it("unlocks nothing on a fresh profile", () => {
    expect(newlyUnlocked(fresh())).toEqual([]);
  });

  it("has unique ids and a stated requirement for every entry", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.requirement.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
    }
  });

  it("unlocks First Round and Winner from one won round", () => {
    const { unlockedNow } = applyRound(fresh(), { gameId: "four-in-a-row", score: 1, outcome: "win" }, "2026-09-01");
    expect(unlockedNow).toContain("first-round");
    expect(unlockedNow).toContain("first-win");
  });

  it("does not re-unlock something already unlocked", () => {
    const a = applyRound(fresh(), { gameId: "quiz", score: 10, outcome: "win" }, "2026-09-01");
    const b = applyRound(a.stats, { gameId: "quiz", score: 10, outcome: "win" }, "2026-09-02");
    expect(b.unlockedNow).not.toContain("first-round");
    expect(b.stats.unlocked.filter((x) => x === "first-round")).toHaveLength(1);
  });

  it("unlocks Bullseye only from a genuine close pin", () => {
    const far = applyRound(fresh(), { gameId: "pin-the-place", score: 900, outcome: "complete" }, "2026-09-01");
    expect(far.stats.unlocked).not.toContain("pin-bullseye");

    const close = applyRound(
      fresh(),
      { gameId: "pin-the-place", score: 4900, outcome: "complete", flags: ["pin-the-place:within-25km"] },
      "2026-09-01"
    );
    expect(close.stats.unlocked).toContain("pin-bullseye");
  });

  it("unlocks the 3-day streak achievement only after three real days", () => {
    let s = fresh();
    s = applyRound(s, { gameId: "quiz", score: 10, outcome: "complete" }, "2026-09-01").stats;
    expect(s.unlocked).not.toContain("streak-3");
    s = applyRound(s, { gameId: "quiz", score: 10, outcome: "complete" }, "2026-09-02").stats;
    expect(s.unlocked).not.toContain("streak-3");
    s = applyRound(s, { gameId: "quiz", score: 10, outcome: "complete" }, "2026-09-03").stats;
    expect(s.unlocked).toContain("streak-3");
  });

  it("requires every game for All-Rounder", () => {
    let s = fresh({ knownGameCount: 3 });
    s = applyRound(s, { gameId: "a", score: 1, outcome: "win" }, "2026-09-01").stats;
    s = applyRound(s, { gameId: "b", score: 1, outcome: "win" }, "2026-09-01").stats;
    expect(s.unlocked).not.toContain("all-rounder");
    s = applyRound(s, { gameId: "c", score: 1, outcome: "win" }, "2026-09-01").stats;
    expect(s.unlocked).toContain("all-rounder");
  });
});
