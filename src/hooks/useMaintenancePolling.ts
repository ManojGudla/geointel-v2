import { useEffect } from "react";
import { useMaintenanceStore } from "@/stores/maintenanceStore";

const POLL_INTERVAL_MS = 20_000;

/**
 * Mounted once at the App root. Checks maintenance status immediately on
 * load, then every 20s - real backend-driven propagation (an admin's toggle
 * reaches every open tab without anyone refreshing), just not literally
 * instant. See maintenanceStore.ts for why polling instead of Realtime.
 */
export function useMaintenancePolling() {
  const refresh = useMaintenanceStore((s) => s.refresh);

  useEffect(() => {
    // Offline the answer cannot arrive, and a hidden tab has no one to show
    // it to. Polling anyway sent three requests a minute into the void, and
    // on a free tier every one of them counts.
    const poll = () => {
      if (navigator.onLine === false || document.hidden) return;
      refresh();
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Catch up at once when either condition clears.
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
}
