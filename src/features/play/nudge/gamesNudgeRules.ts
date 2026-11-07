/**
 * When to tell a visitor that the site has games.
 *
 * Most people come for the map and never open the menu the games live behind,
 * so they never find out. A small card after a while of real use fixes that
 * without getting in the way of the first visit, which already has the
 * consent question and the onboarding card competing for it.
 *
 * The rules, all here so a test can hold them:
 *   - only after NUDGE_AFTER_MS of time the page was actually visible;
 *   - at most once a day, and at most MAX_NUDGES times ever;
 *   - never again once the visitor has opened the games themselves;
 *   - never on top of a dialog, the consent banner, the tour or onboarding
 *     (the component waits for those to clear rather than skipping the day).
 */

export const NUDGE_AFTER_MS = 75_000;
export const MAX_NUDGES = 3;
export const NUDGE_KEY = "manowj.play.nudge.v1";

export interface NudgeMemory {
  /** Local day (YYYY-MM-DD) the card last appeared. */
  lastDay: string | null;
  /** How many times it has appeared in total. */
  shown: number;
  /** True once the visitor opened the games, by any route. */
  played: boolean;
}

export const EMPTY_MEMORY: NudgeMemory = { lastDay: null, shown: 0, played: false };

export function dayKey(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Whether this visit may still show the card at some point. */
export function nudgeAllowedToday(memory: NudgeMemory, now: Date): boolean {
  if (memory.played) return false;
  if (memory.shown >= MAX_NUDGES) return false;
  return memory.lastDay !== dayKey(now);
}

/** Whether to show it right now. */
export function shouldNudge(memory: NudgeMemory, activeMs: number, blocked: boolean, now: Date): boolean {
  if (blocked) return false;
  if (activeMs < NUDGE_AFTER_MS) return false;
  return nudgeAllowedToday(memory, now);
}

export function readNudgeMemory(): NudgeMemory {
  try {
    const raw = localStorage.getItem(NUDGE_KEY);
    if (!raw) return { ...EMPTY_MEMORY };
    const parsed = JSON.parse(raw) as Partial<NudgeMemory>;
    return {
      lastDay: typeof parsed.lastDay === "string" ? parsed.lastDay : null,
      shown: typeof parsed.shown === "number" && parsed.shown >= 0 ? Math.floor(parsed.shown) : 0,
      played: parsed.played === true,
    };
  } catch {
    return { ...EMPTY_MEMORY };
  }
}

export function writeNudgeMemory(memory: NudgeMemory): void {
  try {
    localStorage.setItem(NUDGE_KEY, JSON.stringify(memory));
  } catch {
    // Blocked storage: the worst case is the card shows again next visit.
  }
}

export function markShown(memory: NudgeMemory, now: Date): NudgeMemory {
  return { ...memory, lastDay: dayKey(now), shown: memory.shown + 1 };
}

export function markPlayed(memory: NudgeMemory): NudgeMemory {
  return { ...memory, played: true };
}
