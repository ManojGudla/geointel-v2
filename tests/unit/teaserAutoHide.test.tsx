import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SurpriseTeaser } from "@/features/surprise/SurpriseTeaser";
import { DISMISS_KEY, TEASER_AUTO_HIDE_MS, TEASER_COPY } from "@/features/surprise/teaserRules";

/**
 * The card leaves on its own after a few seconds.
 *
 * The three cases below are the ones that can each fail silently: it never
 * leaves (clutter over the map), it leaves for good (the teaser is spent on
 * one visit), or the clock runs while the card is hidden behind the first-run
 * intro, so the people it exists for never see it at all.
 */

const onboardingUp = vi.hoisted(() => ({ value: false }));

vi.mock("@/features/onboarding/onboardingVisibility", () => ({
  useOnboardingVisible: () => onboardingUp.value,
}));

// Inside the teaser's own window, and comfortably before the date.
const DURING_WINDOW = new Date(2026, 8, 10, 12, 0, 0);

beforeEach(() => {
  onboardingUp.value = false;
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(DURING_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const fullExit = () => TEASER_AUTO_HIDE_MS + 400;

describe("the teaser's auto-hide", () => {
  it("is on screen at first and gone a few seconds later", () => {
    render(<SurpriseTeaser />);
    expect(screen.getByText(TEASER_COPY.headline)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(fullExit());
    });
    expect(screen.queryByText(TEASER_COPY.headline)).toBeNull();
  });

  it("leaving on its own is not remembered — only ✕ is", () => {
    render(<SurpriseTeaser />);
    act(() => {
      vi.advanceTimersByTime(fullExit());
    });

    // Nothing written, so the next visit shows it again. Dismissing stores
    // the occurrence year; timing out must not.
    expect(localStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it("does not run the clock while the first-run intro is covering it", () => {
    onboardingUp.value = true;
    const view = render(<SurpriseTeaser />);
    expect(screen.queryByText(TEASER_COPY.headline)).toBeNull();

    // Someone spends a while reading the intro.
    act(() => {
      vi.advanceTimersByTime(fullExit());
    });

    // Intro dismissed: the card gets its full five seconds, starting now.
    onboardingUp.value = false;
    view.rerender(<SurpriseTeaser />);
    expect(screen.getByText(TEASER_COPY.headline)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(fullExit());
    });
    expect(screen.queryByText(TEASER_COPY.headline)).toBeNull();
  });
});
