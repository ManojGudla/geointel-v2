import { FACTS, factsByTruth, type Fact } from "../../data/facts";
import { createRng } from "../../lib/random";
import { PLAY_URL } from "@/features/play/share";

/**
 * The two games built on the sourced claim bank.
 *
 *   Impossible or Real — one claim at a time, survival. Keep going until you
 *   get one wrong. Survival rather than a timer because the shareable result
 *   is then a single number anyone understands instantly ("I got 14"), and
 *   because it makes every single answer matter, which a 60-second format
 *   deliberately does not.
 *
 *   The Impostor — five statements, exactly one false. A different kind of
 *   thinking: not "do I know this" but "which of these five is the weak one",
 *   which rewards reasoning even when you know none of them outright.
 *
 * Both reveal the source on the answer. That is the point of building these
 * on a sourced bank rather than scraped trivia: being wrong ends in learning
 * where the real answer comes from, not just in being marked wrong.
 */

export const IMPOSTOR_STATEMENTS = 5;
export const IMPOSTOR_ROUNDS = 6;

export interface ImpostorRound {
  /** Five statements, in display order. Exactly one has isTrue === false. */
  statements: Fact[];
  /** The id of the false one. */
  impostorId: string;
}

/**
 * One round of The Impostor.
 *
 * Difficulty is mixed deliberately rather than drawn at random. A round of
 * five hard claims is unsolvable and a round of five easy ones is a formality;
 * the interesting round has a couple you are sure about, which is what lets
 * you reason your way to the one you are not.
 */
export function buildImpostorRound(seed: number | string, index: number): ImpostorRound {
  const rng = createRng(`impostor:${seed}:${index}`);
  const impostor = rng.pick(factsByTruth(false));
  const truths = rng
    .shuffle(factsByTruth(true).filter((f) => f.topic !== impostor.topic || f.difficulty !== impostor.difficulty))
    .slice(0, IMPOSTOR_STATEMENTS - 1);

  return {
    statements: rng.shuffle([impostor, ...truths]),
    impostorId: impostor.id,
  };
}

/** A run of rounds, none repeating the same false claim. */
export function buildImpostorGame(seed: number | string): ImpostorRound[] {
  const rounds: ImpostorRound[] = [];
  const usedImpostors = new Set<string>();
  for (let i = 0; rounds.length < IMPOSTOR_ROUNDS && i < IMPOSTOR_ROUNDS * 8; i++) {
    const round = buildImpostorRound(seed, i);
    if (usedImpostors.has(round.impostorId)) continue;
    usedImpostors.add(round.impostorId);
    rounds.push(round);
  }
  return rounds;
}

/**
 * The claim order for Impossible or Real.
 *
 * True and false are interleaved at a fixed alternating cadence rather than
 * shuffled, then the pairs themselves are shuffled. Pure randomness produces
 * runs — five true claims in a row teaches the player to just press REAL, and
 * the game stops being about the claims at all.
 */
export function buildRealOrFakeQueue(seed: number | string, length = 40): Fact[] {
  const rng = createRng(`realfake:${seed}`);
  const trues = rng.shuffle(factsByTruth(true));
  const falses = rng.shuffle(factsByTruth(false));

  const queue: Fact[] = [];
  let t = 0;
  let f = 0;
  for (let i = 0; queue.length < length; i++) {
    // Alternate, but flip the starting foot on each pair so the pattern is
    // not itself learnable.
    const wantTrue = rng.next() < 0.5;
    const first = wantTrue ? trues[t] : falses[f];
    if (wantTrue && first) t++;
    else if (!wantTrue && first) f++;
    if (first) queue.push(first);
    if (t >= trues.length && f >= falses.length) break;
    if (t >= trues.length) t = 0;
    if (f >= falses.length) f = 0;
    if (i > length * 4) break;
  }
  return queue;
}

// ── Scoring, shared by both ───────────────────────────────────────────────

export const REAL_BASE_POINTS = 100;
export const IMPOSTOR_BASE_POINTS = 250;

/** Survival scoring: each correct answer is worth more than the last. */
export function realOrFakePoints(streak: number): number {
  const safe = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  return REAL_BASE_POINTS + safe * 25;
}

/**
 * The Impostor scores on speed as well as correctness, because with only five
 * statements a player who reasons quickly should beat one who reads all five
 * three times over.
 */
export function impostorPoints(correct: boolean, secondsTaken: number): number {
  if (!correct) return 0;
  const speed = Math.max(0, Math.round((20 - Math.min(20, secondsTaken)) * 10));
  return IMPOSTOR_BASE_POINTS + speed;
}

export function realOrFakeShare(streak: number, best: number): string {
  const lines = [
    `maNOWj Impossible or Real — ${streak} in a row`,
    streak >= best && streak > 0 ? "New personal best" : "",
    PLAY_URL,
  ];
  return lines.filter(Boolean).join("\n");
}

export function impostorShare(score: number, found: number, rounds: number): string {
  return [
    `maNOWj The Impostor — ${score.toLocaleString()}`,
    `Caught ${found} of ${rounds}`,
    PLAY_URL,
  ].join("\n");
}

export type { Fact };
export { FACTS };
