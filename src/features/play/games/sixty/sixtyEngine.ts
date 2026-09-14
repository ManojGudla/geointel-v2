import { COUNTRIES, haversineKm, type Country } from "../../data/world";
import { createRng, type Rng } from "../../lib/random";
import { buildQuiz, type QuizQuestion } from "../quiz/quizEngine";
import { PLAY_URL } from "@/features/play/share";

/**
 * 60 Seconds — one minute, as many questions as you can take.
 *
 * ── What makes this different from the quiz that already exists ───────────
 *
 * World Quiz asks ten questions of one kind and waits for you. This asks
 * whatever comes next and does not wait for anybody. Three decisions carry
 * the whole thing, and each is here because the obvious alternative is
 * boring:
 *
 *   The question TYPE changes constantly. A minute of "what is the capital
 *   of..." becomes a chore by question five, because after the first one you
 *   already know the shape of every question that follows. Rotating between
 *   six kinds — including two-option comparisons that are read in a second
 *   and four-option recalls that take longer — keeps the rhythm uneven, and
 *   uneven is what keeps attention.
 *
 *   A wrong answer costs TIME, not points. Losing points is arithmetic that
 *   happens somewhere off screen. Watching four seconds vanish off a clock
 *   you are racing is felt immediately, and it makes a guess a real decision
 *   rather than a free roll.
 *
 *   The streak multiplier is shown BEFORE it is earned. The number on screen
 *   is what the next correct answer is worth, so a run of six feels like it
 *   is building towards something instead of being totted up at the end.
 *
 * ── On where the questions come from ─────────────────────────────────────
 *
 * Every question is computed from the bundled country dataset: capitals,
 * coordinates and regions. Nothing is asserted trivia. That is deliberate —
 * this product's whole claim is that what it tells you is traceable to a
 * source, and a game inside it that confidently states unsourced facts would
 * quietly undermine that everywhere else.
 */

export const ROUND_SECONDS = 60;
export const BASE_POINTS = 100;

/** Seconds removed for a wrong answer. The main pressure in the game. */
export const WRONG_PENALTY_SECONDS = 4;

/**
 * Seconds returned for a correct one. Small on purpose: enough that a good
 * run feels like it is sustaining itself, far too small to let anyone play
 * forever. The clock is also capped at its starting value so a strong streak
 * cannot extend the round beyond a minute.
 */
export const CORRECT_BONUS_SECONDS = 1;

export const MULTIPLIER_STEP = 0.15;
export const MAX_MULTIPLIER = 3;

/**
 * What the next correct answer is worth, given the run you are already on.
 *
 * Based on the streak BEFORE the answer, not after, so the figure displayed
 * on screen is exactly what gets added. A multiplier that silently counts the
 * answer you have not given yet reads as the game shortchanging you.
 */
export function multiplierFor(streak: number): number {
  const safe = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  return Math.min(MAX_MULTIPLIER, Math.round((1 + safe * MULTIPLIER_STEP) * 100) / 100);
}

export function pointsFor(streak: number): number {
  return Math.round(BASE_POINTS * multiplierFor(streak));
}

export interface SixtyState {
  score: number;
  streak: number;
  longestStreak: number;
  correct: number;
  answered: number;
  remainingMs: number;
}

export function initialState(): SixtyState {
  return {
    score: 0,
    streak: 0,
    longestStreak: 0,
    correct: 0,
    answered: 0,
    remainingMs: ROUND_SECONDS * 1000,
  };
}

/**
 * The whole game rule set, as one pure function.
 *
 * Kept free of timers and React so the scoring can be tested exactly rather
 * than by driving a clock — the Ultimate Tic-Tac-Toe freeze earlier in this
 * project came from logic tangled up with an effect, and it passed every test
 * that existed at the time.
 */
export function applyAnswer(state: SixtyState, correct: boolean): SixtyState {
  if (correct) {
    const streak = state.streak + 1;
    return {
      score: state.score + pointsFor(state.streak),
      streak,
      longestStreak: Math.max(state.longestStreak, streak),
      correct: state.correct + 1,
      answered: state.answered + 1,
      // Capped at the starting clock: the bonus should reward a run, not
      // hand out an unbounded round to whoever is fastest.
      remainingMs: Math.min(ROUND_SECONDS * 1000, state.remainingMs + CORRECT_BONUS_SECONDS * 1000),
    };
  }
  return {
    ...state,
    streak: 0,
    answered: state.answered + 1,
    remainingMs: Math.max(0, state.remainingMs - WRONG_PENALTY_SECONDS * 1000),
  };
}

export function accuracy(state: SixtyState): number {
  return state.answered === 0 ? 0 : Math.round((state.correct / state.answered) * 100);
}

