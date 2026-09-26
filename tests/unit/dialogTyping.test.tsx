import { describe, expect, it, afterEach, beforeAll, afterAll } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useDialog } from "../../src/hooks/useDialog";

/**
 * Typing into a dialog must not move focus.
 *
 * FeedbackForm and JoinTeamForm both pass a close handler that is a fresh
 * function on every render, which is the normal way to write one. The dialog
 * effect used to depend on that handler, so every keystroke re-ran it: the
 * cleanup handed focus back to the button that opened the dialog, and the
 * new run moved it to the dialog's first control, the Close button. One
 * character in, the next key landed on Close.
 *
 * The existing dialog tests never re-rendered while open, which is exactly
 * how this got through.
 */

function FormLikeDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  // Deliberately NOT memoised, exactly like the real forms.
  const handleClose = () => setOpen(false);
  const ref = useDialog({ open, onClose: handleClose });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <div ref={ref} role="dialog" aria-label="Feedback">
          <button type="button" onClick={handleClose}>
            Close
          </button>
          <textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
    </div>
  );
}

const flushFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));

/*
  jsdom does no layout, so offsetParent is always null and the hook's
  visibility filter treats every control as hidden. That quietly hid this bug:
  with nothing "visible", the hook re-focused whatever already had focus. A
  real browser lays the dialog out, so give connected elements a parent the
  way one would.
*/
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? document.body : null;
    },
  });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
});

afterEach(cleanup);

describe("typing inside a dialog", () => {
  it("keeps focus in the field across re-renders", async () => {
    render(<FormLikeDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await flushFrame();

    const field = screen.getByRole("textbox", { name: "Message" });
    field.focus();
    expect(document.activeElement).toBe(field);

    for (const value of ["H", "He", "Hel", "Hell", "Hello"]) {
      fireEvent.change(field, { target: { value } });
      await flushFrame();
      expect(document.activeElement).toBe(field);
    }
    expect((field as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("still closes on Escape with the latest handler", async () => {
    render(<FormLikeDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await flushFrame();
    const field = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(field, { target: { value: "x" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
