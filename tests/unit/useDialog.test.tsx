import { describe, expect, it, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useDialog } from "../../src/hooks/useDialog";

/**
 * `role="dialog"` is a promise, and this app was breaking it thirteen times.
 *
 * The role tells assistive technology: focus moves into this, Escape closes it,
 * and Tab stays inside until it does. Four of the thirteen dialogs handled
 * Escape. None trapped focus — there was no focus-trap anywhere in the
 * codebase. So a keyboard user could open Settings, press Tab, and walk
 * straight out into the map, the nav rail and the search box behind it:
 * controls the dialog was visually covering, announced by a screen reader as
 * though the modal were not there.
 *
 * Claiming the role and not honouring it is worse than never claiming it, and
 * these tests are what stop it drifting back.
 */

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const ref = useDialog({ open, onClose: close });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      {open && (
        <div ref={ref} role="dialog" aria-label="Test">
          <button type="button">First</button>
          <button type="button">Middle</button>
          <button type="button">Last</button>
        </div>
      )}
    </div>
  );
}

/** jsdom leaves offsetParent null for everything, so the filter needs a stand-in. */
function makeVisible() {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
}

makeVisible();
afterEach(cleanup);

describe("a dialog that claims the role", () => {
  it("moves focus into itself when it opens", async () => {
    // Without this, a keyboard user is still focused on the button behind the
    // dialog and has no signal that anything happened.
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText("Open"));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last control back to the first", async () => {
    // The actual trap. Without it, Tab here lands on "Behind" — a control the
    // dialog is covering.
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    screen.getByText("Last").focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("wraps Shift+Tab from the first control back to the last", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    screen.getByText("First").focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement?.textContent).toBe("Last");
  });

  it("leaves Tab alone in the middle of the dialog", async () => {
    // The trap must only act at the edges. Intercepting every Tab would break
    // normal movement between the dialog's own controls.
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    screen.getByText("Middle").focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    screen.getByRole("dialog").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("hands focus back to whatever opened it", async () => {
    /*
      Landing at the top of the document instead means tabbing all the way back
      to where you were, every single time — which is the difference between a
      dialog somebody uses and one they avoid.
    */
    render(<Harness />);
    const opener = screen.getByText("Open");
    opener.focus();
    fireEvent.click(opener);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(document.activeElement).toBe(opener);
  });

  it("does nothing at all while closed", () => {
    // The hook runs on every render of a component whose dialog is usually
    // shut. It must not touch focus or listen for keys until it is open.
    render(<Harness />);
    const opener = screen.getByText("Open");
    opener.focus();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });
});
