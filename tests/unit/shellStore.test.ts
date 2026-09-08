import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The workspace panel's opening state.
 *
 * This is worth a test rather than a glance because the rule is
 * width-dependent and the two branches fail in opposite, invisible ways: get
 * it wrong on desktop and every feature stays hidden behind a 92px rail
 * (the reported "can't find anything on Windows"), get it wrong on a phone
 * and the panel eats the map on the smallest screen there is.
 *
 * The store reads the media query once, at module load, so each case has to
 * stub matchMedia and then re-import the module with a reset registry.
 */

function stubWidth(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

async function loadStore() {
  vi.resetModules();
  return await import("@/stores/shellStore");
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("workspace panel opening state", () => {
  it("opens on Map data on a wide screen", async () => {
    stubWidth(true);
    const { useShellStore } = await loadStore();
    const state = useShellStore.getState();
    expect(state.open).toBe(true);
    // "layers" is Map data & style: the one section with something to show
    // before a place has been chosen.
    expect(state.section).toBe("layers");
  });

  it("stays closed on a narrow screen", async () => {
    stubWidth(false);
    const { useShellStore } = await loadStore();
    const state = useShellStore.getState();
    expect(state.open).toBe(false);
    expect(state.section).toBe("place");
  });
});

describe("selecting a place", () => {
  it("switches an already-open desktop panel to Explore", async () => {
    stubWidth(true);
    const { useShellStore, watchLocationForPanel } = await loadStore();

    let emit: (hasLocation: boolean) => void = () => {};
    watchLocationForPanel((listener) => {
      emit = listener;
      return () => {};
    });

    // The regression this guards: the panel is open on Map data, the user
    // searches an address, and the app answers with a list of basemaps.
    expect(useShellStore.getState().section).toBe("layers");
    emit(true);
    expect(useShellStore.getState().section).toBe("place");
    expect(useShellStore.getState().open).toBe(true);
  });

  it("opens a closed phone panel on Explore", async () => {
    stubWidth(false);
    const { useShellStore, watchLocationForPanel } = await loadStore();

    let emit: (hasLocation: boolean) => void = () => {};
    watchLocationForPanel((listener) => {
      emit = listener;
      return () => {};
    });

    expect(useShellStore.getState().open).toBe(false);
    emit(true);
    expect(useShellStore.getState()).toMatchObject({ section: "place", open: true });
  });

  it("leaves a panel the user closed alone when the same place is re-reported", async () => {
    stubWidth(false);
    const { useShellStore, watchLocationForPanel } = await loadStore();

    let emit: (hasLocation: boolean) => void = () => {};
    watchLocationForPanel((listener) => {
      emit = listener;
      return () => {};
    });

    emit(true);
    useShellStore.getState().closePanel();
    // Still the same selection, so no transition and no second opening.
    emit(true);
    expect(useShellStore.getState().open).toBe(false);
  });
});
