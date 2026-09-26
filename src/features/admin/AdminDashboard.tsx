import { gateFailureMessage } from "@/features/secret/SecretGate";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useNoIndex } from "@/hooks/useNoIndex";
import {
  fetchMaintenanceState,
  updateMaintenance,
  type MaintenanceAuditEntry,
  type MaintenanceState,
  type MaintenanceType,
} from "@/services/maintenance";
import { fetchAdminSubmissions, type FeedbackSubmission, type TeamApplicationSubmission } from "@/services/adminSubmissions";
import { ApiUnavailableError } from "@/services/apiClient";
/* The session key moved to its own module when a second way in was added -
   the hidden entrance behind the header logo writes the same slot, and two
   copies of the string is how you get a gate that succeeds into a dashboard
   that then asks for the key again. */
import { clearAdminKey, readAdminKey, writeAdminKey } from "./adminSession";
import "./AdminDashboard.css";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

interface SettingsForm {
  title: string;
  message: string;
  estimatedEnd: string;
  supportInfo: string;
  showStatus: boolean;
  showCountdown: boolean;
}

function formFromState(state: MaintenanceState | null): SettingsForm {
  return {
    title: state?.title ?? "Scheduled Maintenance",
    message: state?.message ?? "We are upgrading our GIS and intelligence services.",
    estimatedEnd: state?.estimatedEnd ?? "",
    supportInfo: state?.supportInfo ?? "",
    showStatus: state?.showStatus ?? true,
    showCountdown: state?.showCountdown ?? false,
  };
}

/**
 * The whole maintenance-mode admin surface, reached at /admin (App.tsx does
 * a plain pathname check - this project has no router, so that's the
 * honest, real minimum for "a separate admin page").
 *
 * Admin identity is a single shared passphrase (GEOINTEL_ADMIN_KEY, set
 * server-side only) rather than a real account system - this project has
 * none yet (see Feature Status: "User accounts/sign-in" is Planned). The
 * key is verified against the server on every load and every action; it's
 * kept in sessionStorage only so it isn't re-typed on every click within
 * one browser tab, and is never written anywhere else.
 */
