import { useEffect } from "react";
import { useMaintenanceStore } from "@/stores/maintenanceStore";

const POLL_INTERVAL_MS = 20_000;

/**
 * Mounted once at the App root. Checks maintenance status immediately on
 * load, then every 20s — real backend-driven propagation (an admin's toggle
 * reaches every open tab without anyone refreshing), just not literally
 * instant. See maintenanceStore.ts for why polling instead of Realtime.
 */
export function useMaintenancePolling() {
  const refresh = useMaintenanceStore((s) => s.refresh);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);
}
