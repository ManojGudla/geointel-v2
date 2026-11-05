import { useLiveLocationStore } from "./liveLocationStore";
import "./LocateButton.css";

/**
 * The round "locate me" button on the map, where Google and Apple Maps put
 * theirs - so nobody has to find it.
 *
 * One tap: start tracking and fly to you. Tap again after panning away:
 * come back. The icon says which state you are in - hollow while off,
 * filled while the map is following you, outlined blue when you have
 * panned away from a live position.
 */
export function LocateButton() {
  const status = useLiveLocationStore((s) => s.status);
  const following = useLiveLocationStore((s) => s.following);
  const error = useLiveLocationStore((s) => s.error);
  const start = useLiveLocationStore((s) => s.start);
  const stop = useLiveLocationStore((s) => s.stop);

  const live = status === "tracking";
  const state = status === "locating" ? "locating" : live && following ? "following" : live ? "live" : status === "denied" || status === "unavailable" || status === "unsupported" ? "problem" : "off";

  const label =
    state === "locating"
      ? "Finding your location"
      : state === "following"
        ? "Showing your location. Tap to stop."
        : state === "live"
          ? "Centre the map on your location"
          : "Show my location";

  const onClick = () => {
    if (state === "following") {
      stop();
      return;
    }
    // Always straight from the tap: iOS only allows the location and compass
    // prompts inside one. See liveLocationStore.ts.
    start();
  };

  return (
    <div className="locate">
      {state === "problem" && error && (
        <p className="locate__help" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`locate__btn locate__btn--${state}`}
        onClick={onClick}
        aria-label={label}
        title={label}
        aria-pressed={state === "following"}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r={state === "following" || state === "live" ? 3.6 : 2.4} fill="currentColor" />
          <path d="M12 1.5v3.2M12 19.3v3.2M1.5 12h3.2M19.3 12h3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
