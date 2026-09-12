import { describe, expect, it } from "vitest";
import { onboardingVisible } from "../../src/features/onboarding/onboardingVisibility";
import {
  SURPRISE_DATE,
  TEASER_LEAD_DAYS,
  shouldShowTeaser,
  teaserVisible,
} from "../../src/features/surprise/teaserRules";

/**
 * Two things want the same first moment of a visit: the onboarding card that
 * explains what this application is, and the September teaser.
 *
 * They collided in production. The onboarding card is centred over the map at
 * z-index 12; the teaser is pinned top-right at z-index 5. On a laptop-width
 * window the card's right edge ran under the teaser and drew over it — the
 * date line was cut in half and "Don't miss it." was hidden entirely.
 *
 * Restacking would only swap which one gets covered. The fix is that they are
 * mutually exclusive, and these tests hold that rule to the pure functions
 * both components render from, so it cannot regress by someone editing one
 * component and not the other.
 */

const [MONTH, DAY] = SURPRISE_DATE.split("-").map(Number) as [number, number];
/** A date comfortably inside the teaser window, so the window is never the reason it's hidden. */
const insideWindow = new Date(2026, MONTH - 1, DAY - Math.floor(TEASER_LEAD_DAYS / 2), 12, 0, 0);
const outsideWindow = new Date(2026, MONTH - 1, DAY - TEASER_LEAD_DAYS - 10, 12, 0, 0);

describe("onboardingVisible", () => {
  it("shows for a brand-new visitor who has done nothing", () => {
    expect(onboardingVisible(false, false)).toBe(true);
  });

  it("hides once a place is selected, even by clicking the map instead of using the card", () => {
    expect(onboardingVisible(true, false)).toBe(false);
  });

  it("hides once dismissed", () => {
    expect(onboardingVisible(false, true)).toBe(false);
  });

  /*
    The consent banner renders at z-index 60; this card at 12. While both
    were on screen the banner covered the card's Dismiss button completely.
    Measured against the built app: at 390px and at 768px wide,
    document.elementFromPoint at the centre of "Dismiss" returned the consent
    banner's own text rather than the button, so the button was unclickable.
    A first-time visitor on a phone got a card over the map that would not
    close, tapped it, and concluded the app was broken. Desktop was fine,
    which is why it survived review.
  */
  it("waits while the consent banner is still asking", () => {
    expect(onboardingVisible(false, false, true)).toBe(false);
  });

  it("appears once the consent question has been answered", () => {
    expect(onboardingVisible(false, false, false)).toBe(true);
  });

  it("never reappears because consent was answered, if a place is already chosen", () => {
    expect(onboardingVisible(true, false, false)).toBe(false);
  });
});

describe("the two first-run surfaces are never on screen together", () => {
  it("holds across every combination of inputs", () => {
    const dates = [insideWindow, outsideWindow];
    const dismissedYears = [null, 2026];
    const hasLocation = [true, false];
    const onboardingDismissed = [true, false];

    let bothHiddenSeen = 0;
    let teaserSeen = 0;
    let onboardingSeen = 0;

    for (const now of dates) {
      for (const dismissedYear of dismissedYears) {
        for (const located of hasLocation) {
          for (const dismissed of onboardingDismissed) {
            const intro = onboardingVisible(located, dismissed);
            const teaser = teaserVisible(now, dismissedYear, intro);

            expect(intro && teaser).toBe(false);

            if (intro) onboardingSeen += 1;
            if (teaser) teaserSeen += 1;
            if (!intro && !teaser) bothHiddenSeen += 1;
          }
        }
      }
    }

    // Guards against the rule passing because one of them never shows at all —
    // `expect(false).toBe(false)` would be satisfied by a teaser that is simply
    // broken, which is exactly the bug this must not hide.
    expect(onboardingSeen).toBeGreaterThan(0);
    expect(teaserSeen).toBeGreaterThan(0);
    expect(bothHiddenSeen).toBeGreaterThan(0);
  });
});

describe("teaserVisible", () => {
  it("waits while the intro is up, even on a date it would otherwise show", () => {
    // The important half of the rule: in-window, not dismissed, still hidden.
    expect(shouldShowTeaser(insideWindow, null)).toBe(true);
    expect(teaserVisible(insideWindow, null, true)).toBe(false);
  });

  it("appears as soon as the intro is gone", () => {
    // The other half: waiting must not mean losing it. A visitor who dismisses
    // the intro should see the teaser, not nothing.
    expect(teaserVisible(insideWindow, null, false)).toBe(true);
  });

  it("still respects its own dismissal and its own date window", () => {
    // Suppressing it for the intro must not accidentally override the two
    // reasons it legitimately stays hidden.
    expect(teaserVisible(insideWindow, 2026, false)).toBe(false);
    expect(teaserVisible(outsideWindow, null, false)).toBe(false);
  });
});
