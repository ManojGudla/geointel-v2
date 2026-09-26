import { create } from "zustand";
import type { SearchSuggestion } from "@/types/location";

const HISTORY_KEY = "geointel.recentSearches.v1";
const MAX_HISTORY = 5;

/** A stored entry that can actually be shown and selected. */
function isUsableEntry(value: unknown): value is SearchSuggestion {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.displayName === "string" &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lon === "number" &&
    Number.isFinite(v.lon)
  );
}

/*
  Checked, not cast. Storage is shared with every other script on this origin
  and survives app versions: a string, an object or a half-written entry used
  to reach recentSearches.map() and take the whole search box down with it.
  Anything unusable is dropped; the rest is kept.
*/
function loadHistory(): SearchSuggestion[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUsableEntry).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: SearchSuggestion[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Non-fatal: private browsing / storage quota.
  }
}

interface SearchState {
  query: string;
  recentSearches: SearchSuggestion[];
  setQuery: (query: string) => void;
  addRecentSearch: (item: SearchSuggestion) => void;
  clearRecentSearches: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  recentSearches: loadHistory(),
  setQuery: (query) => set({ query }),
  addRecentSearch: (item) => {
    const withoutDupe = get().recentSearches.filter((s) => s.displayName !== item.displayName);
    const next = [item, ...withoutDupe].slice(0, MAX_HISTORY);
    set({ recentSearches: next });
    saveHistory(next);
  },
  clearRecentSearches: () => {
    set({ recentSearches: [] });
    saveHistory([]);
  },
}));
