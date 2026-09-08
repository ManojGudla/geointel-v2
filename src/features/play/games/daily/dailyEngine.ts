import { createRng, localDateKey } from "../../lib/random";
import { haversineKm } from "../../data/world";
import { DAILY_LOCATIONS, byDifficulty, type DailyLocation } from "./dailyLocations";

/**
 * The Daily Challenge: five places, the same five for everyone, one run a day.
 *
 * The design goal is the thing the old games hub was missing. Ten games that
 * can each be played forever gave nobody a reason to return; one puzzle a day
 * that everybody gets the same version of gives people something to compare
 * and something to miss. That is why the round is fixed to the date, why the
 * result is a spoiler-free grid, and why a streak exists.
 *
 * Everything in this file is pure. No dates are read except the one passed in,
 * no storage is touched, nothing is random except through a seed derived from
 * the date — so the whole game is testable, and two players on the same day
 * provably get the same five locations.
 */

export const ROUNDS_PER_DAY = 5;
export const MAX_ROUND_SCORE = 5000;
export const MAX_DAY_SCORE = ROUNDS_PER_DAY * MAX_ROUND_SCORE;

/**
 * Distance at which a guess is treated as exactly right.
 *
 * Without this, a player who clicks the correct building still loses points to
 * pixel precision, which feels arbitrary. One kilometre is well inside "you
 * knew it", and generous enough that a phone tap doesn't punish you.
 */
export const PERFECT_KM = 1;

/**
 * How fast the score falls with distance.
 *
 * score = 5000 · e^(−km / 800)
 *
 * Chosen so the curve rewards the knowledge people actually have:
 *   right neighbourhood (10 km)  ≈ 4938
 *   right city        (50 km)    ≈ 4697
 *   right region     (300 km)    ≈ 3444
 *   right country   (1000 km)    ≈ 1433
 *   right continent (3000 km)    ≈  114
 *   wrong continent (8000 km)    ≈    0
 *
 * A gentler curve made every guess feel the same; a harsher one made anything
 * short of perfect feel worthless. This one keeps a country-level guess worth
 * playing for.
 */
export const SCORE_DECAY_KM = 800;

/**
 * ── Clues ─────────────────────────────────────────────────────────────────
 *
 * What each rung of the ladder costs, as a fraction of the round score.
 *
 * The first clue is FREE, and that is the important decision here. It names
 * the continent and moves the guess map there. Before it existed, a player who
 * did not recognise the photo had nothing to do but click somewhere and hope —
 * which is not a hard puzzle, it is an unplayable one, and it is what made the
 * first version of this game feel hostile. Being completely stuck is the
 * failure worth removing outright rather than charging for.
 *
 * The two paid clues cost 20% and then 35%, so a player who takes everything
 * still keeps 45% of the round. That is deliberate: help has to be worth
 * having (2,250 points for a well-placed pin is a real score, not a
 * consolation) while still leaving a clear gap between working it out and
 * being told.
 */
export const CLUE_COSTS = [0, 0.2, 0.35] as const;
export const MAX_CLUES = CLUE_COSTS.length;

/** The share of the round score still available after taking `used` clues. */
export function clueMultiplier(used: number): number {
  const taken = Math.max(0, Math.min(MAX_CLUES, Math.floor(used) || 0));
  let kept = 1;
  for (let i = 0; i < taken; i++) kept -= CLUE_COSTS[i]!;
  // Rounded because floating-point subtraction of 0.2 and 0.35 does not land
  // on 0.45 exactly, and this number is shown to the player as a percentage.
  return Math.max(0, Math.round(kept * 100) / 100);
}

export function applyClueCost(score: number, cluesUsed: number): number {
  return Math.round(score * clueMultiplier(cluesUsed));
}

export interface Guess {
  lat: number;
  lon: number;
}

export interface RoundResult {
  location: DailyLocation;
  guess: Guess;
  distanceKm: number;
  /** What the guess was worth before clues were charged for. */
  rawScore: number;
  /** What it is actually worth. This is the number that counts. */
  score: number;
  cluesUsed: number;
}

/** Points for a guess, given how far it landed from the truth. */
export function scoreForDistance(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (distanceKm <= PERFECT_KM) return MAX_ROUND_SCORE;
  return Math.round(MAX_ROUND_SCORE * Math.exp(-distanceKm / SCORE_DECAY_KM));
}

