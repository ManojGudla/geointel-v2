import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

describe("Free to use notice", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    // jsdom has no matchMedia; the motion-preference hook reads it.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens on the first visit only, and can be reopened from the menu", async () => {
    const { useFreeNoticeStore } = await import("../../src/features/notice/freeNoticeStore");
    expect(useFreeNoticeStore.getState().isOpen).toBe(true);
    useFreeNoticeStore.getState().close();
    expect(useFreeNoticeStore.getState().isOpen).toBe(false);

    vi.resetModules();
    const nextVisit = await import("../../src/features/notice/freeNoticeStore");
    expect(nextVisit.useFreeNoticeStore.getState().isOpen).toBe(false);
    // More > Free to use.
    nextVisit.useFreeNoticeStore.getState().open();
    expect(nextVisit.useFreeNoticeStore.getState().isOpen).toBe(true);
  });

  it("says it is free and independent, and keeps the work caution", async () => {
    const { FreeToUseNotice } = await import("../../src/features/notice/FreeToUseNotice");
    render(<FreeToUseNotice />);
    expect(screen.getByRole("dialog", { name: /free for everyone/i })).toBeTruthy();
    expect(screen.getByText(/not affiliated with Apple, Google/i)).toBeTruthy();
    expect(screen.getByText(/Apple and Google employees are welcome too/i)).toBeTruthy();
    expect(screen.getByText(/follow your employer.s rules and never\s+enter confidential/i)).toBeTruthy();
  });

  it("closes itself after 4 seconds", async () => {
    vi.useFakeTimers();
    const { FreeToUseNotice, AUTO_CLOSE_MS } = await import("../../src/features/notice/FreeToUseNotice");
    expect(AUTO_CLOSE_MS).toBe(4000);
    render(<FreeToUseNotice />);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3_900));
    expect(screen.queryByRole("dialog")).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not close while the pointer is over it", async () => {
    vi.useFakeTimers();
    const { FreeToUseNotice } = await import("../../src/features/notice/FreeToUseNotice");
    render(<FreeToUseNotice />);
    fireEvent.pointerEnter(screen.getByRole("dialog"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("closes with the ✕ and with Cancel", async () => {
    const { FreeToUseNotice } = await import("../../src/features/notice/FreeToUseNotice");
    const { useFreeNoticeStore } = await import("../../src/features/notice/freeNoticeStore");
    render(<FreeToUseNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Close this notice" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => useFreeNoticeStore.getState().open());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("one first-run pop-up at a time", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("holds the getting-started card back until the notice closes", async () => {
    const { useFreeNoticeStore } = await import("../../src/features/notice/freeNoticeStore");
    const { useOnboardingVisible } = await import("../../src/features/onboarding/onboardingVisibility");
    const { renderHook } = await import("@testing-library/react");
    const { result } = renderHook(() => useOnboardingVisible());
    expect(useFreeNoticeStore.getState().isOpen).toBe(true);
    expect(result.current).toBe(false);
    act(() => useFreeNoticeStore.getState().close());
    expect(result.current).toBe(true);
  });
});
