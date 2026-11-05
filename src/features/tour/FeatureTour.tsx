import { useEffect, useLayoutEffect, useState } from "react";
import { useDialog } from "@/hooks/useDialog";
import { useTourStore } from "./tourStore";
import { TOUR_STEPS } from "./tourSteps";
import "./FeatureTour.css";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none") return el;
  }
  return null;
}

/** The steps that can actually be shown on this screen right now. */
function visibleSteps() {
  return TOUR_STEPS.map((step, index) => ({ step, index })).filter(({ step }) => findTarget(step.targets));
}

/**
 * A spotlight tour: the screen dims, one feature at a time is lit up, and a
 * card says what it does. Started only on request (How it works, the welcome
 * notice, the More menu) - it never appears on its own, because a pop-up that
 * appears unasked is exactly what visitors complained about.
 */
export function FeatureTour() {
  const open = useTourStore((s) => s.open);
  const stepIndex = useTourStore((s) => s.step);
  const next = useTourStore((s) => s.next);
  const back = useTourStore((s) => s.back);
  const stop = useTourStore((s) => s.stop);
  // Escape closes it, focus moves in and stays inside, and returns to
  // whatever started the tour - like every other dialog in the app.
  const dialogRef = useDialog({ open, onClose: stop });
  const [box, setBox] = useState<Box | null>(null);
  const [steps, setSteps] = useState(() => [] as ReturnType<typeof visibleSteps>);

  useEffect(() => {
    if (open) setSteps(visibleSteps());
  }, [open]);

  const current = steps[stepIndex];

  useLayoutEffect(() => {
    if (!open || !current) return;
    const el = findTarget(current.step.targets);
    if (!el) return;
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      const pad = 6;
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") (stepIndex >= steps.length - 1 ? stop : next)();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stepIndex, steps.length, next, back, stop]);

  if (!open || !current || !box) return null;

  const last = stepIndex >= steps.length - 1;
  const viewportH = window.innerHeight;
  const below = box.top + box.height + 200 < viewportH;
  const cardStyle: React.CSSProperties = below ? { top: box.top + box.height + 12 } : { bottom: viewportH - box.top + 12 };
  const cardLeft = Math.min(Math.max(12, box.left), Math.max(12, window.innerWidth - 352));

  return (
    <div ref={dialogRef} className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour__shade" onClick={stop} />
      <div className="tour__spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" />
      <div className="tour__card" style={{ ...cardStyle, left: cardLeft }}>
        <p className="tour__count">
          {stepIndex + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="tour__title">
          {current.step.title}
        </h2>
        <p className="tour__text">{current.step.text}</p>
        <div className="tour__actions">
          <button type="button" className="tour__skip" onClick={stop}>
            Skip tour
          </button>
          <span className="tour__nav">
            {stepIndex > 0 && (
              <button type="button" className="tour__back" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="tour__next" onClick={last ? stop : next} autoFocus>
              {last ? "Done" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
