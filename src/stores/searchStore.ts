import { create } from "zustand";
import type { SearchSuggestion } from "@/types/location";

const HISTORY_KEY = "geointel.recentSearches.v1";
const MAX_HISTORY = 5;

function loadHistory(): SearchSuggestion[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SearchSuggestion[]) : [];
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
