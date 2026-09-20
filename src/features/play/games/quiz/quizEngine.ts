import { COUNTRIES, type Country, type Region } from "../../data/world";
import { createRng, type Rng } from "../../lib/random";

/**
 * One question generator shared by every quiz in the hub - World Quiz, Flag
 * Quiz and the quiz leg of the Daily Challenge all come out of here.
 *
 * Distractors are drawn from the SAME region as the answer wherever there are
 * enough countries to do it. That's the difference between a quiz and a
 * giveaway: "capital of France - Paris, Tokyo, Nairobi, Lima" answers itself,
 * "Paris, Berlin, Madrid, Rome" actually asks you something.
 */

export type QuizKind = "capital" | "country-of-capital" | "flag" | "region";

export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  prompt: string;
  /** Shown large above the options when the question is visual (a flag). */
  display?: string;
  /**
   * ISO code of the flag to show above the question, when there is one.
   *
   * This used to be a flag emoji inside `display`, which meant the engine
   * decided how the flag was drawn. It no longer does: the engine names the
   * country and the component renders the image (see components/Flag.tsx).
   * The split matters because the emoji did not render at all on Windows.
   */
  flagCode?: string;
  options: string[];
  answer: string;
  /** One honest line of context revealed after answering. */
  explanation: string;
}

const OPTION_COUNT = 4;

function distractors(rng: Rng, pool: readonly Country[], answer: Country, valueOf: (c: Country) => string): string[] {
  const answerValue = valueOf(answer);
  const sameRegion = pool.filter((c) => c.region === answer.region && valueOf(c) !== answerValue);
  const rest = pool.filter((c) => c.region !== answer.region && valueOf(c) !== answerValue);

  const picked: string[] = [];
  const seen = new Set<string>([answerValue]);

  for (const c of [...rng.shuffle(sameRegion), ...rng.shuffle(rest)]) {
    const v = valueOf(c);
    if (seen.has(v)) continue;
    seen.add(v);
    picked.push(v);
    if (picked.length === OPTION_COUNT - 1) break;
  }
  return picked;
}

function buildQuestion(rng: Rng, kind: QuizKind, pool: readonly Country[], index: number): QuizQuestion {
  const answerCountry = rng.pick(pool);

  switch (kind) {
    case "capital": {
      const options = rng.shuffle([answerCountry.capital, ...distractors(rng, pool, answerCountry, (c) => c.capital)]);
      return {
        id: `capital-${answerCountry.code}-${index}`,
        kind,
        prompt: `What is the capital of ${answerCountry.name}?`,
        flagCode: answerCountry.code,
        options,
        answer: answerCountry.capital,
        explanation: `${answerCountry.capital} is the capital of ${answerCountry.name} (${answerCountry.region}).`,
      };
    }
    case "country-of-capital": {
      const options = rng.shuffle([answerCountry.name, ...distractors(rng, pool, answerCountry, (c) => c.name)]);
      return {
        id: `country-${answerCountry.code}-${index}`,
        kind,
        prompt: `${answerCountry.capital} is the capital of which country?`,
        options,
        answer: answerCountry.name,
        explanation: `${answerCountry.capital} is the capital of ${answerCountry.name}.`,
      };
    }
    case "flag": {
      const options = rng.shuffle([answerCountry.name, ...distractors(rng, pool, answerCountry, (c) => c.name)]);
      return {
        id: `flag-${answerCountry.code}-${index}`,
        kind,
        prompt: "Which country's flag is this?",
        flagCode: answerCountry.code,
        options,
        answer: answerCountry.name,
        // No flag in the explanation text - the answer is already named here,
        // and the component shows the flag beside it.
        explanation: `That is the flag of ${answerCountry.name}, capital ${answerCountry.capital}.`,
      };
    }
    case "region": {
      const regions: Region[] = ["Africa", "Americas", "Asia", "Europe", "Oceania"];
      const options = rng.shuffle([
        answerCountry.region,
        ...rng.shuffle(regions.filter((r) => r !== answerCountry.region)).slice(0, OPTION_COUNT - 1),
      ]);
      return {
        id: `region-${answerCountry.code}-${index}`,
        kind,
        prompt: `Which region is ${answerCountry.name} in?`,
        flagCode: answerCountry.code,
        options,
        answer: answerCountry.region,
        explanation: `${answerCountry.name} is in ${answerCountry.region}.`,
      };
    }
  }
}

export interface QuizOptions {
  count: number;
  kinds: QuizKind[];
  region?: Region;
  seed: number | string;
}

/**
 * A whole round. Questions never repeat the same answer country inside one
 * round - being asked about France three times in five questions feels broken
 * even though it's technically random.
 */
export function buildQuiz({ count, kinds, region, seed }: QuizOptions): QuizQuestion[] {
  const rng = createRng(seed);
  const pool = region ? COUNTRIES.filter((c) => c.region === region) : COUNTRIES;
  if (pool.length < OPTION_COUNT) return [];

  const questions: QuizQuestion[] = [];
  const usedCountryKeys = new Set<string>();

  // Bounded rather than while(true): with a small region pool it is possible
  // to run out of distinct countries, and the round should come up short
  // rather than spin.
  for (let attempt = 0; attempt < count * 12 && questions.length < count; attempt++) {
    const kind = kinds[questions.length % kinds.length]!;
    const q = buildQuestion(rng, kind, pool, questions.length);
    const key = q.id.split("-").slice(0, 2).join("-");
    if (usedCountryKeys.has(key)) continue;
    usedCountryKeys.add(key);
    questions.push(q);
  }

  return questions;
}

/** Points per correct answer, with a bonus for answering quickly. */
export function scoreAnswer(correct: boolean, secondsTaken: number): number {
  if (!correct) return 0;
  const speedBonus = Math.max(0, Math.round(10 - secondsTaken));
  return 10 + speedBonus;
}

// ── Hints ─────────────────────────────────────────────────────────────────

/**
 * The 50/50: two wrong options are removed, leaving the answer and one decoy.
 *
 * Priced rather than free. A free 50/50 doubles everyone's expected score by
 * the same amount, which changes nothing except making every score bigger and
 * less meaningful. Charging for it makes pressing the button a decision: take
 * the help and score less, or back yourself and score full.
 *
 * `pickIndex` is injectable so a test can pin which decoy survives instead of
 * depending on Math.random.
 */
export const FIFTY_FIFTY_COST = 0.5;

export function fiftyFifty(
  question: QuizQuestion,
  pickIndex: (count: number) => number = (n) => Math.floor(Math.random() * n)
): string[] {
  const wrong = question.options.filter((o) => o !== question.answer);
  if (wrong.length === 0) return question.options;
  const keeper = wrong[pickIndex(wrong.length)]!;
  // Returned in the ORIGINAL order: reshuffling would move the answer under
  // the player's finger and make the hint feel like a trick.
  return question.options.filter((o) => o === question.answer || o === keeper);
}

/** Score after a 50/50, if one was used on this question. */
export function applyHint(score: number, usedFiftyFifty: boolean): number {
  return usedFiftyFifty ? Math.round(score * (1 - FIFTY_FIFTY_COST)) : score;
}

/**
 * A free nudge that costs nothing because it gives nothing away: the first
 * letter of the answer is already visible in the options list.
 */
export function firstLetterHint(question: QuizQuestion): string {
  return `The answer begins with "${question.answer.trim().charAt(0).toUpperCase()}".`;
}
