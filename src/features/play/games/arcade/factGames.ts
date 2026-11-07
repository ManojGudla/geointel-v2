import { FACTS, factsByTruth, type Fact } from "../../data/facts";
import { createRng } from "../../lib/random";
import { PLAY_URL } from "@/features/play/share";

/**
 * The two games built on the sourced claim bank.
 *
 *   Impossible or Real - one claim at a time, survival. Keep going until you
 *   get one wrong. Survival rather than a timer because the shareable result
 *   is then a single number anyone understands instantly ("I got 14"), and
 *   because it makes every single answer matter, which a 60-second format
 *   deliberately does not.
 *
 *   The Impostor - five statements, exactly one false. A different kind of
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

// ── Scoring ───────────────────────────────────────────────────────────────

export const IMPOSTOR_BASE_POINTS = 250;

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

export function impostorShare(score: number, found: number, rounds: number): string {
  return [
    `maNOWj The Impostor: ${score.toLocaleString()}`,
    `Caught ${found} of ${rounds}`,
    PLAY_URL,
  ].join("\n");
}

export type { Fact };
export { FACTS };
