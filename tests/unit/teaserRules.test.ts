import { describe, expect, it } from "vitest";
import {
  SURPRISE_DATE,
  TEASER_COPY,
  TEASER_LEAD_DAYS,
  daysUntilSurprise,
  isWithinTeaserWindow,
  occurrenceYear,
  shouldShowTeaser,
} from "@/features/surprise/teaserRules";

/** Local-time date, matching how the teaser reasons about "today". */
const on = (y: number, m: number, d: number, hour = 12) => new Date(y, m - 1, d, hour);

describe("surprise teaser window", () => {
  it("targets 25 September", () => {
    expect(SURPRISE_DATE).toBe("09-25");
  });

  it("counts down correctly", () => {
    expect(daysUntilSurprise(on(2026, 9, 25))).toBe(0);
    expect(daysUntilSurprise(on(2026, 9, 24))).toBe(1);
    expect(daysUntilSurprise(on(2026, 9, 18))).toBe(7);
    expect(daysUntilSurprise(on(2026, 9, 26))).toBe(-1);
  });

  it("is hidden well before the window opens", () => {
    expect(isWithinTeaserWindow(on(2026, 6, 15))).toBe(false);
    expect(isWithinTeaserWindow(on(2026, 1, 1))).toBe(false);
    expect(isWithinTeaserWindow(on(2026, 8, 20))).toBe(false);
  });

  it("opens exactly TEASER_LEAD_DAYS before, and not a day earlier", () => {
    const opensOn = new Date(2026, 8, 25);
    opensOn.setDate(opensOn.getDate() - TEASER_LEAD_DAYS);
    const dayBefore = new Date(opensOn);
    dayBefore.setDate(dayBefore.getDate() - 1);
    expect(isWithinTeaserWindow(opensOn)).toBe(true);
    expect(isWithinTeaserWindow(dayBefore)).toBe(false);
  });

  it("is up through the whole run-in, including early September", () => {
    // The lead time is set so the teaser is showing for the month before —
    // a teaser nobody sees until the last week isn't a teaser.
    for (const day of [26, 30]) expect(isWithinTeaserWindow(on(2026, 8, day))).toBe(true);
    for (const day of [1, 4, 10, 20, 24]) expect(isWithinTeaserWindow(on(2026, 9, day))).toBe(true);
  });

  it("is visible on the day itself", () => {
    expect(isWithinTeaserWindow(on(2026, 9, 25, 0))).toBe(true);
    expect(isWithinTeaserWindow(on(2026, 9, 25, 23))).toBe(true);
  });

  it("hides itself again after the date without anyone removing it", () => {
    expect(isWithinTeaserWindow(on(2026, 9, 26))).toBe(true); // one trailing day
    expect(isWithinTeaserWindow(on(2026, 9, 27))).toBe(false);
    expect(isWithinTeaserWindow(on(2026, 10, 5))).toBe(false);
  });

  it("comes back for the next year, not just once ever", () => {
    expect(isWithinTeaserWindow(on(2027, 9, 20))).toBe(true);
    expect(isWithinTeaserWindow(on(2030, 9, 25))).toBe(true);
  });

  it("measures to next year's date once this year's has passed", () => {
    expect(daysUntilSurprise(on(2026, 11, 1))).toBeGreaterThan(300);
  });
});

describe("teaser dismissal", () => {
  it("shows when never dismissed", () => {
    expect(shouldShowTeaser(on(2026, 9, 20), null)).toBe(true);
  });

  it("stays hidden for the rest of this year's window once dismissed", () => {
    const year = occurrenceYear(on(2026, 9, 20));
    expect(shouldShowTeaser(on(2026, 9, 20), year)).toBe(false);
    expect(shouldShowTeaser(on(2026, 9, 25), year)).toBe(false);
  });

  it("returns next year even though it was dismissed this year", () => {
    expect(shouldShowTeaser(on(2027, 9, 20), 2026)).toBe(true);
  });

  it("never shows outside the window, dismissed or not", () => {
    expect(shouldShowTeaser(on(2026, 3, 1), null)).toBe(false);
  });
});

describe("teaser copy", () => {
  const all = Object.values(TEASER_COPY).join(" ").toLowerCase();

  it("says exactly the three approved lines", () => {
    expect(TEASER_COPY.headline).toBe("Something special is waiting for you.");
    expect(TEASER_COPY.date).toBe("September 25 · 🎁");
    expect(TEASER_COPY.nudge).toBe("Don't miss it.");
  });

  it("does not give the surprise away", () => {
    for (const forbidden of ["birthday", "happy birthday", "celebration", "celebrate", "manoj", "gift for", "anniversary", "party"]) {
      expect(all).not.toContain(forbidden);
    }
  });
});
