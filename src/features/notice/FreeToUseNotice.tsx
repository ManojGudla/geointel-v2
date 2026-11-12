import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDialog } from "@/hooks/useDialog";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import { useFreeNoticeStore } from "./freeNoticeStore";
import { useTourStore } from "@/features/tour/tourStore";
import "./FreeToUseNotice.css";

/** How long the notice stays up on its own before closing. */
export const AUTO_CLOSE_MS = 6_000;

/**
 * Every line here has to be true and checkable, because the point of this
 * notice is to answer "is this site legitimate?" - and an overclaim would
 * undo that. So it states facts (free, no account, open data, independent)
 * and does not claim to grant anyone's employer's permission, which no
 * website can do.
 *
 * Short on purpose: it closes itself after six seconds, so each point is a
 * few words a visitor can take in at a glance.
 */
const POINTS: Array<{ icon: string; title: string; text: string }> = [
  { icon: "✅", title: "100% free", text: "No sign-up, no payment, nothing to install." },
  { icon: "🗺️", title: "Open, public data", text: "Built on OpenStreetMap, openly licensed for anyone. Sources shown with every answer." },
  { icon: "🔒", title: "No personal details", text: "No login. Analytics only if you allow them." },
  { icon: "🧭", title: "Independent", text: "A personal project by Manoj Kumar Gudla. Not affiliated with Apple, Google or any employer." },
];

export function FreeToUseNotice() {
  const isOpen = useFreeNoticeStore((s) => s.isOpen);
  const close = useFreeNoticeStore((s) => s.close);
  const startTour = useTourStore((s) => s.start);
  const dialogRef = useDialog({ open: isOpen, onClose: close });
  const motionEnabled = useMotionPreference();

  /*
    Auto-close after six seconds. Always.

    It used to pause while the pointer was over the card, so somebody reading
    could keep it. But the card sits in the middle of the screen, which is
    where the pointer already is on most computers, so for most people it
    paused the moment it appeared and never closed: it was reported as stuck,
    needing a manual close every time. A notice that says "this closes by
    itself" has to close by itself. The time is a little longer instead, the
    bar along the bottom shows what is left, and the whole text stays
    available under More > Free to use.
  */
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgressKey((k) => k + 1);
      return;
    }
    const timer = setTimeout(close, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, close]);

  const body = (
    <>
      <button type="button" className="free-notice__close" onClick={close} aria-label="Close this notice">
        ✕
      </button>

      <p className="free-notice__eyebrow">maNOWj GeoIntel</p>
      <h2 id="free-notice-title" className="free-notice__title">
        Free for everyone to use
      </h2>
      <p className="free-notice__lead">A free public website. Anyone can open it and use it, anywhere.</p>

      {/*
        Highlighted on purpose, and worded carefully. The people this site is
        shared with first are colleagues on Apple and Google map projects, and
        some were told it was not allowed. The site can truthfully welcome
        them - it is public and free - but it cannot speak for their
        employer, so the same box says the one thing that is true for every
        employee everywhere: your employer's rules on outside tools and
        confidential data still apply.
      */}
      <div className="free-notice__welcome">
        <p className="free-notice__welcome-title">Apple and Google employees are welcome too</p>
        <p className="free-notice__welcome-text">
          It&apos;s a public website, open to everyone, like any other. As with any outside site, follow your employer&apos;s rules and never
          enter confidential or client data.
        </p>
      </div>

      <ul className="free-notice__points">
        {POINTS.map((point) => (
          <li key={point.title}>
            <span className="free-notice__icon" aria-hidden="true">
              {point.icon}
            </span>
            <span>
              <strong>{point.title}</strong>
              <span className="free-notice__text">{point.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="free-notice__tour"
        onClick={() => {
          close();
          // After the notice has gone, so the tour's spotlight isn't under it.
          window.setTimeout(startTour, 250);
        }}
      >
        🧭 New here? Take the 30-second tour →
      </button>

      <div className="free-notice__actions">
        <button type="button" className="free-notice__primary" onClick={close}>
          Got it, start exploring
        </button>
        <button type="button" className="free-notice__secondary" onClick={close}>
          Cancel
        </button>
      </div>

      <div className="free-notice__timer" aria-hidden="true">
        <span
          key={progressKey}
          className="free-notice__timer-bar"
          style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }}
        />
      </div>
    </>
  );

  const dialogProps = {
    ref: dialogRef,
    className: "free-notice",
    role: "dialog" as const,
    "aria-modal": true,
    "aria-labelledby": "free-notice-title",
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="free-notice-overlay" onClick={close}>
        <div {...dialogProps}>{body}</div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="free-notice-overlay" onClick={close} {...overlayFade}>
          <motion.div {...dialogProps} {...panelRise}>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