export function AdminDashboard() {
  // A backstop. robots.txt already disallows /admin for well-behaved
  // crawlers; this covers the ones that fetch it anyway.
  useNoIndex("noindex, nofollow");
  const displayName = useUiStore((s) => s.displayName);

  const [keyInput, setKeyInput] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(() => readAdminKey());
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [auditLog, setAuditLog] = useState<MaintenanceAuditEntry[]>([]);
  const [form, setForm] = useState<SettingsForm>(formFromState(null));
  const [type, setType] = useState<MaintenanceType>("scheduled");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
  const [teamApplications, setTeamApplications] = useState<TeamApplicationSubmission[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  async function loadSubmissions(key: string) {
    setLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const result = await fetchAdminSubmissions(key);
      setFeedback(result.feedback);
      setTeamApplications(result.teamApplications);
    } catch (error) {
      setSubmissionsError(error instanceof ApiUnavailableError ? error.message : "Couldn't load submissions.");
    } finally {
      setLoadingSubmissions(false);
    }
  }

  async function verify(key: string) {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await fetchMaintenanceState(key);
      if (result.adminKeyValid) {
        setAdminKey(key);
        writeAdminKey(key);
        setMaintenance(result.maintenance);
        setForm(formFromState(result.maintenance));
        setType(result.maintenance.type);
        setAuditLog(result.auditLog ?? []);
        loadSubmissions(key);
      } else {
        setVerifyError("Incorrect admin key.");
      }
    } catch (error) {
      setVerifyError(gateFailureMessage(error));
    } finally {
      setVerifying(false);
    }
  }

  // Auto-verify a key already saved in this tab's session.
  useEffect(() => {
    if (adminKey && !maintenance) verify(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshDashboard(key: string) {
    try {
      const result = await fetchMaintenanceState(key);
      if (!result.adminKeyValid) {
        // The key stopped working (e.g. rotated on the server) - drop back
        // to the passphrase form rather than showing stale/wrong data.
        setAdminKey(null);
        clearAdminKey();
        return;
      }
      setMaintenance(result.maintenance);
      setForm(formFromState(result.maintenance));
      setType(result.maintenance.type);
      setAuditLog(result.auditLog ?? []);
    } catch (error) {
      setActionError(error instanceof ApiUnavailableError ? error.message : "Couldn't refresh status.");
    }
  }

  async function runAction(action: "enable" | "disable" | "update", overrideType?: MaintenanceType) {
    if (!adminKey) return;
    setSaving(true);
    setActionError(null);
    try {
      const { maintenance: updated } = await updateMaintenance(adminKey, {
        action,
        type: overrideType ?? type,
        title: form.title,
        message: form.message,
        estimatedEnd: form.estimatedEnd,
        supportInfo: form.supportInfo,
        showStatus: form.showStatus,
        showCountdown: form.showCountdown,
        adminLabel: displayName || undefined,
      });
      setMaintenance(updated);
      setType(updated.type);
      await refreshDashboard(adminKey);
    } catch (error) {
      setActionError(error instanceof ApiUnavailableError ? error.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
      setShowEmergencyConfirm(false);
    }
  }

  if (!adminKey || !maintenance) {
    return (
      <div className="admin-dashboard admin-dashboard--gate">
        <form
          className="admin-dashboard__login"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyInput.trim()) verify(keyInput.trim());
          }}
        >
          <h1>maNOWj GeoIntel: Admin</h1>
          <p>Enter the admin key to manage maintenance mode.</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Admin key"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-label="Admin key"
          />
          {verifyError && <p className="admin-dashboard__error">{verifyError}</p>}
          <button type="submit" disabled={verifying || !keyInput.trim()}>
            {verifying ? "Checking…" : "Unlock admin dashboard"}
          </button>
        </form>
      </div>
    );
  }

  const statusBadge = maintenance.enabled
    ? maintenance.type === "emergency"
      ? { icon: "🔴", label: "EMERGENCY MAINTENANCE" }
      : { icon: "🟠", label: "MAINTENANCE" }
    : { icon: "🟢", label: "LIVE" };

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__header">
        <h1>Admin Dashboard</h1>
        <span className={`admin-dashboard__badge admin-dashboard__badge--${maintenance.enabled ? (maintenance.type === "emergency" ? "emergency" : "maintenance") : "live"}`}>
          {statusBadge.icon} {statusBadge.label}
        </span>
      </header>

      {maintenance.enabled && (
        <div className={`admin-dashboard__banner ${maintenance.type === "emergency" ? "admin-dashboard__banner--emergency" : ""}`}>
          <span>🔧 MAINTENANCE MODE ACTIVE (since {formatTimestamp(maintenance.startedAt)})</span>
          <button type="button" onClick={() => runAction("disable")} disabled={saving}>
            {saving ? "Working…" : "Disable Maintenance Mode"}
          </button>
        </div>
      )}

      {actionError && <p className="admin-dashboard__error">{actionError}</p>}

      <section className="admin-dashboard__section">
        <h2>Maintenance Settings</h2>
        <label className="admin-dashboard__field">
          <span>Title</span>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
        </label>
        <label className="admin-dashboard__field">
          <span>Message</span>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} rows={3} />
        </label>
        <label className="admin-dashboard__field">
          <span>Estimated completion</span>
          <input
            type="text"
            value={form.estimatedEnd}
            onChange={(e) => setForm({ ...form, estimatedEnd: e.target.value })}
            placeholder="e.g. Approximately 30 minutes"
            maxLength={200}
          />
        </label>
        <label className="admin-dashboard__field">
          <span>Support / contact information</span>
          <input
            type="text"
            value={form.supportInfo}
            onChange={(e) => setForm({ ...form, supportInfo: e.target.value })}
            placeholder="e.g. support@example.com"
            maxLength={500}
          />
        </label>
        <label className="admin-dashboard__field">
          <span>Maintenance severity</span>
          <div className="admin-dashboard__segmented" role="group" aria-label="Maintenance severity">
            <button type="button" className={type === "scheduled" ? "active" : ""} onClick={() => setType("scheduled")}>
              Scheduled
            </button>
            <button type="button" className={type === "emergency" ? "active" : ""} onClick={() => setType("emergency")}>
              Emergency
            </button>
          </div>
        </label>
        <label className="admin-dashboard__checkbox">
          <input type="checkbox" checked={form.showStatus} onChange={(e) => setForm({ ...form, showStatus: e.target.checked })} />
          Show system status on the maintenance page
        </label>
        <label className="admin-dashboard__checkbox">
          <input type="checkbox" checked={form.showCountdown} onChange={(e) => setForm({ ...form, showCountdown: e.target.checked })} />
          Show estimated-completion countdown
        </label>

        <div className="admin-dashboard__actions">
          <button type="button" onClick={() => runAction("update")} disabled={saving}>
            Save settings
          </button>
          {!maintenance.enabled && (
            <button type="button" className="admin-dashboard__primary" onClick={() => runAction("enable", "scheduled")} disabled={saving}>
              🔧 Enable Maintenance Mode
            </button>
          )}
          {!maintenance.enabled && (
            <button type="button" className="admin-dashboard__danger" onClick={() => setShowEmergencyConfirm(true)} disabled={saving}>
              🚨 Emergency Maintenance
            </button>
          )}
        </div>
      </section>

      {showEmergencyConfirm && (
        <div className="admin-dashboard__confirm-overlay" onClick={() => setShowEmergencyConfirm(false)}>
          <div className="admin-dashboard__confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Enable emergency maintenance mode?</h3>
            <p>All normal users will immediately lose access to the application. Administrators will retain access.</p>
            <div className="admin-dashboard__confirm-actions">
              <button type="button" onClick={() => setShowEmergencyConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="admin-dashboard__danger" onClick={() => runAction("enable", "emergency")} disabled={saving}>
                {saving ? "Working…" : "Enable Maintenance"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="admin-dashboard__section">
        <h2>Recent Activity</h2>
        {auditLog.length === 0 ? (
          <p className="admin-dashboard__empty">No maintenance actions recorded yet.</p>
        ) : (
          <ul className="admin-dashboard__log">
            {auditLog.map((entry) => (
              <li key={entry.id}>
                <span className="admin-dashboard__log-action">
                  {entry.action === "enabled" ? "Maintenance Mode Enabled" : entry.action === "disabled" ? "Maintenance Mode Disabled" : "Settings Updated"}
                  {entry.maintenance_type === "emergency" ? " (Emergency)" : ""}
                </span>
                <span className="admin-dashboard__log-meta">
                  {entry.admin_label || "Admin"} · {formatTimestamp(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-dashboard__section">
        <div className="admin-dashboard__section-head">
          <h2>Feedback ({feedback.length})</h2>
          <button type="button" onClick={() => adminKey && loadSubmissions(adminKey)} disabled={loadingSubmissions}>
            {loadingSubmissions ? "Loading…" : "Refresh"}
          </button>
        </div>
        {submissionsError && <p className="admin-dashboard__error">{submissionsError}</p>}
        {feedback.length === 0 ? (
          <p className="admin-dashboard__empty">No feedback submitted yet.</p>
        ) : (
          <ul className="admin-dashboard__submissions">
            {feedback.map((entry) => (
              <li key={entry.id}>
                <div className="admin-dashboard__submission-head">
                  <span>{"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}</span>
                  <span className="admin-dashboard__submission-tag">{entry.category}</span>
                </div>
                {entry.message && <p className="admin-dashboard__submission-message">{entry.message}</p>}
                <span className="admin-dashboard__log-meta">
                  {formatTimestamp(entry.created_at)} · {entry.ip_address || "unknown IP"} · {entry.user_agent || "unknown device"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-dashboard__section">
        <h2>Join Our Team applications ({teamApplications.length})</h2>
        {teamApplications.length === 0 ? (
          <p className="admin-dashboard__empty">No applications submitted yet.</p>
        ) : (
          <ul className="admin-dashboard__submissions">
            {teamApplications.map((entry) => (
              <li key={entry.id}>
                <div className="admin-dashboard__submission-head">
                  <span>
                    {entry.name} · {entry.email}
                  </span>
                  <span className="admin-dashboard__submission-tag">{entry.interest}</span>
                </div>
                {entry.message && <p className="admin-dashboard__submission-message">{entry.message}</p>}
                <span className="admin-dashboard__log-meta">
                  {formatTimestamp(entry.created_at)} · {entry.ip_address || "unknown IP"} · {entry.user_agent || "unknown device"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="admin-dashboard__note">
        Admin access here is a single shared key (GEOINTEL_ADMIN_KEY), not a full account system. GeoIntel doesn't have real
        user accounts yet. This dashboard is the one place that key unlocks.
      </p>
    </div>
  );
}
