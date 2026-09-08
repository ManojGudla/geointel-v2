import "./MapLoadState.css";

export type MapLoadPhase = "loading" | "slow" | "failed" | "ready";

interface Props {
  phase: MapLoadPhase;
  onRetry: () => void;
}

/**
 * What you see while the map is coming up, and what you see when it doesn't.
 *
 * "sometimes map not loading fine" — before this, a failed or stalled style
 * fetch left a flat grey rectangle with no explanation and no way out. You
 * couldn't tell a slow connection from a broken app, so the only move was to
 * reload the whole page and hope. Three honest states instead:
 *
 *   loading — normal, brief, quiet.
 *   slow    — over SLOW_AFTER_MS. Says it's still trying, offers a retry.
 *   failed  — the style or its tiles actually errored. Says so, offers a
 *             retry, and does not pretend a reload is guaranteed to help.
 *
 * Nothing here fabricates progress: there is no fake percentage bar, because
 * MapLibre doesn't report one and inventing it would be a lie about how far
 * along the load is.
 */
export function MapLoadState({ phase, onRetry }: Props) {
  if (phase === "ready") return null;

  const failed = phase === "failed";

  return (
    <div className={`map-load map-load--${phase}`} role="status" aria-live="polite">
      <div className="map-load__card">
        <div className="map-load__spinner" aria-hidden="true">
          {failed ? "🗺️" : <span className="map-load__ring" />}
        </div>

        <p className="map-load__title">
          {failed ? "The map didn't load" : phase === "slow" ? "Still loading the map…" : "Loading the map…"}
        </p>

        {phase !== "loading" && (
          <p className="map-load__body">
            {failed
              ? "The map tiles couldn't be fetched. This is usually a network or ad-blocker problem, not your device."
              : "Your connection is slow right now. It should appear in a moment."}
          </p>
        )}

        {phase !== "loading" && (
          <button type="button" className="map-load__retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
