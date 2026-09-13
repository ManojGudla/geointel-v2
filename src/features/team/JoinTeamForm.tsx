import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTeamStore } from "@/stores/teamStore";
import { submitTeamApplication } from "@/services/team";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import "./JoinTeamForm.css";
import { useDialog } from "@/hooks/useDialog";

const INTERESTS: Array<{ id: string; label: string }> = [
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "gis-data", label: "GIS / Data" },
  { id: "product", label: "Product" },
  { id: "other", label: "Other" },
];

type SubmitState = "idle" | "submitting" | "done" | "error";

/**
 * "Join Our Team" — a real lead-capture form (name, email, area of
 * interest, note), same shape as FeedbackForm.tsx and saved the same
 * honest way via api/team-apply.ts: a real row when Supabase is
 * configured, a clear error otherwise. This is intentionally not an
 * accounts/HR system — just how someone interested in the project reaches
 * you until that's built.
 */
export function JoinTeamForm() {
  const isOpen = useTeamStore((s) => s.isOpen);
  const close = useTeamStore((s) => s.close);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("engineering");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const motionEnabled = useMotionPreference();

  const reset = () => {
    setName("");
    setEmail("");
    setInterest("engineering");
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
    it on close. See hooks/useDialog.ts — none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: handleClose });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setState("submitting");
    setError("");
    try {
      await submitTeamApplication({ name: name.trim(), email: email.trim(), interest, message: message.trim() });
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn't save your application. Please try again.");
    }
  };

  const body = (
    <>
      <div className="join-team-form__head">
        <h2>Join Our Team</h2>
        <button type="button" onClick={handleClose} aria-label="Close join our team form">
          ✕
        </button>
      </div>

      {state === "done" ? (
        <div className="join-team-form__done">
          <p>Thanks, {name.trim() || "there"} — your application was saved. We'll be in touch.</p>
          <button type="button" onClick={handleClose}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </label>

          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} required />
          </label>

          <label>
            Area of interest
            <select value={interest} onChange={(e) => setInterest(e.target.value)} aria-label="Area of interest">
              {INTERESTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            A note (optional)
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything you'd like us to know?" maxLength={2000} rows={3} />
          </label>

          {error && <p className="join-team-form__error">{error}</p>}

          <button type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? "Sending…" : "Send application"}
          </button>
        </form>
      )}
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="join-team-overlay" onClick={handleClose}>
        <div ref={dialogRef} className="join-team-form" role="dialog" aria-label="Join our team" onClick={(e) => e.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="join-team-overlay" onClick={handleClose} {...overlayFade}>
          <motion.div ref={dialogRef} className="join-team-form" role="dialog" aria-label="Join our team" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
