import { create } from "zustand";

/**
 * Tabs inside the Place section.
 *
 * "travel" used to live here as a fifth tab. The Travel planner is a
 * headline feature and nobody found it buried behind a tab inside another
 * panel, so it now has its own entry on the workspace rail — see
 * features/shell/sections.ts.
 */
export type IntelTab = "overview" | "evidence" | "live" | "nearby";

interface IntelTabState {
  tab: IntelTab;
  setTab: (tab: IntelTab) => void;
}

export const useIntelTabStore = create<IntelTabState>((set) => ({
  tab: "overview",
  setTab: (tab) => set({ tab }),
}));
