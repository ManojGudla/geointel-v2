import { useEffect, useState } from "react";
import { useOnboardingVisible } from "@/features/onboarding/onboardingVisibility";
import {
  TEASER_COPY,
  TEASER_AUTO_HIDE_MS,
  occurrenceYear,
  readDismissedYear,
  shouldShowTeaser,
  writeDismissed,
} from "./teaserRules";
import "./SurpriseTeaser.css";

/**
 * A small card in the top-right of the map, shown only in the days around the
 * date, dismissible, and gone on its own afterwards.
 *
 * It says three lines and nothing else. It does not name the occasion, say
 * whose it is, or hint at what the surprise is — that's the entire point of a
 * teaser, and a card that explains itself isn't one.
 *
 * It also gets out of the way: it never blocks a map click except on its own
 * two buttons, it sits below every panel and dialog in the stacking order,
 * and it can be dismissed permanently for this year in one press.
 *
 * Sitting below everything is why it waits for the first-run onboarding card.
 * Both are pinned over the map, and on a laptop-width window the card drew
 * over this one and cut its date line in half. The intro is what a brand-new
 * visitor needs first, so this holds until the intro is gone — the window
 * state below is kept, so it appears the moment that happens rather than
 * being lost. The rule itself is `teaserVisible` in teaserRules.ts.
 */
export function SurpriseTeaser() {
  const [inWindow, setInWindow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const onboardingUp = useOnboardingVisible();

  useEffect(() => {
    // Evaluated once on mount rather than on a timer: a tab left open across
    // midnight is not worth an interval, and a reload settles it.
    setInWindow(shouldShowTeaser(new Date(), readDismissedYear()));
  }, []);

  const showing = inWindow && !onboardingUp && !timedOut;

  /**
   * It leaves on its own after a few seconds.
   *
   * A card pinned over the top-right of the map is fine for the moment it
   * takes to read three short lines, and clutter for every minute after
   * that — it sits exactly where someone panning north-east is looking. So
   * reading it is all that is required of anyone; nobody has to tidy it away.
   *
   * Two things this deliberately does NOT do:
   *
   * - It does not write the dismissal. Timing out means "you have seen it
   *   for now", so it is back on the next visit. Only pressing ✕ means "stop
   *   showing me this", and only that is remembered for the year.
   * - It does not start counting on mount. The card is hidden while the
   *   first-run intro is up, and a timer started behind that intro would
   *   expire while someone was reading it — the teaser would then never
   *   appear at all for exactly the new visitors it is for. The countdown
   *   starts when the card is actually on screen.
   */
  useEffect(() => {
    if (!showing) return;
    const fade = window.setTimeout(() => setLeaving(true), TEASER_AUTO_HIDE_MS);
    // The extra 200ms matches the CSS exit transition, so it fades rather
    // than vanishing mid-animation. Under prefers-reduced-motion that
    // duration is 0 and it simply goes.
    const gone = window.setTimeout(() => setTimedOut(true), TEASER_AUTO_HIDE_MS + 200);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
    };
  }, [showing]);

  // Equivalent to teaserVisible(now, dismissedYear, onboardingUp), plus the
  // auto-hide above.
  if (!showing) return null;

  const dismiss = () => {
    setLeaving(true);
    writeDismissed(occurrenceYear(new Date()));
    // Let the exit transition finish before unmounting. Under
    // prefers-reduced-motion the CSS duration is 0, so this is immediate.
    window.setTimeout(() => setInWindow(false), 200);
  };

  return (
    <aside className={`surprise${leaving ? " surprise--leaving" : ""}`} aria-label="A note">
      <div className="surprise__glow" aria-hidden="true" />
      <button type="button" className="surprise__close" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
      <p className="surprise__headline">{TEASER_COPY.headline}</p>
      <p className="surprise__date">{TEASER_COPY.date}</p>
      <p className="surprise__nudge">{TEASER_COPY.nudge}</p>
    </aside>
  );
}
