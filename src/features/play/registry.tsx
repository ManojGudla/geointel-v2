import type { ReactNode } from "react";
import { DailyChallenge } from "./games/daily/DailyChallenge";
import { UltimateTicTacToe } from "./games/ultimate/UltimateTicTacToe";
import { CountryHunt } from "./games/country/CountryHunt";
import { PinThePlace } from "./games/pin/PinThePlace";
import { MapRace } from "./games/mapRace/MapRace";
import { QuizGame } from "./games/quiz/QuizGame";
import { CricketChallenge } from "./games/cricket/CricketChallenge";
import { SpotTheChange } from "./games/change/SpotTheChange";
import { SixtySeconds } from "./games/sixty/SixtySeconds";
import { Impostor } from "./games/arcade/Impostor";
import { RealOrFake } from "./games/arcade/RealOrFake";
import { CrackTheCode } from "./games/arcade/CrackTheCode";
import { PatternBreaker } from "./games/arcade/PatternBreaker";
import { registerGameCount } from "./progress/playStore";

/**
 * The catalogue.
 *
 * The Daily comes first on purpose: it is the only one with a reason to come
 * back tomorrow.
 *
 * Tic-Tac-Toe is here again, but as ULTIMATE tic-tac-toe. The plain 3×3 game
 * was removed for a reason that polish could not fix — it is solved, so two
 * competent players draw every time and there is nothing to get better at.
 * Ultimate keeps the familiar rules and adds the one twist that creates real
 * depth, and classic 3×3 is still available inside it as a mode for anyone who
 * wants it.
 *
 * EVERY entry here is a game you can play right now, end to end. There are no
 * locked cards, no "coming soon" tiles and no teasers — a card that can't be
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
    id: "daily",
    title: "maNOWj Daily",
    tagline: "Five satellite views. One guess each. Same five for everyone, once a day.",
    icon: "🛰️",
    categories: ["trending", "geo", "quick"],
    duration: "5 min",
    scored: true,
    render: ({ onBackToHub }) => <DailyChallenge onBackToHub={onBackToHub} />,
  },
  {
    id: "country-hunt",
    title: "Country Hunt",
    tagline: "Name a country, click where it is. Hints available, for a price.",
    icon: "🗺️",
    categories: ["trending", "geo"],
    duration: "4 min",
    scored: true,
    render: ({ onBackToHub }) => <CountryHunt onBackToHub={onBackToHub} />,
  },
  {
    id: "tic-tac-toe",
    title: "Ultimate Tic-Tac-Toe",
    tagline: "Nine boards. Your move decides where your opponent plays next.",
    icon: "✖️",
    categories: ["trending", "casual", "quick"],
    duration: "3–8 min",
    scored: false,
    render: ({ onBackToHub }) => <UltimateTicTacToe onBackToHub={onBackToHub} />,
  },
  {
    id: "pin-the-place",
    title: "Pin the Place",
    tagline: "Click where you think it is. Scored on how close you got.",
    icon: "📍",
    categories: ["trending", "geo"],
    duration: "3 min",
    scored: true,
    render: ({ onBackToHub }) => <PinThePlace onBackToHub={onBackToHub} />,
  },
  {
    id: "map-race",
    title: "Map Race",
    tagline: "Sixty seconds. Find as many places as you can.",
    icon: "⚡",
    categories: ["trending", "geo", "quick"],
    duration: "1 min",
    scored: true,
    render: ({ onBackToHub }) => <MapRace onBackToHub={onBackToHub} />,
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
    /**
     * The only game here built on this product's own data rather than a quiz
     * bank: the images are live NASA GIBS tiles at the two dates named on
     * screen, from the same archive the Data tab exposes. That is also why it
     * sits under "geo" rather than "quiz" — the question is what you can see,
     * not what you already know.
     */
    id: "spot-the-change",
    title: "Spot the Change",
    tagline: "Two satellite views of the same place, years apart. Work out what happened.",
    icon: "🛰️",
    categories: ["trending", "geo", "quiz"],
    duration: "4 min",
    scored: true,
    render: ({ onBackToHub }) => <SpotTheChange onBackToHub={onBackToHub} />,
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
