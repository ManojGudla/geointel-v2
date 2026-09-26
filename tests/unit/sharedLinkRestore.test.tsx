import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup, waitFor } from "@testing-library/react";

/**
 * Opening a shared link must put the recipient where the sender was.
 *
 * Three gaps: a shared zoom below street level was overridden to 15 (every
 * city link is built at 11 or 12); a shared question was decoded and then
 * dropped; and under StrictMode the restore cancelled itself, so shared
 * links never worked in local development.
 */

const reverse = vi.fn();
const analyse = vi.fn(async () => ({}));
vi.mock("../../src/services/geocode", () => ({ reverseGeocode: (...a: unknown[]) => reverse(...a) }));
vi.mock("../../src/features/analysis/useRunAnalysis", () => ({ useRunAnalysis: () => analyse }));
vi.mock("../../src/services/analytics", () => ({ track: vi.fn() }));

import { useSharedLocationFromUrl } from "../../src/hooks/useSharedLocationFromUrl";
import { useLocationStore } from "../../src/stores/locationStore";
import { useMapStore } from "../../src/stores/mapStore";
import { useShellStore } from "../../src/stores/shellStore";
import { useSearchStore } from "../../src/stores/searchStore";

function Probe() {
  useSharedLocationFromUrl();
  return null;
}

function openWith(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  reverse.mockReset();
  analyse.mockClear();
  reverse.mockResolvedValue({ lat: 17.385, lon: 78.4867, name: "Hyderabad", displayName: "Hyderabad", address: {}, source: "test" });
  useLocationStore.setState({ selectedLocation: null });
  useMapStore.setState({ cameraPlacedFor: null, cameraRequest: null });
  useSearchStore.getState().setQuery("");
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("restoring a shared link", () => {
  it("selects the shared point, even under StrictMode", async () => {
    openWith("?lat=17.385&lon=78.4867");
    render(
      <StrictMode>
        <Probe />
      </StrictMode>
    );
    await waitFor(() => expect(useLocationStore.getState().selectedLocation?.name).toBe("Hyderabad"));
  });

  it("keeps the sender's zoom instead of forcing street level", async () => {
    openWith("?lat=17.385&lon=78.4867&z=11");
    render(<Probe />);
    expect(useMapStore.getState().cameraRequest?.zoom).toBe(11);
    expect(useMapStore.getState().cameraPlacedFor).toBe("17.385,78.4867");
  });

  it("runs a shared map question on arrival", async () => {
    openWith("?lat=17.385&lon=78.4867&q=hospitals%20within%203%20km");
    render(<Probe />);
    await waitFor(() => expect(analyse).toHaveBeenCalledTimes(1));
    expect(analyse.mock.calls[0]![0]).toMatchObject({
      operation: "within",
      category: "hospitals",
      radiusMeters: 3000,
      origin: { lat: 17.385, lon: 78.4867 },
    });
    expect(useShellStore.getState().section).toBe("tools");
  });

  it("puts a question it cannot run into the search box instead of dropping it", async () => {
    openWith("?lat=17.385&lon=78.4867&q=is%20this%20a%20nice%20area");
    render(<Probe />);
    await waitFor(() => expect(useSearchStore.getState().query).toBe("is this a nice area"));
    expect(analyse).not.toHaveBeenCalled();
  });
});
