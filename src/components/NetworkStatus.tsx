import { useEffect, useRef, useState } from "react";
import "./NetworkStatus.css";

/**
 * One quiet line that says what the network is doing, and nothing when it is
 * fine.
 *
 * Before this, nothing in the app listened for the connection at all. Going
 * offline showed up as a string of unrelated symptoms: a search box claiming
 * OpenStreetMap had no such place, panels asking you to select the place you
 * had selected, the Copilot reporting "an unexpected problem". Each of those
 * is now honest on its own, and this line ties them together so the reason is
 * visible in one place.
 */

type NetState = "online" | "offline" | "slow" | "back";

/** How long "Back online" stays up before getting out of the way. */
export const BACK_ONLINE_MS = 3_000;

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
}

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/**
 * Chromium reports an estimated connection class; Safari and Firefox do not,
 * so "slow" only ever appears where the browser actually says so. 2G-class is
 * the threshold because that is where the map and three panels loading at
 * once takes long enough to look broken.
 */
export function isSlowConnection(info: NetworkInformationLike | undefined): boolean {
  return info?.effectiveType === "slow-2g" || info?.effectiveType === "2g";
}

function initial(): NetState {
  if (typeof navigator === "undefined") return "online";
  if (navigator.onLine === false) return "offline";
  return isSlowConnection(connection()) ? "slow" : "online";
}

export function NetworkStatus() {
  const [state, setState] = useState<NetState>(initial);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearBack = () => {
      if (backTimer.current) clearTimeout(backTimer.current);
      backTimer.current = null;
    };
    const onOffline = () => {
      clearBack();
      setState("offline");
    };
    const onOnline = () => {
      clearBack();
      setState("back");
      backTimer.current = setTimeout(() => setState(isSlowConnection(connection()) ? "slow" : "online"), BACK_ONLINE_MS);
    };
    const onConnectionChange = () => {
      setState((current) => {
        if (current === "offline" || current === "back") return current;
        return isSlowConnection(connection()) ? "slow" : "online";
      });
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    connection()?.addEventListener?.("change", onConnectionChange);
    return () => {
      clearBack();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      connection()?.removeEventListener?.("change", onConnectionChange);
    };
  }, []);

  if (state === "online") return <span className="visually-hidden" role="status" aria-live="polite" />;

  const text =
    state === "offline"
      ? "You're offline. Places and answers already on screen stay here; new searches wait for the connection."
      : state === "slow"
        ? "Slow connection. The map and panels may take longer than usual to load."
        : "Back online. Refreshing what was waiting.";

  return (
    <div className={`network-status network-status--${state}`} role="status" aria-live="polite">
      <span className="network-status__dot" aria-hidden="true" />
      {text}
    </div>
  );
}
