import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocationIdentityPanel } from "../../src/features/location/LocationIdentityPanel";
import { useLocationStore } from "../../src/stores/locationStore";

/**
 * Share must put a LINK on the clipboard when there is no share sheet.
 *
 * Firefox and most Linux browsers have no navigator.share. The fallback used
 * to call the "copy coordinates" handler, so the button said "Copied" while
 * the clipboard held "17.44190, 78.34740": nothing a recipient could open.
 */

vi.mock("../../src/services/intel", () => ({
  fetchWeather: vi.fn(() => new Promise(() => {})),
}));

const HERE = {
  lat: 17.4419,
  lon: 78.3474,
  name: "Wave Rock",
  displayName: "Wave Rock, Nanakramguda, Hyderabad",
  address: { city: "Hyderabad" },
  source: "OpenStreetMap / Nominatim",
};

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => void written.push(t)) },
  });
  useLocationStore.setState({ selectedLocation: HERE as never });
});

afterEach(() => {
  cleanup();
  useLocationStore.setState({ selectedLocation: null });
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocationIdentityPanel />
    </QueryClientProvider>
  );
}

describe("Share without a share sheet", () => {
  it("copies a link that reopens this place, not bare coordinates", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(written).toHaveLength(1));
    const url = new URL(written[0]!);
    expect(url.searchParams.get("lat")).toBe("17.4419");
    expect(url.searchParams.get("lon")).toBe("78.3474");
    expect(await screen.findByRole("button", { name: /link copied/i })).toBeTruthy();
  });

  it("says so when the clipboard refuses, instead of claiming success", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    expect(await screen.findByRole("button", { name: /couldn't copy the link/i })).toBeTruthy();
  });

  it("leaves Copy coordinates copying coordinates", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /copy coordinates/i }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).not.toMatch(/^https?:/);
  });
});
