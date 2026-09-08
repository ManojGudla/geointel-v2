import { create } from "zustand";

interface TeamState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** Same open/close-only pattern as feedbackStore/settingsStore/helpStore. */
export const useTeamStore = create<TeamState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
