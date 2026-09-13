import { useEffect, useState } from "react";
import {
  analyticsAvailable,
  gtmId,
  loadTagManager,
  enableSentry,
  readConsent,
  shouldAskConsent,
  writeConsent,
  type ConsentChoice,
} from "./consent";
import { useConsentUiStore } from "./consentUiStore";
import "./ConsentBanner.css";

/**
 * The one thing on this site that asks the visitor for something.
 *
 * It exists because Google Analytics was added. Before that, the honest claim
 * "no analytics, no trackers, no third-party tags" needed no banner because it
 * was simply true. It is not true any more, so the visitor gets a real choice
 * instead of a notice dressed up as one.
 *
 * What makes it a real choice rather than theatre:
 *
 *   Nothing is loaded before it is answered. Tag Manager is not on the page
 *   while this banner is up. Most cookie banners load the tracker first.
 *
 *   "No thanks" is the same size and weight as "Allow". A decline button
 *   styled as a faint link is a dark pattern, and it would make the choice
 *   nominal.
 *
 *   Declining is remembered, so nobody is worn down by being asked again on
 *   every visit.
 *
 * When VITE_GTM_ID is unset there is nothing to consent to, so the banner
 * never renders at all.
 */
export function ConsentBanner() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);
  /** The full disclosure, collapsed by default. See the note in the markup. */
  const [details, setDetails] = useState(false);
  const setConsentAsking = useConsentUiStore((s) => s.setAsking);

  useEffect(() => {
    const saved = readConsent();
    setChoice(saved);
    setReady(true);
    // A visitor who already accepted should not have to accept again.
    if (saved === "granted") {
      const id = gtmId();
      if (id) loadTagManager(id);
      enableSentry().catch((e) => {
        console.error("[consent] failed to enable Sentry", e);
      });
    }
  }, []);

  const decide = (next: ConsentChoice) => {
    writeConsent(next);
    setChoice(next);
    if (next === "granted") {
      const id = gtmId();
      if (id) loadTagManager(id);
      enableSentry().catch((e) => {
        console.error("[consent] failed to enable Sentry", e);
      });
    }
  };

  // `ready` keeps the banner from flashing on screen for a visitor who
  // answered months ago, before localStorage has been read.
  const asking = ready && analyticsAvailable() && shouldAskConsent(choice);

  // Published so the onboarding card can wait its turn. This banner sits at
  // z-index 60 and that card at 12, so while both were up the banner covered
  // the card's Dismiss button and a first-time visitor on a phone could not
  // close it. See consentUiStore.ts for the measurements.
  useEffect(() => {
    setConsentAsking(asking);
    // Cleared on unmount so the card is never blocked by a banner that is no
    // longer there.
    return () => setConsentAsking(false);
  }, [asking, setConsentAsking]);

  if (!asking) return null;

  return (
    /*
      No role="dialog" here, deliberately.

      Lighthouse flagged this as "ARIA role should be appropriate for the
      element", and it was right. role="dialog" promises a modal: focus moves
      into it, Escape closes it, and everything behind it is inert. This banner
      does none of that — the map stays fully usable while it is up, which is
      the correct behaviour for a consent notice and the reason it was built
      that way. Claiming to be a dialog told screen readers to expect a trap
      that does not exist.

      An <aside> already carries the complementary landmark role, so with a
      label it is announced properly without lying about how it behaves.
    */
    <aside className="consent" aria-label="Analytics choice" aria-live="polite">
      <div className="consent__text">
        {/*
          One line, not a paragraph.

          The full version ran to about ninety words and took the bottom third
          of a phone screen. It was the FIRST thing a new visitor met, before
          they had seen the map do anything, and it pushed everything that
          explains the app below the fold. Nothing is hidden by shortening it:
          the whole disclosure is one tap away and the Privacy page is still
          linked. What changed is that the visitor now meets the product first
          and the paperwork second, which is the right order.
        */}
        <p className="consent__line">
          Can we count this visit? Analytics and error tracking only, nothing loads until you choose.{" "}
          <button type="button" className="consent__more" onClick={() => setDetails((v) => !v)} aria-expanded={details}>
            {details ? "Less" : "Details"}
          </button>
        </p>

        {details && (
          <p className="consent__body">
            We would like to use Google Analytics and Sentry to see how many people use the site, which features they
            open, and to catch errors that break the experience. Analytics sets cookies and sends your visit to Google.
            Error tracking helps us fix bugs faster. Saying no keeps the site working exactly the same. See our{" "}
            <a href="/privacy">Privacy page</a> for details.
          </p>
        )}
      </div>
      <div className="consent__actions">
        <button type="button" className="consent__btn consent__btn--no" onClick={() => decide("denied")}>
          No thanks
        </button>
        <button type="button" className="consent__btn consent__btn--yes" onClick={() => decide("granted")}>
          Allow
        </button>
      </div>
    </aside>
  );
}
