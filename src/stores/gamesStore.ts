import { create } from "zustand";

/**
 * Games are an overlay, not a route.
 *
 * A separate URL would be the obvious choice, and it would be wrong here:
 * this app has no router (see App.tsx), so navigating to /games and back
 * means a full page load, which resets the map position, the selected
 * location, active layers, any analysis and the Copilot thread. Closing a
 * game and finding your work gone is a far worse outcome than not having a
 * shareable game URL. As an overlay, every piece of GeoIntel state is
 * exactly where it was left.
 */
/**
 * Any game id in the PLAY registry (src/features/play/registry.tsx). A plain
 * string rather than a union so adding a game is one entry in the registry,
 * not an edit here as well - the registry is the single source of truth for
 * what exists, and PlayHub validates the id before opening anything.
 */
export type GameId = string;

export interface GameStats {
  games: number;
  /** Wins for the human / player X. */
  first: number;
  /** Wins for the AI / player O. */
  second: number;
  draws: number;
}

export const EMPTY_STATS: GameStats = { games: 0, first: 0, second: 0, draws: 0 };

const STORAGE_KEY = "manowj.games.stats.v1";

/** Statistics only: counts of wins, losses and draws. No personal information, no gameplay traces. */
type StatsByMode = Record<string, GameStats>;

function loadStats(): StatsByMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatsByMode;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    // Private browsing, disabled storage, or corrupt data. Playing must
    // never depend on being able to remember the score.
    return {};
  }
}

function saveStats(stats: StatsByMode) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Same reasoning: losing the scoreboard is a minor inconvenience, and
    // never a reason to interrupt a game.
  }
}

interface GamesState {
  isOpen: boolean;
  activeGame: GameId | null;
  statsByMode: StatsByMode;
  open: () => void;
  close: () => void;
  play: (game: GameId) => void;
  backToHub: () => void;
  /** Records a finished game. "first" is the human or player X; "second" is the AI or player O. */
  recordResult: (modeKey: string, outcome: "first" | "second" | "draw") => void;
  resetStats: (modeKey: string) => void;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  isOpen: false,
  activeGame: null,
  statsByMode: loadStats(),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  play: (activeGame) => set({ activeGame, isOpen: true }),
  backToHub: () => set({ activeGame: null }),
  recordResult: (modeKey, outcome) => {
    const current = get().statsByMode[modeKey] ?? EMPTY_STATS;
    const next: GameStats = {
      games: current.games + 1,
      first: current.first + (outcome === "first" ? 1 : 0),
      second: current.second + (outcome === "second" ? 1 : 0),
      draws: current.draws + (outcome === "draw" ? 1 : 0),
    };
    const statsByMode = { ...get().statsByMode, [modeKey]: next };
    saveStats(statsByMode);
    set({ statsByMode });
  },
  resetStats: (modeKey) => {
    const statsByMode = { ...get().statsByMode, [modeKey]: EMPTY_STATS };
    saveStats(statsByMode);
    set({ statsByMode });
  },
}));
