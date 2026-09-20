/**
 * Levels and XP.
 *
 * The rule this follows: XP is only ever awarded for something that actually
 * happened. There is no XP for opening the hub, no daily login bonus, no
 * "welcome" grant. If the number goes up, you played a round.
 *
 * The curve is a gentle quadratic - each level costs a bit more than the last,
 * so early levels come quickly (which is what makes a new player keep going)
 * without the later ones becoming a grind that nobody reaches.
 */

/** Total XP needed to have reached a given level. Level 1 starts at 0. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 50 * n * (n + 1); // 100, 300, 600, 1000, 1500, ...
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  intoLevel: number;
  /** XP the current level spans. */
  levelSpan: number;
  /** 0-1, for the progress bar. */
  fraction: number;
  xpToNext: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const levelSpan = next - base;
  const intoLevel = xp - base;
  return {
    level,
    intoLevel,
    levelSpan,
    fraction: levelSpan > 0 ? intoLevel / levelSpan : 0,
    xpToNext: next - xp,
  };
}

/**
 * XP for one finished round.
 *
 * Deliberately modest and bounded: the point is to mark progress, not to be
 * a currency. Losing still earns a little, because a game that gives you
 * nothing for trying is a game people stop opening.
 */
export function xpForRound(input: { score: number; won?: boolean; perfect?: boolean }): number {
  const base = Math.max(0, Math.round(input.score / 10));
  const winBonus = input.won ? 25 : 5;
  const perfectBonus = input.perfect ? 40 : 0;
  return Math.min(300, base + winBonus + perfectBonus);
}
