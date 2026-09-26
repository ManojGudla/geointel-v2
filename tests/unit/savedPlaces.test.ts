import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Saved places: kept in this browser, deduplicated, bounded, and robust to
 * whatever is already sitting in storage.
 */

const KEY = "geointel.savedPlaces.v1";
const place = (name: string, lat: number, lon: number) => ({ name, displayName: `${name}, Hyderabad`, lat, lon });

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function store() {
  return (await import("../../src/stores/savedPlacesStore")).useSavedPlacesStore;
}

describe("saved places", () => {
  it("saves, reports and removes a place", async () => {
    const s = await store();
    expect(s.getState().save(place("Office", 17.44, 78.35))).toBe(true);
    expect(s.getState().isSaved({ lat: 17.44, lon: 78.35 })).toBe(true);
    s.getState().remove({ lat: 17.44, lon: 78.35 });
    expect(s.getState().saved).toHaveLength(0);
  });

  it("does not save the same point twice", async () => {
    const s = await store();
    s.getState().save(place("Office", 17.44, 78.35));
    s.getState().save(place("Office again", 17.440001, 78.350001));
    expect(s.getState().saved).toHaveLength(1);
  });

  it("survives a reload", async () => {
    (await store()).getState().save(place("Home", 17.4, 78.4));
    vi.resetModules();
    expect((await store()).getState().saved.map((p) => p.name)).toEqual(["Home"]);
  });

  it("refuses past the limit instead of silently dropping an old one", async () => {
    const { MAX_SAVED } = await import("../../src/stores/savedPlacesStore");
    const s = await store();
    for (let i = 0; i < MAX_SAVED; i++) s.getState().save(place(`P${i}`, 10 + i, 70));
    expect(s.getState().save(place("One too many", 50, 50))).toBe(false);
    expect(s.getState().saved).toHaveLength(MAX_SAVED);
  });

  it("ignores junk already in storage", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ name: 5 }, "x", { ...place("Kept", 1, 2), savedAt: "2026-09-26T00:00:00Z" }]));
    expect((await store()).getState().saved.map((p) => p.name)).toEqual(["Kept"]);
  });
});
