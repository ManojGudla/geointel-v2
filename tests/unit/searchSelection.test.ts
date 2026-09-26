import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Picking a search result must select what was picked.
 *
 * The old flow waited for a reverse geocode of the result's coordinates and
 * then replaced the result with it. For a city that returns whatever street
 * crosses its centre point, so "Hyderabad" could arrive titled as a road, and
 * nothing at all was selected until that second lookup came back.
 */

const reverse = vi.fn();
vi.mock("../../src/services/geocode", () => ({
  reverseGeocode: (...args: unknown[]) => reverse(...args),
  searchLocations: vi.fn(),
}));

import { selectSuggestion } from "../../src/features/search/SearchBar";
import { useLocationStore } from "../../src/stores/locationStore";

const HYDERABAD = { lat: 17.385, lon: 78.4867, name: "Hyderabad", displayName: "Hyderabad, Telangana, India", type: "city" };
const CHARMINAR = { lat: 17.3616, lon: 78.4747, name: "Charminar", displayName: "Charminar, Hyderabad", type: "attraction" };

const streetAt = (lat: number, lon: number, road: string) => ({
  lat,
  lon,
  name: road,
  displayName: `${road}, Hyderabad`,
  address: { road, houseNumber: "12", city: "Hyderabad", state: "Telangana", countryCode: "IN" },
  source: "OpenStreetMap / Nominatim",
});

const set = (loc: unknown) => useLocationStore.getState().setSelectedLocation(loc as never);
const noop = () => {};

beforeEach(() => {
  reverse.mockReset();
  useLocationStore.setState({ selectedLocation: null });
});

describe("selecting a search result", () => {
  it("selects it immediately, before any second lookup finishes", async () => {
    reverse.mockReturnValue(new Promise(() => {}));
    void selectSuggestion(HYDERABAD, set, noop);
    expect(useLocationStore.getState().selectedLocation?.name).toBe("Hyderabad");
  });

  it("keeps the name that was picked and only adds the address", async () => {
    reverse.mockResolvedValue(streetAt(HYDERABAD.lat, HYDERABAD.lon, "Kalwa Street"));
    await selectSuggestion(HYDERABAD, set, noop);
    const loc = useLocationStore.getState().selectedLocation!;
    expect(loc.name).toBe("Hyderabad");
    expect(loc.displayName).toBe("Hyderabad, Telangana, India");
    expect(loc.address.countryCode).toBe("IN");
    expect(loc.address.state).toBe("Telangana");
  });

  it("does not give a city the street that runs through its centre", async () => {
    reverse.mockResolvedValue(streetAt(HYDERABAD.lat, HYDERABAD.lon, "Kalwa Street"));
    await selectSuggestion(HYDERABAD, set, noop);
    const { address } = useLocationStore.getState().selectedLocation!;
    expect(address.road).toBeUndefined();
    expect(address.houseNumber).toBeUndefined();
  });

  it("keeps the street for a specific place", async () => {
    reverse.mockResolvedValue(streetAt(CHARMINAR.lat, CHARMINAR.lon, "Charminar Road"));
    await selectSuggestion(CHARMINAR, set, noop);
    expect(useLocationStore.getState().selectedLocation!.address.road).toBe("Charminar Road");
  });

  it("never lets a slow lookup overwrite a newer choice", async () => {
    let finishFirst!: (v: unknown) => void;
    reverse
      .mockReturnValueOnce(new Promise((r) => (finishFirst = r)))
      .mockResolvedValueOnce(streetAt(CHARMINAR.lat, CHARMINAR.lon, "Charminar Road"));

    const first = selectSuggestion(HYDERABAD, set, noop);
    await selectSuggestion(CHARMINAR, set, noop);
    finishFirst(streetAt(HYDERABAD.lat, HYDERABAD.lon, "Kalwa Street"));
    await first;

    expect(useLocationStore.getState().selectedLocation!.name).toBe("Charminar");
  });

  it("stays selected when the address lookup fails", async () => {
    reverse.mockRejectedValue(new Error("offline"));
    await selectSuggestion(CHARMINAR, set, noop);
    expect(useLocationStore.getState().selectedLocation!.name).toBe("Charminar");
  });
});
