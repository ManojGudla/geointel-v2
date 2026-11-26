import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropertySite } from "../../src/types/gis";

/**
 * The Property panel's states around the lookup itself (MOCK: the two data
 * hooks are replaced, so this proves what the panel says for each state,
 * not what the servers return).
 */
const state = vi.hoisted(() => ({
  site: { data: undefined as PropertySite | undefined, isPending: false, isError: false, refetch: vi.fn() },
  area: { data: null as unknown, isError: false },
}));

vi.mock("../../src/features/property/usePropertySite", () => ({ usePropertySite: () => state.site }));
vi.mock("../../src/features/gis/useGisEvidence", () => ({ useGisEvidence: () => state.area }));
vi.mock("../../src/stores/locationStore", () => ({
  useLocationStore: (pick: (s: { selectedLocation: { lat: number; lon: number; name: string } }) => unknown) =>
    pick({ selectedLocation: { lat: 17.38843, lon: 78.42341, name: "Near NH163" } }),
}));

import { PropertyIntelligencePanel } from "../../src/features/property/PropertyIntelligencePanel";

const SITE: PropertySite = {
  lat: 17.38843,
  lon: 78.42341,
  building: {
    osmType: "way",
    id: 1300,
    url: "https://www.openstreetmap.org/way/1300",
    tags: { building: "yes" },
    containsPoint: true,
    distanceMeters: 0,
    footprintM2: 131,
  },
  inside: [],
  areas: [],
  source: "OpenStreetMap / Overpass",
  dataAsOf: "2026-11-26T13:00:00Z",
  fetchedAt: "2026-11-26T13:20:00.000Z",
};

beforeEach(() => {
  state.site = { data: SITE, isPending: false, isError: false, refetch: vi.fn() };
  state.area = { data: null, isError: false };
});
afterEach(cleanup);

describe("the Property panel around the lookup", () => {
  it("says when the map server's answer was cut short, and offers to try again", () => {
    state.site.data = { ...SITE, incomplete: true };
    const { container } = render(<PropertyIntelligencePanel />);
    const notice = container.querySelector(".property-panel__notice");
    expect(notice?.textContent).toMatch(/^The map server's answer was cut short, so something mapped here may be missing\./);
    // The reading itself says so too, among its limitations.
    expect(screen.getAllByText(/cut short/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.site.refetch).toHaveBeenCalledTimes(1);
  });

  it("says nothing of the kind for a complete answer", () => {
    render(<PropertyIntelligencePanel />);
    expect(screen.queryByText(/cut short/)).toBeNull();
  });
});
