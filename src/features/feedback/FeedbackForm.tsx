import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFeedbackStore } from "@/stores/feedbackStore";
import { submitFeedback } from "@/services/feedback";
import { useLocationStore } from "@/stores/locationStore";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import "./FeedbackForm.css";
import { useDialog } from "@/hooks/useDialog";

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "general", label: "General" },
  { id: "bug", label: "Something's broken" },
  { id: "data-accuracy", label: "Data looks wrong" },
  { id: "feature-request", label: "Feature request" },
  { id: "praise", label: "Just saying thanks" },
];

type SubmitState = "idle" | "submitting" | "done" | "error";

export function FeedbackForm() {
  const isOpen = useFeedbackStore((s) => s.isOpen);
  const close = useFeedbackStore((s) => s.close);
  const location = useLocationStore((s) => s.selectedLocation);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const motionEnabled = useMotionPreference();

  const reset = () => {
    setRating(0);
    setCategory("general");
    setMessage("");
    setState("idle");
    setError("");
  };

  const handleClose = () => {
    close();
    reset();
  };

  /*
    Makes this behave like the role="dialog" it declares: Escape closes it,
    focus moves in on open and cycles inside, and goes back to whatever opened
    it on close. See hooks/useDialog.ts - none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: handleClose });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    setState("submitting");
    setError("");
    try {
      await submitFeedback({
        rating,
        category,
        message,
        pageContext: location ? { locationName: location.name, lat: location.lat, lon: location.lon } : undefined,
      });
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn't save your feedback. Please try again.");
    }
  };

  const body = (
    <>
      <div className="feedback-form__head">
        <h2>Feedback</h2>
        <button type="button" onClick={handleClose} aria-label="Close feedback form">
          ✕
        </button>
      </div>

      {state === "done" ? (
        <div className="feedback-form__done">
          <p>Thanks. Your feedback was saved.</p>
          <button type="button" onClick={handleClose}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="feedback-form__stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={n <= rating ? "active" : ""}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
              >
                {n <= rating ? "★" : "☆"}
              </button>
            ))}
          </div>

          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Feedback category">
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything specific? (optional)"
            maxLength={2000}
            rows={3}
          />

          {error && <p className="feedback-form__error">{error}</p>}

          <button type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? "Saving…" : "Send feedback"}
          </button>
        </form>
      )}
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="feedback-overlay" onClick={handleClose}>
        <div ref={dialogRef} className="feedback-form" role="dialog" aria-label="Send feedback" onClick={(e) => e.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="feedback-overlay" onClick={handleClose} {...overlayFade}>
          <motion.div ref={dialogRef} className="feedback-form" role="dialog" aria-label="Send feedback" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
