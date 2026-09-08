import { create } from "zustand";
import type { Location } from "@/types/location";
import { useUiStore } from "@/stores/uiStore";

interface LocationState {
  selectedLocation: Location | null;
  radiusMeters: number;
  setSelectedLocation: (location: Location | null) => void;
  setRadiusMeters: (radius: number) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  selectedLocation: null,
  radiusMeters: useUiStore.getState().defaultRadiusMeters,
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
  setRadiusMeters: (radiusMeters) => set({ radiusMeters }),
}));
