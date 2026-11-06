import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** The area to light up: the element itself, or just the visible things inside it. */
function targetRect(el: HTMLElement, fit: "children" | undefined): DOMRect {
  if (fit !== "children") return el.getBoundingClientRect();
  const rects = Array.from(el.children)
    .map((child) => child.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return el.getBoundingClientRect();
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return new DOMRect(left, top, right - left, bottom - top);
}

const GAP = 12;
const EDGE = 12;

/**
 * Where the card goes: below the lit-up feature, else above it, else to its
 * right, else to its left - the first side with room for the whole card.
 * If no side has room (a huge target on a small screen) it sits at the
 * bottom of the screen. Either way it is clamped fully on screen: the card
 * once rendered above a full-height target and its title and text were cut
 * off the top of the window, leaving only the buttons.
 */
export function placeCard(box: Box, card: { width: number; height: number }, view: { width: number; height: number }) {
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), Math.max(EDGE, view.width - card.width - EDGE));
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, view.height - card.height - EDGE));
  const bottom = box.top + box.height;
  const right = box.left + box.width;
  if (bottom + GAP + card.height + EDGE <= view.height) return { top: bottom + GAP, left: clampX(box.left) };
  if (box.top - GAP - card.height >= EDGE) return { top: box.top - GAP - card.height, left: clampX(box.left) };
  if (right + GAP + card.width + EDGE <= view.width) return { top: clampY(box.top), left: right + GAP };
  if (box.left - GAP - card.width >= EDGE) return { top: clampY(box.top), left: box.left - GAP - card.width };
  return { top: clampY(view.height - card.height - EDGE), left: clampX((view.width - card.width) / 2) };
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
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
      const r = targetRect(el, current.step.fit);
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

  // Place the card once it has rendered and its real height is known (the
  // text differs per step, and wraps differently on a phone).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!box || !card) return;
    const { width, height } = card.getBoundingClientRect();
    setCardPos(placeCard(box, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [box, current]);

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
  // Until measured, render it invisibly at the top-left so it can be measured.
  const cardStyle: React.CSSProperties = cardPos ? { top: cardPos.top, left: cardPos.left } : { top: 0, left: 0, visibility: "hidden" };

  return (
    <div ref={dialogRef} className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour__shade" onClick={stop} />
      <div className="tour__spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" />
      <div ref={cardRef} className="tour__card" style={cardStyle}>
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
