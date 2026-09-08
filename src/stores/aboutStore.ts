import { create } from "zustand";

interface AboutState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** Same open/close-only pattern as feedbackStore/settingsStore/helpStore/teamStore. */
export const useAboutStore = create<AboutState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
