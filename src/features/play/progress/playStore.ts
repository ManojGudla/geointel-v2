import { create } from "zustand";
import { applyRound, type AppliedRound } from "./applyRound";
import { localDateKey } from "../lib/random";
import { EMPTY_GAME_STATS, type GameStats, type PlayStats, type RoundResult } from "./types";

const STATS_KEY = "manowj.play.stats.v1";
const SOUND_KEY = "manowj.play.sound";

/**
 * Progression lives in this browser and nowhere else.
 *
 * This product has no accounts, so there is no server to keep a score on and
 * no leaderboard that could be trusted if there were. Saying so plainly in
 * the UI is better than implying a global ranking that doesn't exist. If
 * accounts are ever added, this store is the seam where a sync would go.
 */
function emptyStats(knownGameCount: number): PlayStats {
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
    knownGameCount,
  };
}

/**
 * Reading localStorage can throw outright (Safari private mode, an embedded
 * webview, a browser set to block site data), and the stored value can be
 * anything if it was hand-edited or written by an older build - so every
 * field is checked rather than trusted.
 */
function loadStats(knownGameCount: number): PlayStats {
  const fallback = emptyStats(knownGameCount);
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayStats>;
    return {
      xp: typeof parsed.xp === "number" && parsed.xp >= 0 ? parsed.xp : 0,
      games: typeof parsed.games === "object" && parsed.games ? parsed.games : {},
      flags: typeof parsed.flags === "object" && parsed.flags ? parsed.flags : {},
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((x) => typeof x === "string") : [],
      currentStreak: typeof parsed.currentStreak === "number" ? parsed.currentStreak : 0,
      longestStreak: typeof parsed.longestStreak === "number" ? parsed.longestStreak : 0,
      lastPlayedDate: typeof parsed.lastPlayedDate === "string" ? parsed.lastPlayedDate : null,
      dailyCompleted: typeof parsed.dailyCompleted === "number" ? parsed.dailyCompleted : 0,
      lastDailyDate: typeof parsed.lastDailyDate === "string" ? parsed.lastDailyDate : null,
      // Always the current build's count, never the stored one - otherwise
      // "play every game" would stay unlocked against an old, smaller list.
      knownGameCount,
    };
  } catch {
    return fallback;
  }
}

function saveStats(stats: PlayStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage full or blocked. The session still works; progress just won't
    // survive a reload. Not worth interrupting a game over.
  }
}

function loadSound(): boolean {
  try {
    /**
     * ON unless the player has turned it off.
     *
     * It used to be off unless explicitly turned on, which meant every new
     * visitor played every game in silence and reasonably concluded the sound
     * was broken - which is exactly how it was reported. Opt-in audio is the
     * right default for a page that starts making noise at you; a games hub
     * you deliberately opened is not that page, and the mute control sits in
     * its header.
     *
     * Nothing autoplays regardless: browsers keep the audio context suspended
     * until a real user gesture, so the first sound can only ever follow a tap.
     */
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return false;
  }
}

interface PlayState {
  stats: PlayStats;
  /** Sound is OFF until the player turns it on. Nobody wants surprise audio. */
  soundEnabled: boolean;
  /** The most recent round, held so the hub can show what just happened. */
  lastRound: AppliedRound | null;
  recordRound: (result: RoundResult) => AppliedRound;
  statsFor: (gameId: string) => GameStats;
  setSoundEnabled: (on: boolean) => void;
  reset: () => void;
  clearLastRound: () => void;
}

/**
 * Set by the registry at import time so the "play every game" achievement
 * knows how many there are without this store importing the registry (which
 * imports the game components, which would drag the whole hub into any module
 * that only wanted the stats).
 */
let knownGameCount = 1;
export function registerGameCount(count: number) {
  knownGameCount = count;
}

export const usePlayStore = create<PlayState>((set, get) => ({
  stats: loadStats(knownGameCount),
  soundEnabled: loadSound(),
  lastRound: null,

  recordRound: (result) => {
    const applied = applyRound({ ...get().stats, knownGameCount }, result, localDateKey());
    saveStats(applied.stats);
    set({ stats: applied.stats, lastRound: applied });
    return applied;
  },

  statsFor: (gameId) => get().stats.games[gameId] ?? EMPTY_GAME_STATS,

  setSoundEnabled: (on) => {
    try {
      localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
      /* preference just won't persist */
    }
    set({ soundEnabled: on });
  },

  reset: () => {
    const fresh = emptyStats(knownGameCount);
    saveStats(fresh);
    set({ stats: fresh, lastRound: null });
  },

  clearLastRound: () => set({ lastRound: null }),
}));
