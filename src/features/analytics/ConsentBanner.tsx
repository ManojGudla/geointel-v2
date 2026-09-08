import { useEffect, useState } from "react";
import {
  analyticsAvailable,
  gtmId,
  loadTagManager,
  readConsent,
  shouldAskConsent,
  writeConsent,
  type ConsentChoice,
} from "./consent";
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

  useEffect(() => {
    const saved = readConsent();
    setChoice(saved);
    setReady(true);
    // A visitor who already accepted should not have to accept again.
    const id = gtmId();
    if (saved === "granted" && id) loadTagManager(id);
  }, []);

  const decide = (next: ConsentChoice) => {
    writeConsent(next);
    setChoice(next);
    const id = gtmId();
    if (next === "granted" && id) loadTagManager(id);
  };

  // `ready` keeps the banner from flashing on screen for a visitor who
  // answered months ago, before localStorage has been read.
  if (!ready || !analyticsAvailable() || !shouldAskConsent(choice)) return null;

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
        <p className="consent__title">Can we count this visit?</p>
        <p className="consent__body">
          We would like to use Google Analytics to see how many people use the site and which features they open.
          It sets cookies and sends your visit to Google. Nothing is loaded until you choose, and saying no keeps
          the site working exactly the same.
        </p>
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
