import { describe, expect, it, vi } from "vitest";
import { whenSourceReady, type SourceReadyEvent, type SourceReadyMap } from "@/features/map/whenSourceReady";

/**
 * A minimal fake of the slice of MapLibre's Map this needs, with no real map
 * or WebGL involved. `on` registers a PERSISTENT listener (MapLibre's real
 * on() semantics) - the previous version of this fake used once(), which
 * quietly made the "waits through a spurious event" case untestable.
 */
function fakeMap(initialSources: string[] = []) {
  const sources = new Set(initialSources);
  const handlers: Record<SourceReadyEvent, Array<() => void>> = { load: [], styledata: [] };

  const map: SourceReadyMap = {
    getSource: (id) => (sources.has(id) ? {} : undefined),
    on: (event, handler) => {
      handlers[event].push(handler);
    },
    off: (event, handler) => {
      handlers[event] = handlers[event].filter((h) => h !== handler);
    },
  };

  return {
    map,
    addSource: (id: string) => sources.add(id),
    removeSource: (id: string) => sources.delete(id),
    emit: (event: SourceReadyEvent) => [...handlers[event]].forEach((h) => h()),
    pendingCount: (event: SourceReadyEvent) => handlers[event].length,
  };
}

describe("whenSourceReady", () => {
  it("runs immediately, synchronously, when the source already exists", () => {
    const { map } = fakeMap(["geointel-gis-features"]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-gis-features", run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits for 'load' when the source doesn't exist yet (the pre-initial-load case)", () => {
    const { map, addSource, emit } = fakeMap([]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-gis-features", run);
    expect(run).not.toHaveBeenCalled();

    addSource("geointel-gis-features");
    emit("load");
    expect(run).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression test for the reported bug: switch the basemap while
   * measuring and only the vertex dots stay on screen - the line and the
   * area fill disappear.
   *
   * This function used to wait on "style.load", and this test used to assert
   * that it resolved when "style.load" fired - a test that passed while the
   * app was broken, because it asserted the wrong world. MapLibre's
   * setStyle() defaults to diffing into the EXISTING Style object rather
   * than building a new one, and "style.load" is fired only when a Style
   * loads from scratch. So a basemap switch emits "styledata" and never
   * "style.load" or "load" - which is precisely what this test now
   * reproduces, and what the old implementation would fail.
   */
  it("resolves on 'styledata' alone, since a basemap swap fires neither 'load' nor 'style.load'", () => {
    const { map, addSource, emit } = fakeMap([]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-measure", run);
    expect(run).not.toHaveBeenCalled();

    addSource("geointel-measure");
    emit("styledata");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not run if the source still doesn't exist when the event fires (avoids a crash on source?.setData)", () => {
    const { map, emit } = fakeMap([]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-route", run);
    emit("styledata"); // fires, but the source was never actually added
    expect(run).not.toHaveBeenCalled();
  });

  /**
   * "styledata" fires for style changes that have nothing to do with this
   * source, so an early one must not consume the wait - the listener has to
   * stay armed until the source genuinely appears. Under the old once()-based
   * implementation the first spurious event would deregister the handler and
   * the update would be lost forever.
   */
  it("stays armed through style events that don't bring the source back, then resolves on the one that does", () => {
    const { map, addSource, emit } = fakeMap([]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-buildings-3d", run);

    emit("styledata");
    emit("styledata");
    expect(run).not.toHaveBeenCalled();

    addSource("geointel-buildings-3d");
    emit("styledata");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("detaches both listeners once it has run, so later style events can't double-run it", () => {
    const { map, addSource, emit, pendingCount } = fakeMap([]);
    const run = vi.fn();
    whenSourceReady(map, "geointel-buildings-3d", run);

    addSource("geointel-buildings-3d");
    emit("styledata");
    expect(run).toHaveBeenCalledTimes(1);
    expect(pendingCount("load")).toBe(0);
    expect(pendingCount("styledata")).toBe(0);

    emit("styledata");
    emit("load");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
