import { create } from "zustand";

interface FeatureStatusState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useFeatureStatusStore = create<FeatureStatusState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
