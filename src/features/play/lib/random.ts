/**
 * A small, seedable random number generator.
 *
 * Math.random() would be fine for a casual round, but the Daily Challenge has
 * to give every player on a given date the SAME questions — otherwise
 * comparing scores is meaningless and the shared result card is a lie. A
 * seeded generator makes the day's round reproducible from nothing but the
 * date, with no server involved.
 *
 * mulberry32: 32-bit state, well-distributed, a handful of instructions.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns any string into a 32-bit seed (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  next: () => number;
  int: (maxExclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** Fisher-Yates. Returns a new array; never mutates the input. */
  shuffle: <T>(items: readonly T[]) => T[];
  /** `count` distinct items, or all of them if the pool is smaller. */
  sample: <T>(items: readonly T[], count: number) => T[];
}

export function createRng(seed: number | string): Rng {
  const next = mulberry32(typeof seed === "string" ? hashSeed(seed) : seed);
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };

  return {
    next,
    int,
    pick: (items) => items[int(items.length)]!,
    shuffle,
    sample: (items, count) => shuffle(items).slice(0, Math.min(count, items.length)),
  };
}

/**
 * The local calendar date as YYYY-MM-DD. Local, not UTC: a daily challenge
 * that flips at midnight UTC would change at 5:30am for players in India,
 * which is not what "today's challenge" means to them.
 */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
