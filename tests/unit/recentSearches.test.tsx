import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useSearchStore } from "../../src/stores/searchStore";

/**
 * Recent places.
 *
 * This store has persisted every search anyone made since the day it was
 * written, and until now nothing in the application ever read it back. A
 * feature that only writes is not a half-built feature, it is a liability:
 * the user got nothing from it, and their search history accumulated in the
 * browser with no way to see it and no way to delete it - on a site that asks
 * permission before it counts a page view.
 *
 * Two things are worth defending now that it is wired up. That the history is
 * actually SHOWN, because a silent regression here returns it to the state
 * above and nobody would notice. And that it can be CLEARED, because a
 * history you can see but not delete is the worse of the two.
 */

const STORAGE_KEY = "geointel.recentSearches.v1";

const place = (name: string, lat: number, lon: number) => ({
  lat,
  lon,
  name,
  displayName: `${name}, somewhere`,
});

describe("the recent-search store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSearchStore.setState({ recentSearches: [] });
  });

  it("keeps what was searched, newest first", () => {
    const { addRecentSearch } = useSearchStore.getState();
    addRecentSearch(place("Charminar", 17.385, 78.4867));
    addRecentSearch(place("Bengaluru", 12.9716, 77.5946));

    const names = useSearchStore.getState().recentSearches.map((s) => s.name);
    expect(names).toEqual(["Bengaluru", "Charminar"]);
  });

  it("survives a reload", () => {
    useSearchStore.getState().addRecentSearch(place("Charminar", 17.385, 78.4867));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Charminar");
  });

  it("does not list the same place twice", () => {
    const { addRecentSearch } = useSearchStore.getState();
    addRecentSearch(place("Charminar", 17.385, 78.4867));
    addRecentSearch(place("Bengaluru", 12.9716, 77.5946));
    addRecentSearch(place("Charminar", 17.385, 78.4867));

    const names = useSearchStore.getState().recentSearches.map((s) => s.name);
    expect(names).toEqual(["Charminar", "Bengaluru"]);
  });

  it("does not grow without limit", () => {
    const { addRecentSearch } = useSearchStore.getState();
    for (let i = 0; i < 50; i += 1) addRecentSearch(place(`Place ${i}`, i, i));
    // An unbounded history is a slow leak in storage and an ever-growing
    // record of where somebody has been looking.
    expect(useSearchStore.getState().recentSearches.length).toBeLessThanOrEqual(12);
  });

  it("clears from memory AND from storage", () => {
    /*
      Both halves matter. Emptying only the in-memory list would leave the
      history on disk, so it would come back on the next reload and the
      "Clear" button would be a lie.
    */
    const { addRecentSearch, clearRecentSearches } = useSearchStore.getState();
    addRecentSearch(place("Charminar", 17.385, 78.4867));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(1);

    clearRecentSearches();

    expect(useSearchStore.getState().recentSearches).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([]);
  });
});

describe("the search box actually shows them", () => {
  const source = readFileSync(join(process.cwd(), "src", "features", "search", "SearchBar.tsx"), "utf8");
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("reads the history back, not just writes it", () => {
    // The regression that would return this to a write-only store. Measured
    // in a browser before the fix: the history had entries and no component
    // in the app referenced `recentSearches` at all.
    expect(body).toMatch(/useSearchStore\(\(s\) => s\.recentSearches\)/);
    expect(body).toMatch(/recentSearches\.map/);
  });

  it("offers a way to delete it", () => {
    expect(body).toMatch(/useSearchStore\(\(s\) => s\.clearRecentSearches\)/);
    expect(body).toMatch(/onClick=\{clearRecentSearches\}/);
  });

  it("shows them only when the box is empty, so they never hide live results", () => {
    expect(body).toMatch(/query\.trim\(\)\.length === 0 && recentSearches\.length > 0/);
  });

  it("does not claim to be a second listbox for the combobox above", () => {
    /*
      The input declares aria-controls="search-suggestion-list". A second
      element with role="listbox" gives a screen reader two answers to the
      question of what the combobox controls.
    */
    const recentBlock = body.match(/search-bar__recent[\s\S]{0,1400}?<\/div>\s*\)\}/)?.[0] ?? "";
    expect(recentBlock).not.toMatch(/role="listbox"/);
  });
});
