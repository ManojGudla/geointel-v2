import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Detent,
  DETENT_FRACTION,
  INITIAL_DETENT,
  cycleDetent,
  fractionAfterDrag,
  lowerDetent,
  raiseDetent,
  settle,
} from "./sheet";

/**
 * The drag behaviour for the mobile workspace sheet.
 *
 * Split from the maths in sheet.ts: this file owns the parts that need a DOM
 * - pointer capture, measuring the column the sheet lives in, and the media
 * query that decides whether any of this applies at all.
 */

/**
 * The one number that separates "rail beside the map" from "tab bar under it".
 *
 * It is the same 900px the shell's CSS and shellStore already use to make the
 * same decision. Kept as a constant rather than a third literal so the three
 * cannot drift apart, which is exactly how a layout ends up with a range of
 * widths where the rail has moved but the panel has not.
 */
export const SHEET_MAX_WIDTH = 900;

const SHEET_QUERY = `(max-width: ${SHEET_MAX_WIDTH}px)`;

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/** True when the panel should behave as a bottom sheet rather than a column. */
export function useIsSheetLayout(): boolean {
  const [isSheet, setIsSheet] = useState(() => matches(SHEET_QUERY));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(SHEET_QUERY);
    const onChange = () => setIsSheet(mql.matches);
    // Re-read on mount: between the initial render and this effect the window
    // may have been resized, or the app may have hydrated at another width.
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isSheet;
}

export interface Sheet {
  detent: Detent;
  /** The height to render, as a fraction, or null on desktop where CSS owns it. */
  fraction: number | null;
  dragging: boolean;
  /** Attach to the sheet element; used to measure the column it sits in. */
  sheetRef: (node: HTMLElement | null) => void;
  gripProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    onClick: () => void;
  };
}

export function useSheet(enabled: boolean, onDismiss: () => void): Sheet {
  const [detent, setDetent] = useState<Detent>(INITIAL_DETENT);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startY: number; startFraction: number; height: number } | null>(null);

  const sheetRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  // Leaving the sheet layout (rotating to landscape, resizing a desktop
  // window down and back) must not strand a half-finished drag: the inline
  // height would then fight the desktop stylesheet's fixed 380px column.
  useEffect(() => {
    if (!enabled) {
      drag.current = null;
      setDragFraction(null);
      setDetent(INITIAL_DETENT);
    }
  }, [enabled]);

  /** The height of the area the sheet is positioned against. */
  const availableHeight = useCallback((): number => {
    const parent = elementRef.current?.parentElement;
    const measured = parent?.clientHeight ?? 0;
    if (measured > 0) return measured;
    return typeof window === "undefined" ? 0 : window.innerHeight;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const height = availableHeight();
      if (height <= 0) return;
      drag.current = { startY: event.clientY, startFraction: DETENT_FRACTION[detent], height };
      setDragFraction(DETENT_FRACTION[detent]);
      // Capture so the drag survives the pointer leaving the 44px grip, which
      // it does immediately on any real drag.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [availableHeight, detent, enabled]
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active) return;
    setDragFraction(fractionAfterDrag(active.startFraction, event.clientY - active.startY, active.height));
  }, []);

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setDragFraction(null);

      if (cancelled) return;

      const fraction = fractionAfterDrag(active.startFraction, event.clientY - active.startY, active.height);
      // A tap produces a pointerup a pixel or two from the pointerdown. That
      // must not be read as a drag to very nearly the same place - onClick
      // handles taps, and settling here as well would fight it.
      if (Math.abs(fraction - active.startFraction) < 0.02) return;

      const outcome = settle(fraction);
      if (outcome.dismiss) onDismiss();
      else setDetent(outcome.detent);
    },
    [onDismiss]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => finishDrag(event, false),
    [finishDrag]
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => finishDrag(event, true),
    [finishDrag]
  );

  /**
   * Keyboard parity for the drag.
   *
   * A grip that only responds to a pointer is a control that exists for
   * touch users and nobody else. Arrow keys step between the same three
   * detents; arrowing down from the lowest one closes the panel, matching
   * what dragging down from it does.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setDetent((current) => raiseDetent(current));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setDetent((current) => {
          if (current === "peek") {
            onDismiss();
            return current;
          }
          return lowerDetent(current);
        });
      }
    },
    [enabled, onDismiss]
  );

  const onClick = useCallback(() => {
    if (!enabled) return;
    setDetent((current) => cycleDetent(current));
  }, [enabled]);

  return {
    detent,
    fraction: enabled ? (dragFraction ?? DETENT_FRACTION[detent]) : null,
    dragging: dragFraction !== null,
    sheetRef,
    gripProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown, onClick },
  };
}
