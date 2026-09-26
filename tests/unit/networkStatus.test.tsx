import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NetworkStatus, BACK_ONLINE_MS, isSlowConnection } from "../../src/components/NetworkStatus";

/**
 * Nothing in the app listened for the connection before this. Offline showed
 * up only as a string of unrelated, misleading symptoms.
 */

const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });

afterEach(() => {
  cleanup();
  setOnline(true);
  vi.useRealTimers();
});

describe("NetworkStatus", () => {
  it("shows nothing visible while online", () => {
    setOnline(true);
    const { container } = render(<NetworkStatus />);
    expect(container.querySelector(".network-status")).toBeNull();
  });

  it("says so when the connection drops, and says Back online when it returns", async () => {
    vi.useFakeTimers();
    setOnline(true);
    render(<NetworkStatus />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/you're offline/i)).toBeTruthy();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByText(/back online/i)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(BACK_ONLINE_MS + 10);
    });
    expect(screen.queryByText(/back online/i)).toBeNull();
  });

  it("starts in the offline state when the page opens offline", () => {
    setOnline(false);
    render(<NetworkStatus />);
    expect(screen.getByText(/you're offline/i)).toBeTruthy();
  });

  it("only calls a connection slow when the browser says 2G-class", () => {
    expect(isSlowConnection({ effectiveType: "2g" })).toBe(true);
    expect(isSlowConnection({ effectiveType: "slow-2g" })).toBe(true);
    expect(isSlowConnection({ effectiveType: "4g" })).toBe(false);
    expect(isSlowConnection(undefined)).toBe(false);
  });
});
