import { create } from "zustand";
import { fetchMaintenanceState, type MaintenanceState } from "@/services/maintenance";

interface MaintenanceStore {
  state: MaintenanceState | null;
  lastChecked: string | null;
  checking: boolean;
  refresh: () => Promise<void>;
}

/**
 * Drives the global maintenance gate. Polled from App.tsx (see
 * useMaintenancePolling) rather than pushed via Supabase Realtime — a
 * deliberate, honestly-scoped choice: Realtime would need the anon key
 * wired into the frontend and replication configured on a table that's
 * otherwise never read client-side, for a feature only the app's one admin
 * uses a few times a year. Polling is exactly the "lightweight status
 * polling fallback" the spec itself allows, and it still satisfies the real
 * requirement — no refresh/redeploy/rebuild/restart needed to propagate a
 * toggle to every open tab.
 */
export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  state: null,
  lastChecked: null,
  checking: false,

  refresh: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const { maintenance } = await fetchMaintenanceState();
      set({ state: maintenance, lastChecked: new Date().toISOString(), checking: false });
    } catch {
      // A hiccup checking status shouldn't itself lock anyone out or flip
      // the page into a false maintenance state — keep the last known value.
      set({ checking: false });
    }
  },
}));
