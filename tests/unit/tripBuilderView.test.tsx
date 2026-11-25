import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TripPlan } from "../../src/types/ai";

/** The Make My Trip screen, with the plan request replaced (MOCK: no server). */
const PLAN: TripPlan = {
  order: "nearest-next",
  mode: "walk",
  days: [
    {
      day: 1,
      totalMinutes: 135,
      warnings: [],
      stops: [
        { name: "Mecca Masjid", category: "attractions", lat: 17.3606, lon: 78.4736, visitMinutes: 90, leg: { distanceMeters: 150, minutes: 2, source: "OSRM" } },
        { name: "Laad Bazaar", category: "shopping", lat: 17.3611, lon: 78.4716, visitMinutes: 60, leg: null },
      ],
    },
  ],
  assumptions: ["Time at each stop is this app's assumption, not opening hours: attractions 90 min."],
  evidence: [{ id: "E1", label: "Named sights found within 2 km", value: "2", kind: "retrieved", source: "OpenStreetMap via Overpass" }],
  steps: [],
  generatedAt: "2026-11-25T07:31:00.000Z",
};

const CHARMINAR = { name: "Charminar", displayName: "Charminar, Hyderabad", lat: 17.3616, lon: 78.4747 };
const setResult = vi.fn();

async function renderBuilder(buildTripPlan: (...args: unknown[]) => Promise<TripPlan>) {
  vi.doMock("../../src/services/ai", () => ({ buildTripPlan }));
  vi.doMock("../../src/stores/locationStore", () => ({
    useLocationStore: (selector: (s: unknown) => unknown) => selector({ selectedLocation: CHARMINAR, radiusMeters: 250 }),
  }));
  vi.doMock("../../src/stores/analysisStore", () => ({
    useAnalysisStore: (selector: (s: unknown) => unknown) => selector({ setResult }),
  }));
  const { TripBuilder } = await import("../../src/features/ai/TripBuilder");
  const view = render(<TripBuilder />);
  fireEvent.click(screen.getByText(/Make My Trip: build a day-by-day plan/));
  return view;
}

describe("Make My Trip, the planner", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock("../../src/services/ai");
    vi.doUnmock("../../src/stores/locationStore");
    vi.doUnmock("../../src/stores/analysisStore");
    vi.clearAllMocks();
  });

  it("asks for the chosen interests, days, stops and travel mode", async () => {
    const build = vi.fn(async () => PLAN);
    await renderBuilder(build);
    fireEvent.click(screen.getByLabelText("Cafes"));
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Travel"), { target: { value: "walk" } });
    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));
    await waitFor(() => expect(build).toHaveBeenCalled());
    expect(build.mock.calls[0]![1]).toEqual({ interests: ["attractions", "restaurants", "parks", "cafes"], days: 2, stopsPerDay: 3, mode: "walk", stops: undefined });
  });

  it("shows each day with its stops, measured hops, assumed visit times, and an unknown hop as unknown", async () => {
    await renderBuilder(async () => PLAN);
    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));
    const day = await screen.findByRole("region", { name: "Day 1" });
    expect(within(day).getByText("Day 1 · about 2 h 15 min")).toBeTruthy();
    expect(day.textContent).toContain("↳ 150 m, about 2 min (OSRM)");
    expect(day.textContent).toContain("Sight · 90 min (assumed)");
    expect(day.textContent).toContain("↳ travel time unknown");
  });

  it("lets the visitor reorder and remove stops, then re-measures their order", async () => {
    const build = vi.fn(async () => PLAN);
    await renderBuilder(build);
    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reorder or remove stops" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Laad Bazaar earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Re-measure my order" }));
    await waitFor(() => expect(build).toHaveBeenCalledTimes(2));
    expect((build.mock.calls[1]![1] as { stops: Array<{ name: string }> }).stops.map((s) => s.name)).toEqual(["Laad Bazaar", "Mecca Masjid"]);
  });

  it("draws the numbered stops and each day's line on the map", async () => {
    await renderBuilder(async () => PLAN);
    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show on the map" }));
    const drawn = setResult.mock.calls[0]![0];
    expect(drawn.kind).toBe("trip");
    expect(drawn.points.map((p: { label: string }) => p.label)).toEqual(["1. Mecca Masjid", "2. Laad Bazaar"]);
    expect(drawn.paths).toEqual([[[78.4747, 17.3616], [78.4736, 17.3606], [78.4716, 17.3611]]]);
  });
});

describe("Make My Trip with nothing to plan", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock("../../src/services/ai");
    vi.doUnmock("../../src/stores/locationStore");
    vi.doUnmock("../../src/stores/analysisStore");
  });

  it("says no stops could be planned and opens the evidence that says why", async () => {
    const empty: TripPlan = { ...PLAN, days: [], evidence: [{ id: "E1", label: "Nearby places", value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: "The nearby search did not answer." }] };
    const { container } = await renderBuilder(async () => empty);
    fireEvent.click(screen.getByRole("button", { name: "Build plan" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^No stops could be planned/);
    expect((container.querySelector(".agent-evidence__details") as HTMLDetailsElement).open).toBe(true);
    expect(screen.queryByRole("button", { name: "Show on the map" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Show on the map" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
