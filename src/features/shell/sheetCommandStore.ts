import { create } from "zustand";

/**
 * A way for the map to tell the phone bottom sheet to get out of the way.
 *
 * The sheet's height lives inside useSheet, which only the sheet's own grip
 * could change. So when someone started dragging the map or measuring with
 * the sheet at half height, half the screen stayed covered by a panel they
 * were not looking at. Now the map asks for "lower" and the sheet drops to
 * its peek height; the grip brings it back up with one tap.
 *
 * It only ever LOWERS the sheet: a request never raises a panel someone has
 * already pushed down, and it does nothing on desktop, where there is no
 * sheet.
 */
interface SheetCommandState {
  /** Bumped on every request so the same request twice still fires. */
  lowerRequest: number;
  requestLower: () => void;
}

export const useSheetCommandStore = create<SheetCommandState>((set) => ({
  lowerRequest: 0,
  requestLower: () => set((s) => ({ lowerRequest: s.lowerRequest + 1 })),
}));
