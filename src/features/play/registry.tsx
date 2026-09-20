import type { ReactNode } from "react";
import { UltimateTicTacToe } from "./games/ultimate/UltimateTicTacToe";
import { QuizGame } from "./games/quiz/QuizGame";
import { CricketChallenge } from "./games/cricket/CricketChallenge";
import { SixtySeconds } from "./games/sixty/SixtySeconds";
import { Impostor } from "./games/arcade/Impostor";
import { RealOrFake } from "./games/arcade/RealOrFake";
import { CrackTheCode } from "./games/arcade/CrackTheCode";
import { PatternBreaker } from "./games/arcade/PatternBreaker";
/*
  Three of these four were finished, tested and then never listed here, so
  nothing in the app could reach them: findit, fourInARow and memory were
  referenced by no file outside themselves. Each was played end to end in a
  browser before being added, because the promise below is that every entry
  is playable, and a card that opens onto a broken game is worse than a game
  nobody knew about.

  whereAmI is NOT one of them and must not be added back. It is a map-guessing
  game, and every map-based game was unlisted on purpose: whereAmI, mapRace,
  pin, country, change and the Daily Challenge. Their code was deliberately
  kept rather than deleted, so an automated pass looking for "components that
  exist but nothing renders" will keep reporting all six as a bug. It is not
  a bug. One such audit already did exactly that and nearly restored games
  that had been removed on request, which is why this note now says so
  plainly rather than leaving the omission to be inferred.
*/
import { FindIt } from "./games/findit/FindIt";
import { FourInARow } from "./games/fourInARow/FourInARow";
import { GeoMemory } from "./games/memory/GeoMemory";
import { registerGameCount } from "./progress/playStore";

/**
 * The catalogue.
 *
 * The Daily comes first on purpose: it is the only one with a reason to come
 * back tomorrow.
 *
 * Tic-Tac-Toe is here again, but as ULTIMATE tic-tac-toe. The plain 3×3 game
 * was removed for a reason that polish could not fix - it is solved, so two
 * competent players draw every time and there is nothing to get better at.
 * Ultimate keeps the familiar rules and adds the one twist that creates real
 * depth, and classic 3×3 is still available inside it as a mode for anyone who
 * wants it.
 *
 * EVERY entry here is a game you can play right now, end to end. There are no
 * locked cards, no "coming soon" tiles and no teasers - a card that can't be
 * pressed is a promise, and promises in a games list are how a product starts
 * feeling fake. Games that are genuinely planned are named in one honest line
 * at the bottom of the hub instead of occupying a slot that looks playable.
 */
export type CategoryId = "trending" | "geo" | "sports" | "quiz" | "quick" | "casual";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
}

export const CATEGORIES: Category[] = [
  { id: "trending", label: "Trending", icon: "🔥" },
  { id: "geo", label: "Geo Games", icon: "🌍" },
  { id: "sports", label: "Sports", icon: "🏏" },
  { id: "quiz", label: "Quiz & Brain", icon: "🧠" },
  { id: "quick", label: "Quick Challenges", icon: "⚡" },
  { id: "casual", label: "Casual", icon: "🎯" },
];

export interface GameEntry {
  id: string;
  title: string;
  tagline: string;
  icon: string;
  categories: CategoryId[];
  /** Roughly how long one round takes. Shown on the card. */
  duration: string;
  /** True for games whose score is a number worth comparing. */
  scored: boolean;
  render: (ctx: { onBackToHub: () => void }) => ReactNode;
}

