import { create } from "zustand";

interface PrivacyState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** The Privacy & security panel. Reached from the header's More menu. */
export const usePrivacyStore = create<PrivacyState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
