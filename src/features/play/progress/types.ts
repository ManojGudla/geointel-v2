/** Per-game accumulated record. All of it earned by finishing rounds. */
export interface GameStats {
  rounds: number;
  wins: number;
  losses: number;
  draws: number;
  bestScore: number;
  /** ISO date (YYYY-MM-DD) the best score was set, for "new personal best". */
  bestScoreDate: string | null;
  lastPlayed: string | null;
}

export interface PlayStats {
  xp: number;
  games: Record<string, GameStats>;
  /**
   * Counters for one-off conditions an achievement needs but that don't fit
   * the per-game shape — "beat Hard", "pinned within 25 km". Named
   * `game:condition` so it's obvious where each one is written.
   */
  flags: Record<string, number>;
  unlocked: string[];
  /** Consecutive local days with at least one finished round. */
  currentStreak: number;
  longestStreak: number;
  /** Local YYYY-MM-DD of the last day a round was finished. */
  lastPlayedDate: string | null;
  /** Daily challenges finished, and the last date one was finished. */
  dailyCompleted: number;
  lastDailyDate: string | null;
  /**
   * How many games the hub currently offers — needed by the "play every game"
   * achievement, and stored so the achievement can't be silently satisfied by
   * a future release removing a game.
   */
  knownGameCount: number;
}

export interface RoundResult {
  gameId: string;
  /** Higher is better. Board games report 1 for a win so "best" means something. */
  score: number;
  outcome: "win" | "loss" | "draw" | "complete";
  /** Conditions this round satisfied, e.g. ["pin-the-place:within-25km"]. */
  flags?: string[];
  /** True when the round was today's Daily Challenge. */
  daily?: boolean;
  /** Perfect round — all questions right, no mistakes. Worth extra XP. */
  perfect?: boolean;
}

export const EMPTY_GAME_STATS: GameStats = {
  rounds: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestScore: 0,
  bestScoreDate: null,
  lastPlayed: null,
};
