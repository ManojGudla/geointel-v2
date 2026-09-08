import { create } from "zustand";

interface ReportState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/** Whether the printable area report is showing. */
export const useReportStore = create<ReportState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
