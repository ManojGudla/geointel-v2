import { describe, expect, it } from "vitest";
import { arrivalTime, formatDuration, turnIcon } from "@/features/routing/turnIcon";
import { useRouteStore } from "@/stores/routeStore";

const point = (name: string, lat: number, lon: number) => ({ lat, lon, displayName: name, name });

describe("duration and arrival formatting", () => {
  it("formats minutes and hours the way a maps app does", () => {
    expect(formatDuration(30)).toBe("under a minute");
    expect(formatDuration(240)).toBe("4 min");
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(4320)).toBe("1h 12m");
  });

  it("computes an arrival clock time from now plus the duration", () => {
    const now = new Date(2026, 8, 1, 17, 30, 0);
    // 45 minutes later is 18:15 — checked without asserting the locale's
    // exact separator or 12/24-hour choice.
    const result = arrivalTime(45 * 60, now);
    expect(result).toMatch(/\b(18|6)\b/);
    expect(result).toContain("15");
  });
});

describe("turn icons", () => {
  it("uses the manoeuvre type before the modifier", () => {
    expect(turnIcon("depart", "left")).toBe("🚩");
    expect(turnIcon("arrive")).toBe("🏁");
    expect(turnIcon("roundabout", "right")).toBe("🔄");
  });

  it("distinguishes left from right", () => {
    expect(turnIcon("turn", "left")).not.toBe(turnIcon("turn", "right"));
    expect(turnIcon("turn", "slight left")).not.toBe(turnIcon("turn", "left"));
  });

  it("falls back to straight ahead for anything unrecognised", () => {
    expect(turnIcon("something-new")).toBe("⬆️");
    expect(turnIcon("turn", "not-a-real-modifier")).toBe("⬆️");
  });
});

describe("route store", () => {
  const reset = () =>
    useRouteStore.setState({ from: null, to: null, mode: "car", selectedOption: 0, activeStep: null, isPanelOpen: false });

  it("swaps the two endpoints", () => {
    reset();
    const a = point("A", 1, 2);
    const b = point("B", 3, 4);
    useRouteStore.getState().setFrom(a);
    useRouteStore.getState().setTo(b);
    useRouteStore.getState().swap();
    expect(useRouteStore.getState().from).toEqual(b);
    expect(useRouteStore.getState().to).toEqual(a);
  });

  it("swaps correctly when only one endpoint is set", () => {
    reset();
    useRouteStore.getState().setTo(point("B", 3, 4));
    useRouteStore.getState().swap();
    expect(useRouteStore.getState().from).toEqual(point("B", 3, 4));
    expect(useRouteStore.getState().to).toBeNull();
  });

  it("clears the highlighted step when an endpoint changes", () => {
    reset();
    useRouteStore.getState().setActiveStep(5);
    useRouteStore.getState().setFrom(point("A", 1, 2));
    expect(useRouteStore.getState().activeStep).toBeNull();
  });

  it("clears the highlighted step and option when the mode changes", () => {
    reset();
    useRouteStore.getState().setSelectedOption(2);
    useRouteStore.getState().setActiveStep(3);
    useRouteStore.getState().setMode("walk");
    expect(useRouteStore.getState().selectedOption).toBe(0);
    expect(useRouteStore.getState().activeStep).toBeNull();
  });

  it("clears the highlighted step when a different route option is picked", () => {
    reset();
    useRouteStore.getState().setActiveStep(4);
    useRouteStore.getState().setSelectedOption(1);
    expect(useRouteStore.getState().selectedOption).toBe(1);
    expect(useRouteStore.getState().activeStep).toBeNull();
  });

  it("clears the highlighted step when the panel closes", () => {
    reset();
    useRouteStore.getState().setActiveStep(2);
    useRouteStore.getState().closePanel();
    expect(useRouteStore.getState().activeStep).toBeNull();
    expect(useRouteStore.getState().isPanelOpen).toBe(false);
  });

  it("keeps an existing destination when the panel is opened with none", () => {
    reset();
    const b = point("B", 3, 4);
    useRouteStore.getState().setTo(b);
    useRouteStore.getState().openPanel();
    expect(useRouteStore.getState().to).toEqual(b);
    expect(useRouteStore.getState().isPanelOpen).toBe(true);
  });
});
