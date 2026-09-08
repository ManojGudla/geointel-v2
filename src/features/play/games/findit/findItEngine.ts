import { createRng } from "../../lib/random";

/**
 * Find It — one target hidden in a field of look-alikes, against the clock.
 *
 * Pure visual search and reflex: nothing is asked and nothing is known in
 * advance. It gets harder the further you get, in three ways at once — more
 * decoys, decoys that look more like the target, and less time per round.
 * That's what makes it worth replaying rather than a fixed puzzle.
 */

/** Grouped so a level can draw decoys that are genuinely easy to confuse. */
const FAMILIES: string[][] = [
  ["📍", "📌", "🔴", "🟥", "🚩", "🎯"],
  ["🏠", "🏡", "🏘️", "🏚️", "🏢", "🏬"],
  ["🌲", "🌳", "🌴", "🎄", "🌵", "🪴"],
  ["🚗", "🚕", "🚙", "🚐", "🛻", "🚚"],
  ["⛰️", "🏔️", "🗻", "🌋", "🏕️", "🏞️"],
  ["🛥️", "⛵", "🚤", "🛳️", "⚓", "🚢"],
  ["✈️", "🛩️", "🚁", "🛸", "🪂", "🎈"],
  ["🏥", "🏦", "🏫", "🏛️", "⛪", "🕌"],
];

export interface Level {
  /** The icon to find. */
  target: string;
  /** Every cell on the board, exactly one of which is the target. */
  cells: string[];
  columns: number;
  /** Milliseconds allowed for this level. */
  timeMs: number;
  /** Index of the target in `cells`. */
  targetIndex: number;
}

/** Grid grows with the level, capped so cells stay tappable on a phone. */
function gridFor(level: number): { count: number; columns: number } {
  if (level <= 2) return { count: 12, columns: 4 };
  if (level <= 4) return { count: 20, columns: 5 };
  if (level <= 7) return { count: 30, columns: 6 };
  if (level <= 10) return { count: 42, columns: 7 };
  return { count: 56, columns: 8 };
}

/** Time shrinks with level but never below something a person can do. */
export function timeForLevel(level: number): number {
  return Math.max(2600, 7000 - level * 380);
}

export function buildLevel(level: number, seed: number | string): Level {
  const rng = createRng(`${seed}-${level}`);
  const { count, columns } = gridFor(level);

  const family = rng.pick(FAMILIES);
  const target = rng.pick(family);

  // Early levels mix in icons from other families, which are easy to skip
  // past. Later levels draw decoys only from the target's own family, so you
  // genuinely have to look at each one.
  const sameFamilyOnly = level >= 5;
  const decoyPool = sameFamilyOnly
    ? family.filter((e) => e !== target)
    : [...family.filter((e) => e !== target), ...FAMILIES.flat().filter((e) => e !== target)];

  const cells = Array.from({ length: count }, () => rng.pick(decoyPool));
  const targetIndex = rng.int(count);
  cells[targetIndex] = target;

  return { target, cells, columns, timeMs: timeForLevel(level), targetIndex };
}

/**
 * Points for finding it. Faster is worth more, and later levels are worth
 * more because they're harder — but every successful find scores something,
 * so a slow correct answer still beats a miss.
 */
export function scoreFind(level: number, msTaken: number, allowedMs: number): number {
  const speed = Math.max(0, 1 - msTaken / allowedMs);
  return Math.round(60 + level * 12 + speed * 140);
}
