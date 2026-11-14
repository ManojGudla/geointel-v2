import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

/**
 * Every city page showed an empty box where its map should be. The map's own
 * "load" handler changed the state its setup effect depended on, so the
 * effect re-ran and its cleanup removed the map it had just finished
 * building. The map must survive its own load event.
 */

const removed = vi.fn();
let fireLoad: () => void = () => {};

vi.mock("maplibre-gl", () => {
  class FakeMap {
    on(event: string, cb: () => void) {
      if (event === "load") fireLoad = cb;
    }
    remove() {
      removed();
    }
    isStyleLoaded() {
      return false;
    }
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  return { default: { Map: FakeMap, Marker: FakeMarker } };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("@/services/gis", () => ({ fetchGISEvidence: vi.fn(async () => ({ features: [] })) }));

import { CityMap } from "../../src/features/city/CityMap";
import { CITIES } from "../../src/data/cities";

afterEach(cleanup);

describe("CityMap", () => {
  it("keeps the map after it finishes loading", async () => {
    vi.useFakeTimers();
    const { container } = render(<CityMap city={CITIES[0]!} />);
    // The engine starts once the browser is idle (or after 600 ms).
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    vi.useRealTimers();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireLoad();
    });
    expect(removed).not.toHaveBeenCalled();
    // And the "Loading" placeholder is gone, because the map is showing.
    expect(container.querySelector(".city-map__placeholder")).toBeNull();
  });
});
