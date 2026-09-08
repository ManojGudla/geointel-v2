import { create } from "zustand";
import { localDateKey } from "../../lib/random";
import { MAX_DAY_SCORE, type RoundResult } from "./dailyEngine";

/**
 * What the Daily Challenge remembers between visits.
 *
 * Stored in this browser only — there are no accounts, so there is nothing to
 * sync and no leaderboard to compare against. That is stated plainly on the
 * results screen rather than implied, because a streak that silently vanishes
 * when someone opens the site on their laptop would feel like a bug.
 *
 * The persisted shape is versioned. A future change to what a day records
 * must not make an old file crash the game on load; an unreadable or
 * out-of-date payload is discarded and the player starts clean.
 */

const STORAGE_KEY = "manowj.daily.v1";

export interface DayRecord {
  dateKey: string;
  total: number;
  /** Per-round scores only. Enough to redraw the grid, too little to spoil. */
  scores: number[];
}

interface DailyState {
  /** The finished day, when today has already been played. */
  today: DayRecord | null;
  streak: number;
  bestTotal: number;
  daysPlayed: number;
  /** Loaded once on mount; the store starts empty so SSR/tests are clean. */
  hydrate: (now?: Date) => void;
  complete: (results: RoundResult[], now?: Date) => void;
}

interface Persisted {
  version: 1;
  lastDate: string;
  lastTotal: number;
  lastScores: number[];
  streak: number;
  bestTotal: number;
  daysPlayed: number;
}

function read(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== 1 || typeof parsed.lastDate !== "string") return null;
    return {
      version: 1,
      lastDate: parsed.lastDate,
      lastTotal: Number(parsed.lastTotal) || 0,
      lastScores: Array.isArray(parsed.lastScores) ? parsed.lastScores.map(Number).filter(Number.isFinite) : [],
      streak: Number(parsed.streak) || 0,
      bestTotal: Number(parsed.bestTotal) || 0,
      daysPlayed: Number(parsed.daysPlayed) || 0,
    };
  } catch {
    // Corrupt or blocked storage must never stop someone playing.
    return null;
  }
}

function write(value: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing, quota, or a blocked origin. The day still plays; it
    // just won't be remembered, which is far better than throwing mid-game.
  }
}

/** The calendar day before `dateKey`, as a key. Used to continue a streak. */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return localDateKey(new Date(y, m - 1, d - 1));
}

/**
 * A streak counts consecutive days, so it survives yesterday and only
 * yesterday. Missing a day resets to 1 rather than 0 — the day just played
 * still counts, and starting a fresh streak at zero would read as a punishment
 * for coming back.
 */
export function nextStreak(lastPlayed: string | null, previousStreak: number, todayKey: string): number {
  if (!lastPlayed) return 1;
  if (lastPlayed === todayKey) return Math.max(1, previousStreak);
  return lastPlayed === previousDateKey(todayKey) ? previousStreak + 1 : 1;
}

export const useDailyStore = create<DailyState>((set) => ({
  today: null,
  streak: 0,
  bestTotal: 0,
  daysPlayed: 0,

  hydrate: (now = new Date()) => {
    const saved = read();
    if (!saved) return;
    const todayKey = localDateKey(now);
    // A streak is only still alive if the last play was today or yesterday.
    const alive = saved.lastDate === todayKey || saved.lastDate === previousDateKey(todayKey);
    set({
      today:
        saved.lastDate === todayKey
          ? { dateKey: saved.lastDate, total: saved.lastTotal, scores: saved.lastScores }
          : null,
      streak: alive ? saved.streak : 0,
      bestTotal: saved.bestTotal,
      daysPlayed: saved.daysPlayed,
    });
  },

  complete: (results, now = new Date()) => {
    const todayKey = localDateKey(now);
    const total = Math.min(MAX_DAY_SCORE, results.reduce((s, r) => s + r.score, 0));
    const saved = read();

    // Replaying a day already recorded must not inflate the streak or the
    // days-played count. It can only happen through a stale tab, but it would
    // quietly corrupt every number on the results screen.
    const alreadyToday = saved?.lastDate === todayKey;
    const streak = nextStreak(saved?.lastDate ?? null, saved?.streak ?? 0, todayKey);
    const bestTotal = Math.max(saved?.bestTotal ?? 0, total);
    const daysPlayed = (saved?.daysPlayed ?? 0) + (alreadyToday ? 0 : 1);
    const scores = results.map((r) => r.score);

    write({ version: 1, lastDate: todayKey, lastTotal: total, lastScores: scores, streak, bestTotal, daysPlayed });
    set({ today: { dateKey: todayKey, total, scores }, streak, bestTotal, daysPlayed });
  },
}));