export const GAMES: GameEntry[] = [
  {
    id: "tic-tac-toe",
    title: "Ultimate Tic-Tac-Toe",
    tagline: "Nine boards. Your move decides where your opponent plays next.",
    icon: "✖️",
    categories: ["trending", "casual", "quick"],
    duration: "3-8 min",
    scored: false,
    render: ({ onBackToHub }) => <UltimateTicTacToe onBackToHub={onBackToHub} />,
  },
  {
    id: "world-quiz",
    title: "World Quiz",
    tagline: "Capitals, countries and regions. Ten questions.",
    icon: "🌍",
    categories: ["geo", "quiz"],
    duration: "2 min",
    scored: true,
    render: ({ onBackToHub }) => (
      <QuizGame gameId="world-quiz" gameTitle="World Quiz" kinds={["capital", "country-of-capital", "region"]} onBackToHub={onBackToHub} />
    ),
  },
  {
    id: "flag-quiz",
    title: "Flag Quiz",
    tagline: "One flag, four countries. How many do you know?",
    icon: "🏳️",
    categories: ["quiz", "quick"],
    duration: "2 min",
    scored: true,
    render: ({ onBackToHub }) => <QuizGame gameId="flag-quiz" gameTitle="Flag Quiz" kinds={["flag"]} onBackToHub={onBackToHub} />,
  },
  {
    // Placed high because it is the shortest commitment in the hub: one
    // minute, no setup, and it can be replayed immediately. That combination
    // is what gets a visitor to press a second time.
    id: "sixty",
    title: "60 Seconds",
    tagline: "One minute. The questions keep changing. Wrong answers cost you time.",
    icon: "⚡",
    categories: ["trending", "geo", "quiz", "quick"],
    duration: "1 min",
    scored: true,
    render: ({ onBackToHub }) => <SixtySeconds onBackToHub={onBackToHub} />,
  },
  {
    id: "impostor",
    title: "The Impostor",
    tagline: "Five statements. Four are true. Find the one that is lying.",
    icon: "🕵️",
    categories: ["trending", "quiz", "casual"],
    duration: "3 min",
    scored: true,
    render: ({ onBackToHub }) => <Impostor onBackToHub={onBackToHub} />,
  },
  {
    id: "real-or-fake",
    title: "Impossible or Real",
    tagline: "Strange claims, one at a time. One wrong answer ends the run.",
    icon: "🧪",
    categories: ["trending", "quiz", "quick"],
    duration: "2 min",
    scored: true,
    render: ({ onBackToHub }) => <RealOrFake onBackToHub={onBackToHub} />,
  },
  {
    id: "crack-the-code",
    title: "Crack the Code",
    tagline: "Every symbol hides a number. Work out what they are worth.",
    icon: "🔐",
    categories: ["quiz", "casual"],
    duration: "4 min",
    scored: true,
    render: ({ onBackToHub }) => <CrackTheCode onBackToHub={onBackToHub} />,
  },
  {
    id: "pattern-breaker",
    title: "Pattern Breaker",
    tagline: "Find the rule and carry it forward. Fifteen seconds a puzzle.",
    icon: "🧩",
    categories: ["quiz", "quick"],
    duration: "3 min",
    scored: true,
    render: ({ onBackToHub }) => <PatternBreaker onBackToHub={onBackToHub} />,
  },
  {
    id: "cricket",
    title: "Cricket Challenge",
    tagline: "Time your shot as the ball comes at you. Three overs to chase.",
    icon: "🏏",
    categories: ["trending", "sports"],
    duration: "3 min",
    scored: true,
    render: ({ onBackToHub }) => <CricketChallenge onBackToHub={onBackToHub} />,
  },
  {
    id: "find-it",
    title: "Find It",
    tagline: "Spot the one that matches before the clock does. Three mistakes and the run is over.",
    icon: "👀",
    categories: ["quick", "casual"],
    duration: "2 min",
    scored: true,
    render: ({ onBackToHub }) => <FindIt onBackToHub={onBackToHub} />,
  },
  {
    id: "geo-memory",
    title: "Geo Memory",
    tagline: "Flip two flags; matching pairs stay up. The clock starts on your first flip, not before.",
    icon: "🃏",
    categories: ["quiz", "casual"],
    duration: "3 min",
    scored: true,
    render: ({ onBackToHub }) => <GeoMemory onBackToHub={onBackToHub} />,
  },
  {
    // Not scored: it is a two-player board game with a win or a draw, and a
    // points total on the card would promise a number this game never gives.
    id: "four-in-a-row",
    title: "Four in a Row",
    tagline: "Drop your colour and line up four. Against the computer at three strengths, or a friend beside you.",
    icon: "🔴",
    categories: ["casual"],
    duration: "5 min",
    scored: false,
    render: ({ onBackToHub }) => <FourInARow onBackToHub={onBackToHub} />,
  },
];

// Tells the progression store how many games exist, so "play every game"
// means the current list rather than whatever it was when a profile was saved.
registerGameCount(GAMES.length);

export function gamesInCategory(category: CategoryId): GameEntry[] {
  return GAMES.filter((g) => g.categories.includes(category));
}

export function findGame(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
