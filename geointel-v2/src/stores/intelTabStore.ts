import { create } from "zustand";

export type IntelTab = "overview" | "evidence" | "live" | "nearby";

interface IntelTabState {
  tab: IntelTab;
  setTab: (tab: IntelTab) => void;
}

export const useIntelTabStore = create<IntelTabState>((set) => ({
  tab: "overview",
  setTab: (tab) => set({ tab }),
}));
