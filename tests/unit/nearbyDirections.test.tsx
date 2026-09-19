import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NearbyPanel } from "../../src/features/nearby/NearbyPanel";
import { useLocationStore } from "../../src/stores/locationStore";
import { useRouteStore } from "../../src/stores/routeStore";

/**
 * Nearby listed real places with real distances and did nothing when you
 * touched them.
 *
 * That is a worse failure than it sounds. Printing "Domino's, 98 m" is a
 * promise that the app knows exactly where Domino's is; leaving the row
 * inert then asks the reader to type the name into the Directions panel
 * themselves, to find a place the app just located for them. Every row was a
 * dead end, thirteen categories deep.
 */

const HERE = {
  lat: 17.4194,
  lon: 78.3474,
  name: "Wave Rock Tower 2.3",
  displayName: "Wave Rock Tower 2.3, Khajaguda",
  address: {},
  source: "OpenStreetMap / Nominatim",
};

const ITEMS = [
  { id: "1", name: "Domino's", category: "restaurants", lat: 17.42, lon: 78.348, distanceMeters: 98, tags: {} },
  { id: "2", name: "Being Hungry", category: "restaurants", lat: 17.4205, lon: 78.3485, distanceMeters: 164, tags: {} },
];

vi.mock("../../src/services/intel", () => ({
  fetchNearby: vi.fn(async () => ITEMS),
  // The panel takes the fuller result now, so it can tell the reader when
  // the server widened the search because nothing was mapped nearby.
  fetchNearbyResult: vi.fn(async () => ({
    items: ITEMS,
    radiusMeters: 1500,
    requestedRadiusMeters: 1500,
    widened: false,
  })),
}));

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NearbyPanel />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  useRouteStore.getState().clear();
  useRouteStore.setState({ isPanelOpen: false });
  useLocationStore.setState({ selectedLocation: null });
});

describe("tapping a nearby place", () => {
  it("opens directions to it", async () => {
    useLocationStore.setState({ selectedLocation: HERE as never });
    renderPanel();

    const row = await screen.findByRole("button", { name: "Directions to Domino's" });
    fireEvent.click(row);

    await waitFor(() => expect(useRouteStore.getState().isPanelOpen).toBe(true));
    expect(useRouteStore.getState().to).toMatchObject({ name: "Domino's", lat: 17.42, lon: 78.348 });
  });

  it("routes FROM the place being explored, not from anywhere else", async () => {
    /*
      The distances in this list are measured from the selected location, so
      a route that started somewhere else would contradict the number printed
      beside the name.
    */
    useLocationStore.setState({ selectedLocation: HERE as never });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Directions to Being Hungry" }));

    await waitFor(() => expect(useRouteStore.getState().from).toMatchObject({ lat: HERE.lat, lon: HERE.lon }));
  });

  it("gives every row a real button, not a click handler on a list item", async () => {
    // Keyboard reachable and screen-reader announced, which a clickable <li>
    // is neither.
    useLocationStore.setState({ selectedLocation: HERE as never });
    renderPanel();

    const rows = await screen.findAllByRole("button", { name: /^Directions to / });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.tagName).toBe("BUTTON");
  });

  it("still shows the distance it always showed", async () => {
    useLocationStore.setState({ selectedLocation: HERE as never });
    renderPanel();
    expect(await screen.findByText("98 m")).toBeTruthy();
  });
});

describe("the air quality badge", () => {
  /**
   * Every band painted its label white, and two of the six EEA colours are
   * light: "Fair" (#6fbf4b) and "Moderate" (#e0a825) put white text at about
   * 2.2:1, so the label was near-invisible in both themes on exactly the
   * readings a person is most likely to be checking.
   *
   * The band colours are published by the European Environment Agency and
   * are not ours to adjust, so the ink moves instead.
   */
  it("picks ink that clears WCAG AA on every published band", async () => {
    const { aqiBand, readableInkOn } = await import("../../src/features/live/useLiveLayers");

    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (hi + 0.05) / (lo + 0.05);
    };

    for (const aqi of [null, 10, 30, 50, 70, 90, 150]) {
      const band = aqiBand(aqi);
      expect(contrast(band.color, band.textColor), `${band.label} (${band.color})`).toBeGreaterThanOrEqual(4.5);
    }

    /*
      The specific miss this guards against. An earlier version compared
      white against a hypothetical pure black while actually painting
      #101828, so "Good" scored 4.85 on paper and rendered at 4.09.
    */
    expect(contrast("#1a8a5f", readableInkOn("#1a8a5f"))).toBeGreaterThanOrEqual(4.5);
  });
});
