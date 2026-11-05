import { create } from "zustand";

interface TourState {
  open: boolean;
  step: number;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  goTo: (step: number) => void;
}

/** The on-demand feature tour. Never opens by itself - only when asked for. */
export const useTourStore = create<TourState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  next: () => set((s) => ({ step: s.step + 1 })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  stop: () => set({ open: false, step: 0 }),
  goTo: (step) => set({ step }),
}));
