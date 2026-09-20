/**
 * The teaser's configuration and the pure logic that decides whether it shows.
 *
 * Everything the teaser knows is here, in constants, so changing the date or
 * the window is a one-line edit rather than a hunt through a component. The
 * decision itself is a pure function so it can be tested against specific
 * dates without waiting for one to arrive.
 *
 * What the teaser deliberately does NOT contain: what the surprise is, whose
 * it is, or the word for the occasion. It says only what's below.
 */

/** MM-DD. The one line to change if the date ever moves. */
export const SURPRISE_DATE = "09-25";

/**
 * Days before the date the teaser starts appearing.
 *
 * 30 rather than 10 so it is up for the whole month leading in - at 10 days
 * it would not have surfaced until 15 September, and the point of a teaser is
 * the build-up. Still self-limiting: it disappears on its own the day after.
 */
export const TEASER_LEAD_DAYS = 30;
/** Days after the date it stops. It disappears on its own; nobody has to remove it. */
export const TEASER_TRAIL_DAYS = 1;

export const DISMISS_KEY = "manowj-surprise-teaser-dismissed";

/**
 * How long the card stays on screen before it fades out by itself.
 *
 * Five seconds is comfortably longer than the three short lines take to
 * read, and short enough that it is gone before anyone is annoyed by it
 * sitting over the map. Timing out is not the same as dismissing: it is not
 * remembered, so the card is back next visit. Only ✕ silences it for the
 * year - see SurpriseTeaser.
 */
export const TEASER_AUTO_HIDE_MS = 5000;

/** The exact copy. Nothing here is generated or varied. */
export const TEASER_COPY = {
  headline: "Something special is waiting for you.",
  date: "September 25 · 🎁",
  nudge: "Don't miss it.",
} as const;

/**
 * Days from `now` until the next occurrence of SURPRISE_DATE, using LOCAL
 * calendar dates. Negative means the date has just passed this year.
 *
 * Local rather than UTC on purpose: "September 25" means the 25th where the
 * person is, and a UTC comparison would flip the teaser on at 5:30am in India
 * and leave it up for the wrong day at the other end.
 */
export function daysUntilSurprise(now: Date): number {
  const [month, day] = SURPRISE_DATE.split("-").map(Number) as [number, number];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month - 1, day);

  const diff = Math.round((thisYear.getTime() - today.getTime()) / 86_400_000);
  // Once it's more than TEASER_TRAIL_DAYS past, measure to next year's
  // occurrence instead, so the number is always "days until the next one".
  if (diff < -TEASER_TRAIL_DAYS) {
    const nextYear = new Date(now.getFullYear() + 1, month - 1, day);
    return Math.round((nextYear.getTime() - today.getTime()) / 86_400_000);
  }
  return diff;
}

export function isWithinTeaserWindow(now: Date): boolean {
  const days = daysUntilSurprise(now);
  return days <= TEASER_LEAD_DAYS && days >= -TEASER_TRAIL_DAYS;
}

/**
 * Dismissal is remembered per occurrence, not forever - the stored value is
 * the year it was dismissed in. Dismissing it this year should not silence it
 * next year, and a single boolean would.
 */
export function readDismissedYear(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const year = Number(raw);
    return Number.isInteger(year) ? year : null;
  } catch {
    return null;
  }
}

export function writeDismissed(year: number): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(year));
  } catch {
    // Storage blocked. The teaser will come back on reload, which is a much
    // smaller problem than crashing the map.
  }
}

/** The year this occurrence belongs to (December looking ahead to January). */
export function occurrenceYear(now: Date): number {
  return daysUntilSurprise(now) >= 0 && now.getMonth() > 6 && Number(SURPRISE_DATE.split("-")[0]) < now.getMonth() + 1
    ? now.getFullYear() + 1
    : now.getFullYear();
}

export function shouldShowTeaser(now: Date, dismissedYear: number | null): boolean {
  if (!isWithinTeaserWindow(now)) return false;
  return dismissedYear !== occurrenceYear(now);
}

/**
 * The complete on-screen rule, including the one condition that lives outside
 * this module.
 *
 * The teaser is pinned to the top-right of the map; the first-run onboarding
 * card is centred and sits above it in the stacking order. On a laptop-width
 * window they overlapped, and the card cut the teaser's date line in half.
 * The intro wins - it is what a brand-new visitor needs - so the teaser waits
 * until the intro is gone rather than fighting it for the same pixels.
 *
 * Pure and taking the flag as an argument, so a test can prove the two are
 * never on screen at once. See tests/unit/firstRunSurfaces.test.ts.
 */
export function teaserVisible(
  now: Date,
  dismissedYear: number | null,
  isOnboardingVisible: boolean
): boolean {
  if (isOnboardingVisible) return false;
  return shouldShowTeaser(now, dismissedYear);
}
