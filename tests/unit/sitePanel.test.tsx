import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocationStore } from "../../src/stores/locationStore";
import type { SiteResult } from "../../src/services/site";

/**
 * The one claim this panel must never make.
 *
 * It shows two things side by side: real data from OpenStreetMap, and links to
 * government portals that hold records the app cannot read. Somebody deciding
 * whether to buy a plot is exactly the wrong person to let assume the second
 * half is as authoritative as the first, so the panel carries an explicit
 * paragraph saying the links are a handoff and open at the portal's front door
 * rather than at their parcel.
 *
 * That paragraph is not decoration and it is the easiest thing in the file for
 * a future edit to quietly drop, so it is pinned here. The rest of these tests
 * cover the same principle: the Overpass half failing must never look like
 * "nothing is being built", and the links half must survive that failure.
 */

const fetchSite = vi.hoisted(() => vi.fn());
vi.mock("../../src/services/site", () => ({ fetchSite }));

const RESULT: SiteResult = {
  roads: [
    { name: "Tank Bund Road", kind: "primary", segments: 6, lanes: "4" },
    { name: "Necklace Road", kind: "residential", segments: 3, surface: "asphalt" },
  ],
  features: [
    { kind: "road-works", name: "Metro Corridor II", becoming: "primary", osm: "way/1" },
    { kind: "brownfield", name: null, osm: "way/2" },
  ],
  counts: { roads: 2, underConstruction: 1, awaitingDevelopment: 1 },
  radiusMeters: 600,
};

function setLocation() {
  useLocationStore.setState({
    selectedLocation: {
      lat: 17.385,
      lon: 78.4867,
      displayName: "Hyderabad, Telangana, India",
      name: "Hyderabad",
      address: { city: "Hyderabad", state: "Telangana", country: "India", countryCode: "IN" },
      source: "OpenStreetMap / Nominatim",
    },
  });
}

async function renderPanel() {
  const { SitePanel } = await import("../../src/features/site/SitePanel");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SitePanel />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchSite.mockReset();
  useLocationStore.setState({ selectedLocation: null });
});
afterEach(cleanup);

describe("the site panel", () => {
  it("says plainly that the record links are a handoff, not a plot lookup", async () => {
    setLocation();
    fetchSite.mockResolvedValue(RESULT);
    await renderPanel();

    const caution = document.querySelector(".site__caution")?.textContent ?? "";
    expect(caution).toMatch(/not in any free map dataset/i);
    expect(caution).toMatch(/front door/i);
  });

  it("shows the roads and the construction it was given", async () => {
    setLocation();
    fetchSite.mockResolvedValue(RESULT);
    await renderPanel();

    await waitFor(() => expect(screen.getByText("Tank Bund Road")).toBeTruthy());
    expect(screen.getByText("Necklace Road")).toBeTruthy();
    expect(screen.getByText("Metro Corridor II")).toBeTruthy();
    // A road under construction should say what it will become; that tag is
    // the difference between "a road" and "a primary road".
    expect(document.body.textContent).toContain("will be a primary");
  });

  it("keeps the record links working when OpenStreetMap is down", async () => {
    // The two halves are independent on purpose. Someone who came for the land
    // records portal must not be blocked by an unrelated Overpass outage.
    setLocation();
    fetchSite.mockRejectedValue(new Error("overpass unreachable"));
    await renderPanel();

    await waitFor(() => expect(screen.getByText(/Bhu Bharati land records/i)).toBeTruthy());
    expect(screen.getByText(/Bhuvan \(ISRO\)/i)).toBeTruthy();
  });

  it("offers the state's own portals when it knows them", async () => {
    setLocation();
    fetchSite.mockResolvedValue(RESULT);
    await renderPanel();

    expect(screen.getByText(/Telangana records and plans/i)).toBeTruthy();
    // Telangana's Dharani was replaced by Bhu Bharati in 2025; linking the old
    // one would send people to a portal that no longer serves this.
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a.site__portal")].map((a) => a.href);
    expect(links.some((h) => h.includes("bhubharati.telangana.gov.in"))).toBe(true);
  });

  it("opens every record link in a new tab, safely", async () => {
    setLocation();
    fetchSite.mockResolvedValue(RESULT);
    await renderPanel();

    for (const a of document.querySelectorAll<HTMLAnchorElement>("a.site__portal")) {
      expect(a.target).toBe("_blank");
      // Without noopener a government portal could reach back into this tab.
      expect(a.rel).toContain("noopener");
    }
  });

  it("asks for nothing until a place is chosen", async () => {
    await renderPanel();
    expect(fetchSite).not.toHaveBeenCalled();
  });
});
