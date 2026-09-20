import { COUNTRIES } from "../../data/world";
import { createRng } from "../../lib/random";

/**
 * Geo Memory - match each flag to its country's name.
 *
 * It used to pair a flag with an identical flag, which was a pure memory
 * exercise that taught nothing: you could clear a whole board without knowing
 * a single country. Pairing FLAG to NAME means finishing the board means you
 * matched twenty flags to twenty countries, and you come away actually knowing
 * some of them. Same rules, same feel, real content.
 *
 * Scored on moves and time, so there is something to beat, with a peek hint
 * that costs points rather than being free.
 */

export interface Card {
  id: number;
  /** Cards with the same pairId match. */
  pairId: string;
  /**
   * Which half of the pair this card is. One card of every pair shows the
   * flag and the other shows the country's name, so a match is an act of
   * recognition rather than of spotting two identical pictures.
   */
  face: "flag" | "name";
  /** ISO code, so the board can render a real flag image rather than emoji. */
  code: string;
  country: string;
  flipped: boolean;
  matched: boolean;
}

export type GridSize = 12 | 16 | 20;

export const GRID_LABEL: Record<GridSize, string> = {
  12: "Easy · 6 pairs",
  16: "Normal · 8 pairs",
  20: "Hard · 10 pairs",
};

/** Columns to lay the grid out in, chosen so the board stays roughly square. */
export const GRID_COLUMNS: Record<GridSize, number> = { 12: 4, 16: 4, 20: 5 };

export function buildDeck(size: GridSize, seed: number | string): Card[] {
  const rng = createRng(seed);
  const pairs = size / 2;
  const picked = rng.sample(COUNTRIES, pairs);

  const cards: Card[] = [];
  picked.forEach((country) => {
    for (const face of ["flag", "name"] as const) {
      cards.push({
        id: cards.length,
        pairId: country.code,
        face,
        code: country.code,
        country: country.name,
        flipped: false,
        matched: false,
      });
    }
  });

  // Shuffle, then reassign ids by position so `id` is always the board index.
  return rng.shuffle(cards).map((card, index) => ({ ...card, id: index }));
}

export interface FlipResult {
  cards: Card[];
  /** Set when this flip completed a pair. */
  matched: boolean;
  /** Set when two cards are face up and do NOT match - the UI hides them. */
  mismatch: boolean;
  /** Counts a completed attempt (two cards turned), not every tap. */
  movesDelta: number;
}

/**
 * Flips one card. Pure - the caller holds the board and the timer.
 *
 * Deliberately refuses a third flip while two unmatched cards are face up:
 * without that, rapid clicking turns the whole board over and the game
 * becomes unplayable rather than just easy.
 */
export function flipCard(cards: Card[], id: number): FlipResult {
  const faceUp = cards.filter((c) => c.flipped && !c.matched);
  const target = cards.find((c) => c.id === id);

  const unchanged: FlipResult = { cards, matched: false, mismatch: false, movesDelta: 0 };
  if (!target || target.matched || target.flipped) return unchanged;
  if (faceUp.length >= 2) return unchanged;

  const next = cards.map((c) => (c.id === id ? { ...c, flipped: true } : c));
  const nowFaceUp = next.filter((c) => c.flipped && !c.matched);
  if (nowFaceUp.length < 2) return { cards: next, matched: false, mismatch: false, movesDelta: 0 };

  const [a, b] = nowFaceUp as [Card, Card];
  if (a.pairId === b.pairId) {
    return {
      cards: next.map((c) => (c.pairId === a.pairId ? { ...c, matched: true } : c)),
      matched: true,
      mismatch: false,
      movesDelta: 1,
    };
  }
  return { cards: next, matched: false, mismatch: true, movesDelta: 1 };
}

/** Turns the two unmatched face-up cards back over. */
export function hideUnmatched(cards: Card[]): Card[] {
  return cards.map((c) => (c.matched ? c : { ...c, flipped: false }));
}

export function isComplete(cards: Card[]): boolean {
  return cards.length > 0 && cards.every((c) => c.matched);
}

/**
 * Score rewards both efficiency and speed, with a floor so a slow, careful
 * win is still worth something. A perfect game (no wasted moves) on the
 * biggest board scores highest.
 */
export function memoryScore(size: GridSize, moves: number, seconds: number): number {
  const pairs = size / 2;
  const perfectMoves = pairs;
  const movePenalty = Math.max(0, moves - perfectMoves) * 25;
  const timePenalty = Math.round(seconds) * 4;
  return Math.max(50, pairs * 220 - movePenalty - timePenalty);
}


/**
 * The peek hint: every unmatched card turns face up for a moment.
 *
 * Priced rather than free. A free peek would let anyone clear the board
 * instantly and every score would be identical, which makes the score
 * meaningless - the same reason Country Hunt charges for its hints. The cost
 * below is a flat share of the final score, applied once however long you
 * look, so it is one decision rather than a thing to spam.
 */
export const PEEK_COST_FRACTION = 0.35;
export const PEEK_MS = 1400;

/** Score after a peek, if one was taken. Never below the floor. */
export function applyPeek(score: number, peeked: boolean): number {
  if (!peeked) return score;
  return Math.max(50, Math.round(score * (1 - PEEK_COST_FRACTION)));
}

/** Turns every unmatched card face up. The caller hides them again after PEEK_MS. */
export function peekAll(cards: Card[]): Card[] {
  return cards.map((c) => (c.matched ? c : { ...c, flipped: true }));
}
