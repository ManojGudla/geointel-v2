import { AnimatePresence, motion } from "framer-motion";
import { useDialog } from "@/hooks/useDialog";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import { useFreeNoticeStore } from "./freeNoticeStore";
import { useTourStore } from "@/features/tour/tourStore";
import "./FreeToUseNotice.css";

/**
 * Every line here has to be true and checkable, because the point of this
 * notice is to answer "is this site legitimate?" - and an overclaim would
 * undo that. So it states facts (free, no account, open data, independent)
 * and does not claim to grant anyone's employer's permission, which no
 * website can do.
 *
 * Short on purpose: each point is a few words a visitor can take in at a
 * glance.
 *
 * No timer. It used to close itself after six seconds, with a bar counting
 * down along the bottom; the owner asked on 26 November 2026 for it to stay
 * until the visitor closes it, since a notice that vanishes while being read
 * is worse than one that waits. It closes with the X, Cancel, "Got it",
 * Escape or a click outside it, and opens again from More > Free to use.
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
