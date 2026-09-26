import { create } from "zustand";
import type { SearchSuggestion } from "@/types/location";

/**
 * Places someone chose to keep: home, the office, a plot they are looking at.
 *
 * Browser-only, like recent searches. There are no accounts, so there is
 * nothing to sync to, and the Feature Status page and the Save button both say
 * so rather than implying the list follows you between devices.
 */

const SAVED_KEY = "geointel.savedPlaces.v1";
/** Enough for real use; small enough that the list never needs scrolling on a phone. */
export const MAX_SAVED = 12;

export interface SavedPlace extends SearchSuggestion {
  savedAt: string;
}

/** Two places are the same place when they are within about a metre. */
export function samePoint(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5;
}

function isUsable(value: unknown): value is SavedPlace {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.displayName === "string" &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lon === "number" &&
    Number.isFinite(v.lon) &&
    typeof v.savedAt === "string"
  );
}

function load(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUsable).slice(0, MAX_SAVED) : [];
  } catch {
    return [];
  }
}

function persist(items: SavedPlace[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
  } catch {
    // Private browsing or a full quota: the list still works for this visit.
  }
}

interface SavedPlacesState {
  saved: SavedPlace[];
  /** Saves a place, or does nothing if it is already saved. Returns false when the list is full. */
  save: (place: { lat: number; lon: number; name: string; displayName: string }) => boolean;
  remove: (place: { lat: number; lon: number }) => void;
  isSaved: (place: { lat: number; lon: number }) => boolean;
}

export const useSavedPlacesStore = create<SavedPlacesState>((set, get) => ({
  saved: load(),
  save: (place) => {
    const current = get().saved;
    if (current.some((p) => samePoint(p, place))) return true;
    if (current.length >= MAX_SAVED) return false;
    const next = [
      { lat: place.lat, lon: place.lon, name: place.name, displayName: place.displayName, savedAt: new Date().toISOString() },
      ...current,
    ];
    persist(next);
    set({ saved: next });
    return true;
  },
  remove: (place) => {
    const next = get().saved.filter((p) => !samePoint(p, place));
    persist(next);
    set({ saved: next });
  },
  isSaved: (place) => get().saved.some((p) => samePoint(p, place)),
}));