export function scoreGuess(location: DailyLocation, guess: Guess, cluesUsed = 0): RoundResult {
  const distanceKm = haversineKm(guess.lat, guess.lon, location.lat, location.lon);
  const rawScore = scoreForDistance(distanceKm);
  return { location, guess, distanceKm, rawScore, score: applyClueCost(rawScore, cluesUsed), cluesUsed };
}

/**
 * The clue text at a given rung, or null past the end of the ladder.
 *
 * Rung 0 is generated rather than written per place: it is always the
 * continent, and having 54 copies of "This place is in Africa." in the data
 * file would be 54 chances to typo the one clue that must never be wrong.
 */
export function clueAt(location: DailyLocation, index: number): string | null {
  if (index === 0) return `This place is in ${location.region}.`;
  const written = location.clues[index - 1];
  return written ?? null;
}

/** Every clue revealed so far, in order. */
export function cluesRevealed(location: DailyLocation, used: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(used, MAX_CLUES); i++) {
    const text = clueAt(location, i);
    if (text) out.push(text);
  }
  return out;
}

/**
 * The five locations for a given date.
 *
 * The mix is fixed at two easy, two medium and one hard rather than five drawn
 * at random. A random draw regularly produced a day of five obscure places,
 * which reads as "this game is not for me" on someone's first visit — the
 * single worst outcome for a daily puzzle. The shape below always opens
 * approachable and always ends with something worth knowing.
 *
 * The date string is the only input, so every player worldwide gets the same
 * five without a server, and any past or future day can be inspected in a test.
 */
export function roundsForDate(dateKey: string): DailyLocation[] {
  const rng = createRng(`manowj-daily:${dateKey}`);
  const picked = [
    ...rng.sample(byDifficulty(1), 2),
    ...rng.sample(byDifficulty(2), 2),
    ...rng.sample(byDifficulty(3), 1),
  ];
  // Shuffled so the difficulty order isn't identical every single day, which
  // would make the fifth round predictably the hard one.
  return rng.shuffle(picked);
}

export function todaysRounds(now: Date = new Date()): DailyLocation[] {
  return roundsForDate(localDateKey(now));
}

/**
 * Puzzle number, counting from the day the game launched. Purely so the shared
 * card can say "Daily #12" the way people expect.
 */
export const DAILY_EPOCH = "2026-09-01";

export function puzzleNumber(dateKey: string): number {
  const day = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.floor((day(dateKey) - day(DAILY_EPOCH)) / 86_400_000) + 1;
}

/** Score bands, used for the result colours and the shared grid. */
export type Band = "perfect" | "great" | "good" | "fair" | "miss";

export function bandFor(score: number): Band {
  if (score >= 4750) return "perfect";
  if (score >= 3500) return "great";
  if (score >= 2000) return "good";
  if (score >= 500) return "fair";
  return "miss";
}

const BAND_SQUARE: Record<Band, string> = {
  perfect: "🟩",
  great: "🟨",
  good: "🟧",
  fair: "🟥",
  miss: "⬜",
};

/**
 * The shareable result.
 *
 * Colours only, never place names or distances. That is the whole trick behind
 * a puzzle that spreads: the card proves you played and how you did, without
 * ruining the day for the person reading it. A card that leaked the answers
 * would be posted once and then resented.
 */
export function shareText(results: RoundResult[], dateKey: string, streak: number): string {
  const total = totalScore(results);
  const grid = results.map((r) => BAND_SQUARE[bandFor(r.score)]).join("");
  const lines = [
    `maNOWj Daily #${puzzleNumber(dateKey)} — ${total.toLocaleString()}/${MAX_DAY_SCORE.toLocaleString()}`,
    grid,
  ];
  if (streak > 1) lines.push(`🔥 ${streak} day streak`);
  lines.push("https://www.manowj.com");
  return lines.join("\n");
}

export function totalScore(results: RoundResult[]): number {
  return results.reduce((sum, r) => sum + r.score, 0);
}

/** Human distance: metres under a kilometre, then whole kilometres. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/** Milliseconds until the next local midnight, for the "come back" countdown. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Guards the pool against shrinking below what a day's draw needs. */
export const POOL_SIZE = DAILY_LOCATIONS.length;
