import { create } from "zustand";

/**
 * How much of the map's height the phone bottom sheet is covering, as a
 * fraction (0 when there is no sheet, or it is closed).
 *
 * The map reads this to pad its camera, so "centre on this place" and
 * "fit this 2 km ring" aim at the part of the map you can actually see above
 * the sheet. Before, a result ring was centred on the whole screen and its
 * lower half sat hidden under the panel - the "panels cover the map"
 * complaint, in its most literal form.
 */
interface SheetInsetState {
  fraction: number;
  setFraction: (fraction: number) => void;
}

export const useSheetInsetStore = create<SheetInsetState>((set) => ({
  fraction: 0,
  setFraction: (fraction) => set({ fraction }),
}));
