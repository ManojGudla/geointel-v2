import type { MaintenanceState } from "@/services/maintenance";
import "./MaintenancePage.css";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "just now";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Replaces the entire normal app for every visitor while maintenance mode
 * is on (see App.tsx) - real backend-enforced, not just this page: every
 * data API also refuses to serve non-admin requests while the same flag is
 * set (api/_lib/maintenance.ts's withMaintenanceGuard), so there's no route
 * or direct API call that bypasses it.
 */
export function MaintenancePage({ state, lastChecked }: { state: MaintenanceState; lastChecked: string | null }) {
  const isEmergency = state.type === "emergency";

  return (
    <div className={`maintenance-page ${isEmergency ? "maintenance-page--emergency" : ""}`}>
      <div className="maintenance-page__card">
        <p className="maintenance-page__brand">maNOWj GeoIntel</p>
        <span className="maintenance-page__icon" aria-hidden="true">
          🔧
        </span>
        <h1>{state.title || "We're currently under maintenance"}</h1>
        <p className="maintenance-page__message">{state.message}</p>

        {state.estimatedEnd && (
          <p className="maintenance-page__estimate">
            <strong>Estimated completion:</strong> {state.estimatedEnd}
          </p>
        )}

        {state.showStatus && (
          <div className="maintenance-page__status">
            <span className="maintenance-page__status-label">System Status</span>
            <span className={`maintenance-page__status-value ${isEmergency ? "maintenance-page__status-value--emergency" : ""}`}>
              <span className="maintenance-page__status-dot" aria-hidden="true" />
              {isEmergency ? "Emergency maintenance in progress" : "Maintenance in progress"}
            </span>
          </div>
        )}

        {state.supportInfo && (
          <p className="maintenance-page__support">
            <strong>Need help?</strong> {state.supportInfo}
          </p>
        )}

        <p className="maintenance-page__updated">Last updated: {formatTimestamp(lastChecked ?? state.updatedAt)}</p>
      </div>
    </div>
  );
}
