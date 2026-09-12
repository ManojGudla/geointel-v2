import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where a selected place says it came from.
 *
 * This matters more here than it looks. The product's one promise is that
 * every answer names its source, and `location.source` is the field carrying
 * that for the place itself. selectMapPoint used to hard-code "Map click"
 * because a click was the only way in.
 *
 * It is not any more. The quick actions now select the centre of the current
 * view when nothing has been chosen, because before that they did nothing at
 * all and over a hundred people reported the app as broken. Reusing the same
 * function was right; letting it keep claiming "Map click" for a press the
 * user made on a button would have been a small lie in exactly the field
 * that must never contain one.
 */

const reverseGeocode = vi.fn();
vi.mock("@/services/geocode", () => ({
  reverseGeocode: (...args: unknown[]) => reverseGeocode(...args),
}));

const { selectMapPoint, coordinateOnlyLocation } = await import("../../src/features/location/selectPoint");
const { useLocationStore } = await import("../../src/stores/locationStore");

const LAT = 17.3616;
const LON = 78.4747;

describe("coordinateOnlyLocation", () => {
  it("records whatever source it is given", () => {
    expect(coordinateOnlyLocation(LAT, LON, "Map centre").source).toBe("Map centre");
  });

  it("names the pin honestly rather than inventing an address", () => {
    const loc = coordinateOnlyLocation(LAT, LON, "Map centre");
    expect(loc.name).toBe("Dropped pin");
    expect(loc.address).toEqual({});
  });
});

describe("selectMapPoint provenance", () => {
  beforeEach(() => {
    reverseGeocode.mockReset();
    useLocationStore.setState({ selectedLocation: null });
  });

  it("defaults to a map click, so existing callers are unchanged", async () => {
    reverseGeocode.mockRejectedValueOnce(new Error("offline"));
    await selectMapPoint(LAT, LON);
    expect(useLocationStore.getState().selectedLocation?.source).toContain("Map click");
  });

  it("says 'Map centre' when a quick action chose the point rather than the user", async () => {
    reverseGeocode.mockRejectedValueOnce(new Error("offline"));
    await selectMapPoint(LAT, LON, undefined, "Map centre");
    const source = useLocationStore.getState().selectedLocation?.source ?? "";
    expect(source).toContain("Map centre");
    expect(source).not.toContain("Map click");
  });

  it("selects the point immediately, before the address lookup resolves", async () => {
    // A press has to move the marker in the same frame. Nominatim can take
    // seconds, and on a bad network ten; nobody waits that long to find out
    // whether their press registered, which is the whole bug being fixed.
    let resolve!: (v: unknown) => void;
    reverseGeocode.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    const pending = selectMapPoint(LAT, LON, undefined, "Map centre");
    expect(useLocationStore.getState().selectedLocation).not.toBeNull();
    expect(useLocationStore.getState().selectedLocation?.lat).toBe(LAT);

    resolve({ lat: LAT, lon: LON, displayName: "Charminar", name: "Charminar", address: {}, source: "Nominatim" });
    await pending;
    expect(useLocationStore.getState().selectedLocation?.name).toBe("Charminar");
  });

  it("keeps the failure note attached to the source it was given", async () => {
    reverseGeocode.mockRejectedValueOnce(new Error("no address"));
    await selectMapPoint(LAT, LON, undefined, "Map centre");
    expect(useLocationStore.getState().selectedLocation?.source).toBe(
      "Map centre · no address found for this point"
    );
  });
});
