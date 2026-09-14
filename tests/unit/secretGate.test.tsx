import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SECRET_TAPS,
  SECRET_WINDOW_MS,
  isTriggered,
  recordTap,
} from "../../src/features/secret/secretGesture";
import { ADMIN_SESSION_KEY } from "../../src/features/admin/adminSession";

/**
 * The hidden owner entrance behind the header logo.
 *
 * There are two separate things to defend here and they are easy to confuse.
 *
 * The gesture is OBSCURITY. It hides the door so that a visitor clicking the
 * logo — which is what people do to logos — sees nothing unusual, and so that
 * the existence of an admin area is not advertised to everyone who lands on
 * the page. It is not a security control and nothing here pretends it is.
 *
 * The code is SECURITY, and only because it is checked on the server. A
 * secret compared in the browser is not a secret: the value it is compared
 * against has to ship in the bundle, where anybody can read it out in about
 * thirty seconds. The last block in this file exists to fail loudly if anyone
 * ever "simplifies" this into a client-side comparison, which is by far the
 * most likely way this feature could quietly become worthless.
 */

const fetchMaintenanceState = vi.fn();
vi.mock("@/services/maintenance", () => ({
  fetchMaintenanceState: (...args: unknown[]) => fetchMaintenanceState(...args),
}));
vi.mock("@/services/apiClient", () => ({
  ApiUnavailableError: class ApiUnavailableError extends Error {},
}));

import { SecretGate } from "../../src/features/secret/SecretGate";

describe("the gesture that opens the door", () => {
  it("opens on three taps in quick succession", () => {
    let taps: number[] = [];
    taps = recordTap(taps, 1000);
    expect(isTriggered(taps)).toBe(false);
    taps = recordTap(taps, 1200);
    expect(isTriggered(taps)).toBe(false);
    taps = recordTap(taps, 1400);
    expect(isTriggered(taps)).toBe(true);
  });

  it("does not open on a single click, which is what visitors actually do", () => {
    // The entire reason this is not "click the logo". Every visitor clicks a
    // logo; none of them should see a password box.
    expect(isTriggered(recordTap([], 1000))).toBe(false);
  });

  it("does not open on three slow, unrelated clicks", () => {
    let taps: number[] = [];
    taps = recordTap(taps, 0);
    taps = recordTap(taps, SECRET_WINDOW_MS + 500);
    taps = recordTap(taps, 2 * SECRET_WINDOW_MS + 1000);
    expect(isTriggered(taps)).toBe(false);
    expect(taps).toHaveLength(1);
  });

  it("forgets taps that have aged out of the window", () => {
    let taps = recordTap(recordTap([], 0), 100);
    expect(taps).toHaveLength(2);
    taps = recordTap(taps, SECRET_WINDOW_MS + 200);
    // Both earlier taps are stale; only the newest survives.
    expect(taps).toHaveLength(1);
    expect(isTriggered(taps)).toBe(false);
  });

  it("keeps only the taps the gesture needs", () => {
    let taps: number[] = [];
    for (let i = 0; i < 10; i += 1) taps = recordTap(taps, 1000 + i * 10);
    expect(taps).toHaveLength(SECRET_TAPS);
  });
});

describe("the code prompt", () => {
  const assign = vi.fn();

  beforeEach(() => {
    fetchMaintenanceState.mockReset();
    assign.mockReset();
    sessionStorage.clear();
    // jsdom's own location.assign is a no-op that logs "Not implemented".
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign },
    });
  });
  afterEach(cleanup);

  it("renders nothing at all when closed", () => {
    const { container } = render(<SecretGate open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("masks the code as it is typed", () => {
    render(<SecretGate open onClose={() => {}} />);
    const input = screen.getByLabelText("Access code");
    expect(input.getAttribute("type")).toBe("password");
    // Never offer to remember a shared admin secret in the browser's
    // autofill store.
    expect(input.getAttribute("autocomplete")).toBe("off");
  });

  it("asks the server whether the code is right", async () => {
    fetchMaintenanceState.mockResolvedValue({ adminKeyValid: true, maintenance: {} });
    render(<SecretGate open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(fetchMaintenanceState).toHaveBeenCalledWith("hunter2"));
  });

  it("hands a verified code to the dashboard and goes there", async () => {
    fetchMaintenanceState.mockResolvedValue({ adminKeyValid: true, maintenance: {} });
    render(<SecretGate open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "correct-key" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin"));
    // The dashboard auto-verifies a key it finds here, so it opens unlocked
    // rather than asking a second time for the code just accepted.
    expect(sessionStorage.getItem(ADMIN_SESSION_KEY)).toBe("correct-key");
  });

  it("stores nothing and goes nowhere when the server says no", async () => {
    fetchMaintenanceState.mockResolvedValue({ adminKeyValid: false, maintenance: {} });
    render(<SecretGate open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ADMIN_SESSION_KEY)).toBeNull();
  });

  it("distinguishes a wrong code from an unreachable server", async () => {
    // Being coy here helps nobody: the only person who ever sees this dialog
    // already knows the gesture.
    fetchMaintenanceState.mockRejectedValue(new Error("network"));
    render(<SecretGate open onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "whatever" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach/i));
    expect(assign).not.toHaveBeenCalled();
  });

  it("behaves like the dialog it claims to be", async () => {
    const onClose = vi.fn();
    render(<SecretGate open onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("the code is never checked in the browser", () => {
  const gate = readFileSync(join(process.cwd(), "src", "features", "secret", "SecretGate.tsx"), "utf8");
  const gesture = readFileSync(join(process.cwd(), "src", "features", "secret", "secretGesture.ts"), "utf8");

  it("verifies over the network rather than against a value in the bundle", () => {
    expect(gate).toMatch(/fetchMaintenanceState/);
    expect(gate).toMatch(/adminKeyValid/);
  });

  it("contains no literal the code is compared against", () => {
    /*
      The failure mode this guards. Replacing the network call with
      `if (code === "something")` would look like a tidy simplification, would
      pass every other test in this file, and would ship the password to every
      visitor inside a JavaScript file they can read.
    */
    const source = `${gate}\n${gesture}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/(code|key|secret|password)\s*===\s*['"`]/i);
    expect(source).not.toMatch(/import\.meta\.env\.VITE_/);
  });

  it("does not keep the key anywhere it outlives the tab", () => {
    // localStorage would leave a key with no expiry and no revocation sitting
    // on disk indefinitely.
    // Comments stripped first: that file explains at length why localStorage
    // is the wrong choice here, and a guard reading the raw text finds the
    // word it is banning inside the note banning it.
    const session = readFileSync(join(process.cwd(), "src", "features", "admin", "adminSession.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(session).not.toMatch(/localStorage/);
    expect(session).toMatch(/sessionStorage/);
  });
});
