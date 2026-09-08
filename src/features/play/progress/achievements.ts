import type { PlayStats } from "./types";

/**
 * Achievements.
 *
 * Every one of these is checked against the recorded stats, so an achievement
 * can only be unlocked by actually doing the thing. There is no participation
 * badge and nothing unlocks on first open — a wall of trophies you didn't
 * earn is worth nothing, and people can tell.
 *
 * `check` is a pure function of the accumulated stats, which is what lets the
 * whole set be re-evaluated after any round (and unit-tested without a store).
 */
export interface Achievement {
  id: string;
  title: string;
  /** What you have to do. Shown before it's unlocked, so it's a goal. */
  requirement: string;
  icon: string;
  check: (stats: PlayStats) => boolean;
}

const totalRounds = (s: PlayStats) => Object.values(s.games).reduce((n, g) => n + g.rounds, 0);
const totalWins = (s: PlayStats) => Object.values(s.games).reduce((n, g) => n + g.wins, 0);
const gamesPlayed = (s: PlayStats) => Object.values(s.games).filter((g) => g.rounds > 0).length;
const best = (s: PlayStats, id: string) => s.games[id]?.bestScore ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-round",
    title: "First Round",
    requirement: "Finish any game once",
    icon: "🎯",
    check: (s) => totalRounds(s) >= 1,
  },
  {
    id: "ten-rounds",
    title: "Getting Warm",
    requirement: "Finish 10 rounds",
    icon: "🔥",
    check: (s) => totalRounds(s) >= 10,
  },
  {
    id: "fifty-rounds",
    title: "Regular",
    requirement: "Finish 50 rounds",
    icon: "🏅",
    check: (s) => totalRounds(s) >= 50,
  },
  {
    id: "explorer",
    title: "Explorer",
    requirement: "Play 3 different games",
    icon: "🧭",
    check: (s) => gamesPlayed(s) >= 3,
  },
  {
    id: "all-rounder",
    title: "All-Rounder",
    requirement: "Play every game at least once",
    icon: "🌟",
    check: (s) => gamesPlayed(s) >= s.knownGameCount,
  },
  {
    id: "first-win",
    title: "Winner",
    requirement: "Win a round",
    icon: "🥇",
    check: (s) => totalWins(s) >= 1,
  },
  {
    id: "ten-wins",
    title: "On Form",
    requirement: "Win 10 rounds",
    icon: "💪",
    check: (s) => totalWins(s) >= 10,
  },
  {
    id: "beat-hard-four",
    title: "Four Master",
    requirement: "Beat Four-in-a-Row on Hard",
    icon: "🔴",
    check: (s) => (s.flags["four-in-a-row:beat-hard"] ?? 0) >= 1,
  },
  {
    id: "beat-hard-ttt",
    title: "Unbeatable? Not quite",
    requirement: "Beat Tic-Tac-Toe on Hard",
    icon: "✖️",
    check: (s) => (s.flags["tic-tac-toe:beat-hard"] ?? 0) >= 1,
  },
  {
    id: "pin-bullseye",
    title: "Bullseye",
    requirement: "Pin a place within 25 km",
    icon: "📍",
    check: (s) => (s.flags["pin-the-place:within-25km"] ?? 0) >= 1,
  },
  {
    id: "pin-sniper",
    title: "Sniper",
    requirement: "Pin 5 places within 100 km",
    icon: "🎯",
    check: (s) => (s.flags["pin-the-place:within-100km"] ?? 0) >= 5,
  },
  {
    id: "quiz-perfect",
    title: "Full Marks",
    requirement: "Get every question right in a quiz",
    icon: "💯",
    check: (s) => (s.flags["quiz:perfect"] ?? 0) >= 1,
  },
  {
    id: "race-ten",
    title: "Quick Off the Mark",
    requirement: "Score 10+ in Map Race",
    icon: "⚡",
    check: (s) => best(s, "map-race") >= 10,
  },
  {
    id: "cricket-fifty",
    title: "Half Century",
    requirement: "Score 50+ in Cricket Challenge",
    icon: "🏏",
    check: (s) => best(s, "cricket") >= 50,
  },
  {
    id: "cricket-hard",
    title: "Timed It Right",
    requirement: "Win Cricket Challenge on Hard",
    icon: "🎯",
    check: (s) => (s.flags["cricket:beat-hard"] ?? 0) >= 1,
  },
  {
    id: "memory-perfect",
    title: "Total Recall",
    requirement: "Clear a Geo Memory board with no wasted moves",
    icon: "🧠",
    // Its OWN flag. An earlier version checked the shared "quiz:perfect"
    // counter, which any perfect quiz sets — so this would have unlocked
    // without ever clearing a memory board, and the requirement printed
    // beside it would have been a lie.
    check: (s) => (s.flags["geo-memory:perfect"] ?? 0) >= 1,
  },
  {
    id: "findit-10",
    title: "Sharp Eyes",
    requirement: "Reach level 10 in Find It",
    icon: "🔍",
    check: (s) => (s.flags["find-it:level-10"] ?? 0) >= 1,
  },
  {
    id: "streak-3",
    title: "Three Days Running",
    requirement: "Play 3 days in a row",
    icon: "📅",
    check: (s) => s.longestStreak >= 3,
  },
  {
    id: "streak-7",
    title: "A Full Week",
    requirement: "Play 7 days in a row",
    icon: "🗓️",
    check: (s) => s.longestStreak >= 7,
  },
  {
    id: "daily-5",
    title: "Daily Habit",
    requirement: "Finish 5 Daily Challenges",
    icon: "🎁",
    check: (s) => s.dailyCompleted >= 5,
  },
];

/** IDs that are newly satisfied but not yet recorded as unlocked. */
export function newlyUnlocked(stats: PlayStats): string[] {
  return ACHIEVEMENTS.filter((a) => !stats.unlocked.includes(a.id) && a.check(stats)).map((a) => a.id);
}
