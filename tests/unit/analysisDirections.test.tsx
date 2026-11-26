import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalysisResultView } from "../../src/features/analysis/AnalysisResultView";
import { placeLabel } from "../../src/features/analysis/categories";
import { useAnalysisStore, type AnalysisResult } from "../../src/stores/analysisStore";
import { useLocationStore } from "../../src/stores/locationStore";
import { useRouteStore } from "../../src/stores/routeStore";

/**
 * Reported 25 November 2026: "directions not coming". After the ATM chip
 * listed four ATMs within 2 km, every row read "atms" and tapping one did
 * nothing, and Directions tried to route to the visitor's own location.
 */
const ME = { lat: 17.421442, lon: 78.347766, name: "My Location", displayName: "My Location", address: {}, source: "Your device's location" };

const RESULT: AnalysisResult = {
  kind: "within",
  title: "ATMs within 2.0 km",
  origin: { lat: ME.lat, lon: ME.lon },
  points: [
    { id: "node/1", lat: 17.4221, lon: 78.3489, label: "ATM", distanceMeters: 164 },
    { id: "node/2", lat: 17.4302, lon: 78.3511, label: "State Bank of India ATM", distanceMeters: 1000 },
  ],
  stats: [{ label: "Found", value: "2" }],
  note: "Results are features tagged in OpenStreetMap.",
} as AnalysisResult;

beforeAll(() => {
  // jsdom has no layout, so no scrollIntoView; the view calls it to bring a new result on screen.
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  useRouteStore.getState().clear();
  useRouteStore.setState({ isPanelOpen: false });
  useLocationStore.setState({ selectedLocation: null });
  useAnalysisStore.setState({ result: null });
});

describe("a place with no name on the map", () => {
  it("is called what it is, not by its category's code", () => {
    expect(placeLabel({ name: "atms", category: "atms", tags: {} })).toBe("ATM");
    expect(placeLabel({ name: "hospitals", category: "hospitals" })).toBe("Hospital or clinic");
  });

  it("takes its brand or operator when the map has one", () => {
    expect(placeLabel({ name: "atms", category: "atms", tags: { operator: "State Bank of India" } })).toBe("State Bank of India ATM");
    // No "SBI ATM ATM".
    expect(placeLabel({ name: "atms", category: "atms", tags: { brand: "SBI ATM" } })).toBe("SBI ATM");
  });

  it("keeps a real name as it is", () => {
    expect(placeLabel({ name: "HDFC Bank ATM, Wave Rock", category: "atms", tags: { operator: "HDFC" } })).toBe("HDFC Bank ATM, Wave Rock");
  });
});

describe("tapping an analysis result", () => {
  it("opens directions to that place, starting where the distances were measured from", () => {
    useLocationStore.setState({ selectedLocation: ME as never });
    useAnalysisStore.setState({ result: RESULT });
    render(<AnalysisResultView />);

    fireEvent.click(screen.getByRole("button", { name: /^Directions to State Bank of India ATM/ }));

    const route = useRouteStore.getState();
    expect(route.isPanelOpen).toBe(true);
    expect(route.to).toMatchObject({ name: "State Bank of India ATM", lat: 17.4302, lon: 78.3511 });
    expect(route.from).toMatchObject({ name: "My Location", lat: ME.lat, lon: ME.lon });
  });

  it("starts at the analysis centre when another place has been selected since", () => {
    useLocationStore.setState({ selectedLocation: { ...ME, lat: 12.97, lon: 77.59, name: "Bengaluru" } as never });
    useAnalysisStore.setState({ result: RESULT });
    render(<AnalysisResultView />);

    fireEvent.click(screen.getByRole("button", { name: /^Directions to ATM/ }));
    expect(useRouteStore.getState().from).toMatchObject({ name: "Analysis centre", lat: ME.lat, lon: ME.lon });
  });
});
