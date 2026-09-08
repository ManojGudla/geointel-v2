import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type AnimationIntensity = "full" | "reduced" | "off";
export type Units = "metric" | "imperial";

interface UiState {
  theme: ThemeMode;
  animationIntensity: AnimationIntensity;
  units: Units;
  defaultRadiusMeters: number;
  is3DMapEnabled: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAnimationIntensity: (level: AnimationIntensity) => void;
  setUnits: (units: Units) => void;
  setDefaultRadiusMeters: (radius: number) => void;
  setIs3DMapEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = "geointel.settings.v1";

function loadPersisted(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(state: Pick<UiState, "theme" | "animationIntensity" | "units" | "defaultRadiusMeters" | "is3DMapEnabled">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private browsing, quota). Non-fatal.
  }
}

const persisted = loadPersisted();

export const useUiStore = create<UiState>((set, get) => ({
  theme: persisted.theme ?? "system",
  animationIntensity: persisted.animationIntensity ?? "full",
  units: persisted.units ?? "metric",
  defaultRadiusMeters: persisted.defaultRadiusMeters ?? 250,
  is3DMapEnabled: persisted.is3DMapEnabled ?? false,

  setTheme: (theme) => {
    set({ theme });
    persist({ ...get(), theme });
  },
  setAnimationIntensity: (animationIntensity) => {
    set({ animationIntensity });
    persist({ ...get(), animationIntensity });
  },
  setUnits: (units) => {
    set({ units });
    persist({ ...get(), units });
  },
  setDefaultRadiusMeters: (defaultRadiusMeters) => {
    set({ defaultRadiusMeters });
    persist({ ...get(), defaultRadiusMeters });
  },
  setIs3DMapEnabled: (is3DMapEnabled) => {
    set({ is3DMapEnabled });
    persist({ ...get(), is3DMapEnabled });
  },
}));
