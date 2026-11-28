import { create } from "zustand";

/**
 * Tabs inside the Place section.
 *
 * "travel" used to live here as a fifth tab. The Travel planner is a
 * headline feature and nobody found it buried behind a tab inside another
 * panel, so it now has its own entry on the workspace rail - see
 * features/shell/sections.ts.
 */
export type IntelTab = "overview" | "site" | "evidence" | "live" | "nearby";

/**
 * A tap on a building: the point it selected. While the selected place is
 * that point, the Overview leads with the property type and folds the rest
 * away (owner's request, 28 November 2026: "when it click on the building
 * only property type need to come"). Kept as the point rather than a flag,
 * so selecting anywhere else by any route (a search, a link, a tap on the
 * ground) can never inherit it.
 */
export interface BuildingFocus {
  lat: number;
  lon: number;
}

interface IntelTabState {
  tab: IntelTab;
  setTab: (tab: IntelTab) => void;
  buildingFocus: BuildingFocus | null;
  /** A building was tapped: show its property type first, on the Overview. */
  focusBuilding: (point: BuildingFocus) => void;
  clearBuildingFocus: () => void;
}

export const useIntelTabStore = create<IntelTabState>((set) => ({
  tab: "overview",
  setTab: (tab) => set({ tab }),
  buildingFocus: null,
  focusBuilding: (point) => set({ tab: "overview", buildingFocus: point }),
  clearBuildingFocus: () => set({ buildingFocus: null }),
}));

/** Whether the selected place is the building that was tapped (to about a centimetre). */
export function isBuildingFocus(focus: BuildingFocus | null, place: { lat: number; lon: number } | null | undefined): boolean {
  if (!focus || !place) return false;
  return Math.abs(focus.lat - place.lat) < 1e-7 && Math.abs(focus.lon - place.lon) < 1e-7;
}
