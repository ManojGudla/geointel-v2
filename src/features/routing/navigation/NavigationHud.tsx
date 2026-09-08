import { useNavigationStore } from "./navStore";
import { useNavigation } from "./useNavigation";
import { useRouteStore } from "@/stores/routeStore";
import { useRoute } from "../useRoute";
import { announceDistance } from "./navMath";
import { arrivalTime, formatDuration, turnIcon } from "../turnIcon";
import { formatDistance } from "@/features/map/geo";
import { useUiStore } from "@/stores/uiStore";
import "./NavigationHud.css";

/**
 * The navigation display: a big instruction banner at the top and a trip
 * strip at the bottom, the arrangement Apple and Google Maps both use because
 * it works — the thing you need at a glance is large and at the top, and the
 * trip totals stay out of the way at the bottom.
 *
 * It is honest about two limits rather than hiding them:
 *  - No live traffic. No free routing provider offers it, so the remaining
 *    time is a free-flow estimate and the strip says so.
 *  - GPS accuracy is shown when it's poor, so a wandering marker reads as
 *    "your phone isn't sure where you are" rather than "this app is broken".
 */
export function NavigationHud() {
  useNavigation();

  const state = useNavigationStore((s) => s.state);
  const stop = useNavigationStore((s) => s.stop);
  const currentStep = useNavigationStore((s) => s.currentStep);
  const metresToNextTurn = useNavigationStore((s) => s.metresToNextTurn);
  const metresRemaining = useNavigationStore((s) => s.metresRemaining);
  const secondsRemaining = useNavigationStore((s) => s.secondsRemaining);
  const accuracyMeters = useNavigationStore((s) => s.accuracyMeters);
  const following = useNavigationStore((s) => s.following);
  const setFollowing = useNavigationStore((s) => s.setFollowing);
  const error = useNavigationStore((s) => s.error);
  const rerouteCount = useNavigationStore((s) => s.rerouteCount);

  const selectedOption = useRouteStore((s) => s.selectedOption);
  const routeQuery = useRoute();
  const units = useUiStore((s) => s.units);

  const option = routeQuery.data?.options?.[selectedOption] ?? routeQuery.data?.options?.[0];
  const steps = option?.steps ?? [];
  const step = steps[currentStep];
  const nextStep = steps[currentStep + 1];

  if (state === "idle") return null;

  if (state === "denied" || state === "unavailable") {
    return (
      <div className="nav-hud nav-hud--problem" role="alert">
        <div className="nav-hud__problem-body">
          <strong>Can&apos;t navigate</strong>
          <p>{error ?? "Your location isn't available."}</p>
        </div>
        <button type="button" className="nav-hud__end" onClick={stop}>
          Close
        </button>
      </div>
    );
  }

  if (state === "arrived") {
    return (
      <div className="nav-hud nav-hud--arrived" role="status">
        <div className="nav-hud__problem-body">
          <strong>You&apos;ve arrived 🏁</strong>
          <p>{rerouteCount > 0 ? `Re-routed ${rerouteCount} time${rerouteCount === 1 ? "" : "s"} on the way.` : "Trip complete."}</p>
        </div>
        <button type="button" className="nav-hud__end" onClick={stop}>
          Done
        </button>
      </div>
    );
  }

  const poorAccuracy = accuracyMeters !== null && accuracyMeters > 40;

  return (
    <>
      {/* The instruction. Large, high contrast, one thing at a time. */}
      <div className="nav-hud nav-hud--banner" role="status" aria-live="polite">
        <div className="nav-hud__turn">
          <span className="nav-hud__turn-icon" aria-hidden="true">
            {step ? turnIcon(step.type, step.modifier) : "⬆️"}
          </span>
          <div className="nav-hud__turn-text">
            <span className="nav-hud__turn-distance">
              {state === "locating" ? "Finding your position…" : state === "rerouting" ? "Re-routing…" : announceDistance(metresToNextTurn)}
            </span>
            <strong className="nav-hud__turn-instruction">{step?.instruction ?? "Follow the route"}</strong>
            {nextStep && state === "navigating" && (
              <span className="nav-hud__turn-then">
                then <span aria-hidden="true">{turnIcon(nextStep.type, nextStep.modifier)}</span> {nextStep.instruction}
              </span>
            )}
          </div>
        </div>

        <button type="button" className="nav-hud__end" onClick={stop}>
          End
        </button>
      </div>

      {/* Trip strip: what's left, when you'll get there, and the caveats. */}
      <div className="nav-hud nav-hud--strip">
        <div className="nav-hud__trip">
          <strong>{formatDuration(secondsRemaining)}</strong>
          <span>{formatDistance(metresRemaining, units)}</span>
          <span className="nav-hud__eta">{arrivalTime(secondsRemaining)}</span>
        </div>

        <div className="nav-hud__strip-actions">
          {!following && (
            <button type="button" className="nav-hud__recenter" onClick={() => setFollowing(true)}>
              ⌖ Re-centre
            </button>
          )}
          {/* Stated, not buried. An ETA that looks traffic-aware but isn't
              would be the single most misleading number in the product. */}
          <span className="nav-hud__caveat" title="No free routing provider exposes live traffic data.">
            Free-flow estimate · no live traffic
          </span>
        </div>

        {poorAccuracy && (
          <p className="nav-hud__accuracy">
            Your position is only accurate to about {Math.round(accuracyMeters!)} m right now — the marker may wander.
          </p>
        )}
        {rerouteCount > 0 && state === "navigating" && (
          <p className="nav-hud__accuracy">Re-routed {rerouteCount} time{rerouteCount === 1 ? "" : "s"} so far.</p>
        )}
      </div>
    </>
  );
}
