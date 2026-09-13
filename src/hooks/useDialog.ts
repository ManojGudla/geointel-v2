import { useEffect, useRef } from "react";

/**
 * Makes a `role="dialog"` behave like one.
 *
 * Thirteen components in this app declare `role="dialog"`. That role is a
 * promise to assistive technology: focus moves into this thing, Escape closes
 * it, and Tab stays inside it until it does. Four of the thirteen handled
 * Escape. None trapped focus — there was no focus-trap utility anywhere in the
 * codebase.
 *
 * What that meant in practice, for somebody using a keyboard or a screen
 * reader: open Settings, press Tab a few times, and focus walks straight out of
 * the dialog and into the map, the nav rail, and the search box behind it —
 * controls the dialog is visually covering. The reader announces a page the
 * person cannot see while a modal they cannot leave sits on top of it. The role
 * had told them to expect a trap, and there wasn't one, which is worse than
 * never having claimed to be a dialog at all.
 *
 * Four behaviours, which together are what the role actually means.
 *
 * ESCAPE CLOSES. Listening on the dialog element rather than the window, so a
 * nested popover inside a dialog can stop the event and close only itself.
 *
 * FOCUS MOVES IN ON OPEN. To the first focusable control, or to the dialog
 * itself when there is none. Without this, a keyboard user who opens a dialog
 * is still focused on the button behind it and has no idea anything happened.
 *
 * TAB CYCLES INSIDE. Forward past the last control wraps to the first, Shift
 * Tab before the first wraps to the last.
 *
 * FOCUS GOES BACK ON CLOSE. To whatever opened the dialog. Landing at the top
 * of the document instead means tabbing all the way back to where you were,
 * every time, which is the difference between a dialog you can use and one you
 * avoid.
 *
 * Deliberately NOT using `inert` on the background: it would need a single
 * known wrapper around everything else, this app renders its dialogs as
 * siblings of the shell, and a trap plus a scrim already gets the behaviour.
 */

/**
 * Everything focusable, minus the things that only look focusable.
 *
 * `[tabindex="-1"]` is excluded because it is the standard way to mark an
 * element as programmatically focusable but not part of the tab order, and
 * including it would stop at elements a person never tabs to. Disabled controls
 * and `[hidden]` are excluded for the obvious reason, and closed `<details>`
 * content is not reachable either.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
]
  .map((s) => `${s}:not([hidden])`)
  .join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // offsetParent is null for anything display:none, including a control
    // inside a collapsed section. A trap that tries to focus an invisible
    // element silently does nothing and looks like the trap is broken.
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export function useDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  /** Whatever had focus before the dialog opened, so it can be handed back. */
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first real control, or the dialog itself if it has none. The
    // frame's delay is not decoration: a dialog that renders its content in an
    // effect has nothing to focus on the tick it mounts.
    const raf = requestAnimationFrame(() => {
      const first = focusableWithin(node)[0];
      if (first) {
        first.focus();
      } else {
        node.setAttribute("tabindex", "-1");
        node.focus();
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableWithin(node);
      if (items.length === 0) {
        // Nothing to move between, so Tab must not be allowed to leave.
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("keydown", onKeyDown);
      /*
        Only take focus back if it is still inside the dialog.

        A dialog that closes BECAUSE the person clicked something else has
        already moved focus where they wanted it, and yanking it back to the
        original trigger would undo their action. This only fires for the
        normal case: closed by Escape or by its own close button, with focus
        still in a subtree that is about to be removed.
      */
      const active = document.activeElement;
      if (returnTo.current && (active === document.body || node.contains(active))) {
        returnTo.current.focus();
      }
    };
  }, [open, onClose]);

  return ref;
}
