import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { Suspense } from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { lazyWithRetry } from "../../src/lib/lazyWithRetry";

/**
 * Opening a panel offline must not reload the page.
 *
 * Panels download on first open. Offline, that download fails with the same
 * "Failed to fetch dynamically imported module" a stale deploy produces, and
 * the boundary used to answer both with window.location.reload(). Offline the
 * reload cannot load either, and it throws away the selected place, the map
 * position and the Copilot conversation. React.lazy also remembered the
 * failure, so even back online the panel could not open without a reload.
 */

const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });

const reload = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  reload.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  setOnline(true);
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
});

function chunkThatFailsUntil(isReachable: () => boolean) {
  return lazyWithRetry(async () => {
    if (!isReachable()) throw new TypeError("Failed to fetch dynamically imported module: /assets/Help-abc12345.js");
    return { default: () => <p>Help loaded</p> };
  });
}

describe("a panel opened while offline", () => {
  it("explains instead of reloading", async () => {
    setOnline(false);
    const Help = chunkThatFailsUntil(() => false);
    render(
      <ErrorBoundary label="Help" variant="panel">
        <Suspense fallback={null}>
          <Help />
        </Suspense>
      </ErrorBoundary>
    );
    expect(await screen.findByText(/you're offline/i)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it("opens by itself when the connection returns, without a reload", async () => {
    let reachable = false;
    setOnline(false);
    const Help = chunkThatFailsUntil(() => reachable);
    render(
      <ErrorBoundary label="Help" variant="panel">
        <Suspense fallback={null}>
          <Help />
        </Suspense>
      </ErrorBoundary>
    );
    await screen.findByText(/you're offline/i);

    reachable = true;
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(await screen.findByText("Help loaded")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it("still reloads once for a genuinely stale deploy while online", async () => {
    setOnline(true);
    try {
      sessionStorage.clear();
    } catch {
      /* jsdom always has it */
    }
    const Gone = chunkThatFailsUntil(() => false);
    render(
      <ErrorBoundary label="Help" variant="panel">
        <Suspense fallback={null}>
          <Gone />
        </Suspense>
      </ErrorBoundary>
    );
    await screen.findByText(/new version/i);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
