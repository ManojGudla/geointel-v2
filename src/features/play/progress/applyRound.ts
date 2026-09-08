import { newlyUnlocked } from "./achievements";
import { xpForRound } from "./xp";
import { EMPTY_GAME_STATS, type PlayStats, type RoundResult } from "./types";

/**
 * Folds one finished round into the accumulated stats.
 *
 * Pure on purpose — the store just holds the result of this, so the whole
 * progression system (streaks, personal bests, XP, achievement unlocks) is
 * unit-testable without React, localStorage or a clock.
 */
export interface AppliedRound {
  stats: PlayStats;
  xpGained: number;
  /** True only when this round beat the previous best for that game. */
  newPersonalBest: boolean;
  /** Achievements that unlocked because of THIS round. Drives the toast. */
  unlockedNow: string[];
  streakExtended: boolean;
}

/** Days between two YYYY-MM-DD keys, ignoring time of day. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export function applyRound(stats: PlayStats, result: RoundResult, today: string): AppliedRound {
  const prev = stats.games[result.gameId] ?? EMPTY_GAME_STATS;

  const newPersonalBest = result.score > prev.bestScore;

  const game = {
    rounds: prev.rounds + 1,
    wins: prev.wins + (result.outcome === "win" ? 1 : 0),
    losses: prev.losses + (result.outcome === "loss" ? 1 : 0),
    draws: prev.draws + (result.outcome === "draw" ? 1 : 0),
    bestScore: newPersonalBest ? result.score : prev.bestScore,
    bestScoreDate: newPersonalBest ? today : prev.bestScoreDate,
    lastPlayed: today,
  };

  // Streak: same day keeps it, the next day extends it, a gap resets it to 1.
  // Resetting to 1 rather than 0 matters — you played today, so today counts.
  let currentStreak = stats.currentStreak;
  let streakExtended = false;
  if (!stats.lastPlayedDate) {
    currentStreak = 1;
    streakExtended = true;
  } else {
    const gap = daysBetween(stats.lastPlayedDate, today);
    if (gap === 0) {
      currentStreak = Math.max(1, currentStreak);
    } else if (gap === 1) {
      currentStreak = currentStreak + 1;
      streakExtended = true;
    } else if (gap > 1 || Number.isNaN(gap)) {
      currentStreak = 1;
      streakExtended = true;
    }
    // A negative gap means the device clock moved backwards. Leave the streak
    // alone rather than inflating or destroying it on a clock change.
  }

  const flags = { ...stats.flags };
  for (const f of result.flags ?? []) flags[f] = (flags[f] ?? 0) + 1;
  if (result.perfect) flags["quiz:perfect"] = (flags["quiz:perfect"] ?? 0) + 1;

  const xpGained = xpForRound({
    score: result.score,
    won: result.outcome === "win",
    perfect: result.perfect,
  });

  // The daily counter only moves on the first daily finish of a given date,
  // so replaying it can't farm the "Daily Habit" achievement.
  const countsAsNewDaily = !!result.daily && stats.lastDailyDate !== today;

  const next: PlayStats = {
    ...stats,
    xp: stats.xp + xpGained,
    games: { ...stats.games, [result.gameId]: game },
    flags,
    currentStreak,
    longestStreak: Math.max(stats.longestStreak, currentStreak),
    lastPlayedDate: today,
    dailyCompleted: stats.dailyCompleted + (countsAsNewDaily ? 1 : 0),
    lastDailyDate: result.daily ? today : stats.lastDailyDate,
  };

  const unlockedNow = newlyUnlocked(next);

  return {
    stats: { ...next, unlocked: [...next.unlocked, ...unlockedNow] },
    xpGained,
    newPersonalBest,
    unlockedNow,
    streakExtended,
  };
}
