import { create } from "zustand";

interface HelpState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