// ── Question types unique to this game ────────────────────────────────────

/**
 * Two-option comparisons, which exist to break the rhythm of four-option
 * recall. They are read and answered in about a second, so mixing them in
 * makes the pace lurch rather than settle.
 *
 * Both are generated with a MINIMUM GAP between the two candidates. Without
 * it the generator eventually produces a pair separated by half a degree of
 * latitude, which is not a question, it is a coin toss with a scoreboard —
 * and being punished four seconds for losing a coin toss is the fastest way
 * to make someone stop playing.
 */
const MIN_LATITUDE_GAP_DEGREES = 6;
const MIN_DISTANCE_RATIO = 1.35;

function furtherNorth(rng: Rng, index: number): QuizQuestion | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = rng.pick(COUNTRIES);
    const b = rng.pick(COUNTRIES);
    if (a.code === b.code) continue;
    if (Math.abs(a.lat - b.lat) < MIN_LATITUDE_GAP_DEGREES) continue;
    const north = a.lat > b.lat ? a : b;
    const south = a.lat > b.lat ? b : a;
    return {
      id: `north-${north.code}-${south.code}-${index}`,
      kind: "capital", // reuses the shared question shape
      prompt: "Which capital is further north?",
      options: rng.shuffle([a.capital, b.capital]),
      answer: north.capital,
      explanation: `${north.capital} sits at ${north.lat.toFixed(1)}°, ${south.capital} at ${south.lat.toFixed(1)}°.`,
    };
  }
  return null;
}

function closerTo(rng: Rng, index: number): QuizQuestion | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const anchor = rng.pick(COUNTRIES);
    const a = rng.pick(COUNTRIES);
    const b = rng.pick(COUNTRIES);
    if (new Set([anchor.code, a.code, b.code]).size < 3) continue;
    const da = haversineKm(anchor.lat, anchor.lon, a.lat, a.lon);
    const db = haversineKm(anchor.lat, anchor.lon, b.lat, b.lon);
    const [near, far, nearKm, farKm] = da < db ? [a, b, da, db] : [b, a, db, da];
    if (nearKm <= 0 || farKm / nearKm < MIN_DISTANCE_RATIO) continue;
    return {
      id: `closer-${anchor.code}-${near.code}-${index}`,
      kind: "region",
      prompt: `Which is closer to ${anchor.capital}?`,
      flagCode: anchor.code,
      options: rng.shuffle([a.capital, b.capital]),
      answer: near.capital,
      explanation: `${near.capital} is about ${Math.round(nearKm).toLocaleString()} km away; ${far.capital} is about ${Math.round(farKm).toLocaleString()} km.`,
    };
  }
  return null;
}

/**
 * The queue for one round.
 *
 * Built long and up front — far more questions than a minute allows — so the
 * game never pauses to generate one mid-round, and so a fast player is never
 * the one who discovers the queue can run out.
 *
 * Comparisons are placed at a fixed cadence rather than shuffled in at
 * random, because randomness clumps: a genuinely random mix regularly deals
 * four comparisons in a row, and the variety that is the entire point of the
 * game disappears exactly when it is being relied on.
 */
export function buildQueue(seed: number | string, length = 80): QuizQuestion[] {
  const rng = createRng(`sixty:${seed}`);
  const standard = buildQuiz({
    count: length,
    kinds: ["capital", "country-of-capital", "flag", "region"],
    seed: `sixty-standard:${seed}`,
  });

  const queue: QuizQuestion[] = [];
  let standardIndex = 0;

  for (let i = 0; queue.length < length && i < length * 3; i++) {
    // Every third slot is a two-option comparison.
    const wantComparison = i % 3 === 2;
    if (wantComparison) {
      const built = i % 6 === 2 ? furtherNorth(rng, i) : closerTo(rng, i);
      if (built) {
        queue.push(built);
        continue;
      }
      // Fall through to a standard question rather than leaving a gap.
    }
    const next = standard[standardIndex++];
    if (next) queue.push(next);
    else if (standardIndex > standard.length) break;
  }

  return queue;
}

export function shareText(state: SixtyState, best: number): string {
  const lines = [
    `maNOWj 60 Seconds — ${state.score.toLocaleString()}`,
    `🔥 ${state.longestStreak} best streak · ${accuracy(state)}% accurate · ${state.correct}/${state.answered}`,
  ];
  if (state.score >= best && state.score > 0) lines.push("New personal best");
  lines.push(PLAY_URL);
  return lines.join("\n");
}

/** Clock text, always mm:ss so the digits don't jump width mid-round. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(total).padStart(2, "0")}`;
}

export type { Country };
