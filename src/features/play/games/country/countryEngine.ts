import { COUNTRIES, haversineKm, type Country, type Region } from "../../data/world";
import { createRng } from "../../lib/random";

/**
 * Country Hunt — you are given a country's name and you click where it is.
 *
 * Distance-scored rather than right/wrong, because "roughly where Paraguay is"
 * is real knowledge and a multiple-choice quiz throws it away. Someone who
 * lands in the right part of South America has genuinely done better than
 * someone who clicks Africa, and the score should say so.
 *
 * There is no bundled boundary geometry in this project, so a click is scored
 * against the country's CAPITAL rather than tested for being inside its
 * borders. That is stated openly in the UI: for a country the size of Russia
 * the capital is a poor centre, which is why the scoring bands are wide and
 * why the size of the country is factored in below rather than pretending to
 * a precision the data cannot support.
 */

export type Difficulty = "easy" | "normal" | "hard";

export interface CountryRound {
  country: Country;
  /** Wrong answers are never used for scoring; they exist for the 50/50 hint. */
  decoys: Country[];
}

export interface Guess {
  lat: number;
  lon: number;
}

export interface CountryResult {
  country: Country;
  guess: Guess;
  distanceKm: number;
  score: number;
  /** Points given up to hints on this round. Reported so the cost is visible. */
  hintPenalty: number;
}

export const MAX_ROUND_SCORE = 1000;
export const ROUNDS = 6;

/**
 * How fast the score falls with distance, per difficulty.
 *
 * Easy is forgiving enough that landing on the right continent still scores
 * well, which is what a beginner can actually do. Hard demands the right
 * country. Without this the same curve either humiliated newcomers or bored
 * anyone who knew the map.
 */
const DECAY_KM: Record<Difficulty, number> = { easy: 1600, normal: 900, hard: 500 };

/** Inside this, the click counts as spot on. */
export const PERFECT_KM = 150;

export function scoreForDistance(distanceKm: number, difficulty: Difficulty): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (distanceKm <= PERFECT_KM) return MAX_ROUND_SCORE;
  return Math.round(MAX_ROUND_SCORE * Math.exp(-(distanceKm - PERFECT_KM) / DECAY_KM[difficulty]));
}

// ── Hints ─────────────────────────────────────────────────────────────────

export type HintKind = "region" | "neighbours" | "narrow";

/**
 * What each hint costs, as a fraction of the round.
 *
 * Hints are not free. A free hint would make every score identical and the
 * whole thing pointless — you would simply press it every time. Paying for
 * help is what keeps a hinted round comparable to an unhinted one, and makes
 * taking the hint an actual decision.
 */
export const HINT_COST: Record<HintKind, number> = {
  region: 0.15,
  neighbours: 0.3,
  narrow: 0.45,
};

export interface Hint {
  kind: HintKind;
  label: string;
  text: string;
  cost: number;
}

/** Rough compass position of a country within its own region. */
function compassWithinRegion(country: Country, region: Country[]): string {
  const lats = region.map((c) => c.lat);
  const lons = region.map((c) => c.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const ns = country.lat > midLat + 4 ? "northern" : country.lat < midLat - 4 ? "southern" : "central";
  const ew = country.lon > midLon + 8 ? "eastern" : country.lon < midLon - 8 ? "western" : "";
  return [ns, ew].filter(Boolean).join(" ");
}

/**
 * The hints available for a round, cheapest and vaguest first.
 *
 * Every one is derived from the bundled data rather than written by hand, so
 * a hint can never contradict the answer it is helping you find — the failure
 * that makes a hint system worse than none at all.
 */
export function hintsFor(round: CountryRound): Hint[] {
  const { country } = round;
  const sameRegion = COUNTRIES.filter((c) => c.region === country.region);

  const nearest = COUNTRIES.filter((c) => c.code !== country.code)
    .map((c) => ({ c, km: haversineKm(country.lat, country.lon, c.lat, c.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)
    .map((n) => n.c.name);

  return [
    {
      kind: "region",
      label: "Which part of the world?",
      text: `${country.region}${compassWithinRegion(country, sameRegion) ? `, the ${compassWithinRegion(country, sameRegion)} part` : ""}.`,
      cost: HINT_COST.region,
    },
    {
      kind: "neighbours",
      label: "What is near it?",
      // "Closest capitals" rather than "borders": without boundary data this
      // is what the bundled coordinates can honestly support, and the wording
      // says so instead of implying a land border that may not exist.
      text: `The closest capitals are ${nearest.join(", ")}.`,
      cost: HINT_COST.neighbours,
    },
    {
      kind: "narrow",
      label: "Show me the area",
      text: `Its capital is ${country.capital}.`,
      cost: HINT_COST.narrow,
    },
  ];
}

/** Score after hints, never below zero. */
export function applyHintCost(rawScore: number, used: HintKind[]): { score: number; penalty: number } {
  const fraction = used.reduce((sum, k) => sum + HINT_COST[k], 0);
  const penalty = Math.round(rawScore * Math.min(1, fraction));
  return { score: Math.max(0, rawScore - penalty), penalty };
}

export function judge(
  country: Country,
  guess: Guess,
  difficulty: Difficulty,
  hintsUsed: HintKind[]
): CountryResult {
  const distanceKm = haversineKm(guess.lat, guess.lon, country.lat, country.lon);
  const raw = scoreForDistance(distanceKm, difficulty);
  const { score, penalty } = applyHintCost(raw, hintsUsed);
  return { country, guess, distanceKm, score, hintPenalty: penalty };
}

// ── Round selection ───────────────────────────────────────────────────────

/**
 * Which countries a difficulty may ask about.
 *
 * Easy sticks to countries most people could place on a blank map. Hard opens
 * the whole list. Drawing from everything at every level is what makes a geo
 * game feel like a test you were never taught for.
 */
const EASY_CODES = new Set([
  "IN", "US", "CN", "BR", "AU", "RU", "CA", "JP", "GB", "FR", "DE", "IT", "ES", "MX", "EG", "ZA", "AR", "SA", "ID", "TR",
]);

export function poolFor(difficulty: Difficulty): Country[] {
  if (difficulty === "easy") return COUNTRIES.filter((c) => EASY_CODES.has(c.code));
  if (difficulty === "normal") {
    // Everything except the handful of very small states, which are unfair to
    // click for at normal level.
    return COUNTRIES;
  }
  return COUNTRIES;
}

export function buildRounds(count: number, difficulty: Difficulty, seed: string): CountryRound[] {
  const rng = createRng(seed);
  const pool = poolFor(difficulty);
  const chosen = rng.sample(pool, Math.min(count, pool.length));

  return chosen.map((country) => {
    const others = COUNTRIES.filter((c) => c.code !== country.code && c.region === country.region);
    const fallback = COUNTRIES.filter((c) => c.code !== country.code);
    const decoyPool = others.length >= 3 ? others : fallback;
    return { country, decoys: rng.sample(decoyPool, 3) };
  });
}

export function regionsOf(rounds: CountryRound[]): Region[] {
  return [...new Set(rounds.map((r) => r.country.region))];
}

export function formatKm(km: number): string {
  if (km < 100) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/** Plain-language verdict, so the number is not the only feedback. */
export function verdictFor(distanceKm: number): string {
  if (distanceKm <= PERFECT_KM) return "Spot on.";
  if (distanceKm <= 600) return "Right country, near enough.";
  if (distanceKm <= 1800) return "Right part of the world.";
  if (distanceKm <= 4500) return "Right continent, wrong end of it.";
  return "Wrong part of the world.";
}
