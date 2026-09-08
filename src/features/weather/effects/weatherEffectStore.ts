import { create } from "zustand";

const ENABLED_KEY = "manowj-weather-effects-enabled";

/**
 * The on/off switch for weather visual effects.
 *
 * DEFAULT OFF, and that is not negotiable: this is a GIS tool first, and
 * animated rain over somebody's site-suitability analysis is the last thing
 * they asked for. It turns on only when a person chooses it, and the choice
 * is remembered.
 *
 * The absence of the key means off. So does a corrupt value. Only the exact
 * string "true" turns it on.
 */
function loadEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

interface WeatherEffectState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

export const useWeatherEffectStore = create<WeatherEffectState>((set, get) => ({
  enabled: loadEnabled(),
  setEnabled: (on) => {
    try {
      localStorage.setItem(ENABLED_KEY, on ? "true" : "false");
    } catch {
      // Preference won't persist; the toggle still works for this session.
    }
    set({ enabled: on });
  },
  toggle: () => get().setEnabled(!get().enabled),
}));
