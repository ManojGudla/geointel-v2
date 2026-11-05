import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveLocationStore } from "@/features/location/liveLocationStore";

export type GeolocationStatus = "idle" | "locating" | "granted" | "denied" | "unsupported" | "error";

/**
 * "Use my location" for the search box, now backed by the shared live
 * tracker (features/location/liveLocationStore.ts) instead of a one-off
 * getCurrentPosition with a 10-second deadline - the cause of most iPhone
 * failures, explained in that file.
 *
 * `coords` is the fix that answered the MOST RECENT tap, and `requestId`
 * changes once per answered tap. The search box selects "My Location" from
 * that, so a second tap re-centres even while the tracker is still running
 * (with a single status flag it would already read "granted" and nothing
 * would happen).
 */
export function useGeolocation() {
  const status = useLiveLocationStore((s) => s.status);
  const fix = useLiveLocationStore((s) => s.fix);
  const error = useLiveLocationStore((s) => s.error);
  const start = useLiveLocationStore((s) => s.start);

  const pending = useRef(false);
  const [answered, setAnswered] = useState<{ id: number; coords: { lat: number; lon: number } } | null>(null);

  const locate = useCallback(() => {
    pending.current = true;
    start();
  }, [start]);

  useEffect(() => {
    if (!pending.current || !fix) return;
    pending.current = false;
    setAnswered((prev) => ({ id: (prev?.id ?? 0) + 1, coords: { lat: fix.lat, lon: fix.lon } }));
  }, [fix]);

  useEffect(() => {
    if (status === "denied" || status === "unsupported" || status === "unavailable") pending.current = false;
  }, [status]);

  const mapped: GeolocationStatus =
    status === "off"
      ? "idle"
      : status === "locating"
        ? "locating"
        : status === "tracking"
          ? "granted"
          : status === "denied"
            ? "denied"
            : status === "unsupported"
              ? "unsupported"
              : "error";

  return {
    status: pending.current && mapped !== "denied" && mapped !== "unsupported" && mapped !== "error" ? ("locating" as const) : mapped,
    coords: answered?.coords ?? null,
    requestId: answered?.id ?? 0,
    error: mapped === "denied" || mapped === "unsupported" || mapped === "error" ? error : null,
    locate,
  };
}
