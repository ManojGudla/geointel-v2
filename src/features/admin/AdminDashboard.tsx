import { gateFailureMessage } from "@/features/secret/SecretGate";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUiStore } from "@/stores/uiStore";
import { useNoIndex } from "@/hooks/useNoIndex";
import { useDialog } from "@/hooks/useDialog";
import { LogoMark } from "@/components/LogoMark";
import { apiGet } from "@/services/apiClient";
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
import { describeDevice, downloadCsv, fullTime, initials, maskIp, relativeTime, toCsv, weekOverWeek } from "./adminFormat";
import "./AdminDashboard.css";

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

function sameForm(a: SettingsForm, b: SettingsForm) {
  return (Object.keys(a) as (keyof SettingsForm)[]).every((k) => a[k] === b[k]);
}

type DependencyState = "operational" | "degraded" | "down" | "not_configured";
interface StatusResponse {
  dependencies: { id: string; name: string; status: DependencyState; latencyMs: number | null; detail: string }[];
  checkedAt: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "maintenance", label: "Maintenance" },
  { id: "feedback", label: "Feedback" },
  { id: "applications", label: "Team" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  try {
    const hash = window.location.hash.replace("#", "");
    return (TABS.find((t) => t.id === hash)?.id ?? "overview") as TabId;
  } catch {
    return "overview";
  }
}

const ETA_PRESETS = ["About 15 minutes", "About 30 minutes", "About 1 hour", "About 2 hours", "Later today"];

/* ------------------------------------------------------------------ icons */

const ICONS: Record<string, ReactNode> = {
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  lock: <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />,
  power: <path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0" />,
  mail: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  copy: <path d="M9 9h10v11H9zM5 15V4h10" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />,
};

function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="adm-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="adm-stars" aria-label={`${r} out of 5 stars`}>
      <span aria-hidden="true">{"★".repeat(r)}</span>
      <span className="adm-stars__off" aria-hidden="true">
        {"★".repeat(5 - r)}
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- dashboard */

/**
 * The admin console, reached at /admin (App.tsx does a plain pathname check -
 * there is no router) or through the hidden gate behind the header logo.
 *
 * Admin identity is a single shared passphrase (GEOINTEL_ADMIN_KEY, set
 * server-side only) rather than an account system. The key is verified
 * against the server on every load and every action; it is kept in
 * sessionStorage only, so it is gone when the tab closes.
 *
 * Laid out like a product console: a sticky top bar with the live site
 * status, tabs for each job (overview, maintenance, feedback, applications,
 * activity), and every number on the overview computed from real rows -
 * nothing on this page is a placeholder.
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
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOffline, setConfirmOffline] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
  const [teamApplications, setTeamApplications] = useState<TeamApplicationSubmission[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const [tab, setTabState] = useState<TabId>(() => tabFromHash());
  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
      // The page scrolls inside #root (the map app locks the body), so reset both.
      const root = document.getElementById("root");
      if (root && root.scrollTop > 0) root.scrollTo({ top: 0 });
      if (window.scrollY > 0) window.scrollTo({ top: 0 });
    } catch {
      // Hash and scroll are conveniences only.
    }
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: ({ signal }) => apiGet<StatusResponse>("/api/status", undefined, signal),
    enabled: Boolean(adminKey && maintenance),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const loadSubmissions = useCallback(async (key: string) => {
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
  }, []);

  function applyState(next: MaintenanceState, log: MaintenanceAuditEntry[] | undefined) {
    setMaintenance(next);
    setForm(formFromState(next));
    setType(next.type);
    setAuditLog(log ?? []);
    setLastUpdated(Date.now());
  }

  async function verify(key: string) {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await fetchMaintenanceState(key);
      if (result.adminKeyValid) {
        setAdminKey(key);
        writeAdminKey(key);
        applyState(result.maintenance, result.auditLog);
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

  const dirty = maintenance ? !sameForm(form, formFromState(maintenance)) : false;

  const refreshDashboard = useCallback(
    async (key: string, { keepForm = false }: { keepForm?: boolean } = {}) => {
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
        if (!keepForm) {
          setForm(formFromState(result.maintenance));
          setType(result.maintenance.type);
        }
        setAuditLog(result.auditLog ?? []);
        setLastUpdated(Date.now());
      } catch (error) {
        setActionError(error instanceof ApiUnavailableError ? error.message : "Couldn't refresh status.");
      }
    },
    []
  );

  const refreshAll = useCallback(() => {
    if (!adminKey) return;
    refreshDashboard(adminKey, { keepForm: true });
    loadSubmissions(adminKey);
    status.refetch();
  }, [adminKey, refreshDashboard, loadSubmissions, status]);

  // Quiet background refresh every minute while the tab is visible, without
  // touching anything the admin is in the middle of typing.
  useEffect(() => {
    if (!adminKey || !maintenance) return;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      if (document.visibilityState === "visible") {
        refreshDashboard(adminKey, { keepForm: true });
        loadSubmissions(adminKey);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [adminKey, maintenance, refreshDashboard, loadSubmissions]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

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
      setNotice(action === "enable" ? "Site is now offline for visitors." : action === "disable" ? "Site is back online." : "Settings saved.");
    } catch (error) {
      setActionError(error instanceof ApiUnavailableError ? error.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
      setConfirmOffline(false);
    }
  }

  function lock() {
    clearAdminKey();
    setAdminKey(null);
    setMaintenance(null);
    setKeyInput("");
  }

  /* ------------------------------------------------------------ derived */

  const stats = useMemo(() => {
    const rated = feedback.filter((f) => f.rating > 0);
    const avg = rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length : null;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: rated.filter((f) => Math.round(f.rating) === star).length }));
    return { avg, ratedCount: rated.length, dist, fb: weekOverWeek(feedback), apps: weekOverWeek(teamApplications) };
  }, [feedback, teamApplications]);

  const deps = status.data?.dependencies ?? [];
  const healthy = deps.filter((d) => d.status === "operational").length;

  /* --------------------------------------------------------------- gate */

  if (!adminKey || !maintenance) {
    return (
      <div className="adm adm--gate">
        <form
          className="adm-login"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyInput.trim()) verify(keyInput.trim());
          }}
        >
          <LogoMark size={48} />
          <h1>maNOWj Admin</h1>
          <p>Enter the admin key to open the console.</p>
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
          {verifyError && <p className="adm-error">{verifyError}</p>}
          {verifying && adminKey && !verifyError && <p className="adm-muted">Checking your saved session…</p>}
          <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={verifying || !keyInput.trim()}>
            {verifying ? "Checking…" : "Unlock"}
          </button>
          <a className="adm-login__back" href="/">
            Back to maNOWj GeoIntel
          </a>
        </form>
      </div>
    );
  }

  const offline = maintenance.enabled;
  const emergency = offline && maintenance.type === "emergency";
  const siteState = emergency ? "emergency" : offline ? "maintenance" : "live";
  const siteLabel = emergency ? "Emergency maintenance" : offline ? "Maintenance" : "Live";

  /* ------------------------------------------------------------ sections */

  const statusHero = (
    <section className={`adm-hero adm-hero--${siteState}`}>
      <div className="adm-hero__state">
        <span className={`adm-dot adm-dot--${siteState} adm-dot--pulse`} aria-hidden="true" />
        <div>
          <p className="adm-hero__eyebrow">manowj.com</p>
          <h2 className="adm-hero__title">{offline ? "Site is offline for visitors" : "Site is live"}</h2>
          <p className="adm-hero__sub">
            {offline
              ? `${emergency ? "Emergency" : "Scheduled"} maintenance since ${fullTime(maintenance.startedAt)}`
              : `Everyone can use the site. Last change ${relativeTime(maintenance.updatedAt)}.`}
          </p>
        </div>
      </div>
      {offline ? (
        <button type="button" className="adm-btn adm-btn--success" onClick={() => runAction("disable")} disabled={saving}>
          <Icon name="power" />
          {saving ? "Working…" : "Bring site back online"}
        </button>
      ) : tab !== "maintenance" ? (
        <button type="button" className="adm-btn" onClick={() => setTab("maintenance")}>
          <Icon name="wrench" />
          Maintenance
        </button>
      ) : null}
    </section>
  );

  const overview = (
    <>
      {statusHero}
      <div className="adm-kpis">
        <div className="adm-kpi">
          <p className="adm-kpi__label">Average rating</p>
          <p className="adm-kpi__value">
            {stats.avg === null ? "-" : stats.avg.toFixed(1)}
            {stats.avg !== null && <span className="adm-kpi__unit">/ 5</span>}
          </p>
          <p className="adm-kpi__foot">{stats.ratedCount} ratings in total</p>
        </div>
        <div className="adm-kpi">
          <p className="adm-kpi__label">Feedback, last 7 days</p>
          <p className="adm-kpi__value">{stats.fb.thisWeek}</p>
          <Trend now={stats.fb.thisWeek} before={stats.fb.lastWeek} />
        </div>
        <div className="adm-kpi">
          <p className="adm-kpi__label">Team applications</p>
          <p className="adm-kpi__value">{teamApplications.length}</p>
          <p className="adm-kpi__foot">{stats.apps.thisWeek} new this week</p>
        </div>
        <div className="adm-kpi">
          <p className="adm-kpi__label">Services healthy</p>
          <p className="adm-kpi__value">
            {deps.length ? healthy : "-"}
            {deps.length > 0 && <span className="adm-kpi__unit">/ {deps.length}</span>}
          </p>
          <p className="adm-kpi__foot">{status.isLoading ? "Checking…" : status.data ? `Checked ${relativeTime(status.data.checkedAt)}` : "Not checked"}</p>
        </div>
      </div>

      <div className="adm-grid">
        <section className="adm-card">
          <header className="adm-card__head">
            <h2>System health</h2>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => status.refetch()} disabled={status.isFetching}>
              <Icon name="refresh" size={16} />
              {status.isFetching ? "Checking" : "Re-check"}
            </button>
          </header>
          {status.isError && <p className="adm-error">Couldn't reach the status check.</p>}
          {status.isLoading && <p className="adm-muted">Running live checks…</p>}
          <ul className="adm-health">
            {deps.map((dep) => (
              <li key={dep.id}>
                <span className={`adm-dot adm-dot--${dep.status}`} aria-hidden="true" />
                <div className="adm-health__text">
                  <span className="adm-health__name">{dep.name}</span>
                  <span className="adm-health__detail">{dep.detail}</span>
                </div>
                <span className="adm-health__ms">{dep.latencyMs !== null && dep.status !== "not_configured" ? `${dep.latencyMs} ms` : ""}</span>
                <span className={`adm-pill adm-pill--${dep.status}`}>{HEALTH_LABEL[dep.status]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="adm-card">
          <header className="adm-card__head">
            <h2>Ratings</h2>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setTab("feedback")}>
              View all
            </button>
          </header>
          {stats.ratedCount === 0 ? (
            <p className="adm-muted">No ratings yet.</p>
          ) : (
            <ul className="adm-dist">
              {stats.dist.map(({ star, count }) => (
                <li key={star}>
                  <span className="adm-dist__label">{star} ★</span>
                  <span className="adm-dist__bar">
                    <span style={{ width: `${(count / stats.ratedCount) * 100}%` }} />
                  </span>
                  <span className="adm-dist__count">{count}</span>
                </li>
              ))}
            </ul>
          )}
          {feedback.length > 0 && (
            <>
              <h3 className="adm-card__sub">Latest</h3>
              <ul className="adm-list adm-list--compact">
                {feedback.slice(0, 3).map((f) => (
                  <FeedbackRow key={f.id} entry={f} compact />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );

  const maintenancePanel = (
    <>
      {statusHero}
      <div className="adm-grid adm-grid--wide">
        <section className="adm-card">
          <header className="adm-card__head">
            <h2>Maintenance page</h2>
            {dirty && <span className="adm-pill adm-pill--degraded">Unsaved changes</span>}
          </header>

          <label className="adm-field">
            <span className="adm-field__label">Title</span>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
          </label>
          <label className="adm-field">
            <span className="adm-field__label">
              Message <span className="adm-field__count">{form.message.length}/2000</span>
            </span>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} rows={4} />
          </label>
          <div className="adm-field">
            <label className="adm-field__label" htmlFor="adm-eta">
              Estimated completion
            </label>
            <input id="adm-eta" type="text" value={form.estimatedEnd} onChange={(e) => setForm({ ...form, estimatedEnd: e.target.value })} placeholder="e.g. About 30 minutes" maxLength={200} />
            <div className="adm-chips" role="group" aria-label="Quick choices">
              {ETA_PRESETS.map((p) => (
                <button key={p} type="button" className={`adm-chip${form.estimatedEnd === p ? " adm-chip--on" : ""}`} onClick={() => setForm({ ...form, estimatedEnd: p })}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <label className="adm-field">
            <span className="adm-field__label">Support contact</span>
            <input type="text" value={form.supportInfo} onChange={(e) => setForm({ ...form, supportInfo: e.target.value })} placeholder="e.g. support@manowj.com" maxLength={500} />
          </label>

          <Toggle checked={form.showStatus} onChange={(v) => setForm({ ...form, showStatus: v })} label="Show system status" hint="Lists which services are up on the maintenance page." />
          <Toggle checked={form.showCountdown} onChange={(v) => setForm({ ...form, showCountdown: v })} label="Show countdown" hint="Shows the estimated completion as a countdown." />

          <div className="adm-savebar">
            {dirty && (
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setForm(formFromState(maintenance))} disabled={saving}>
                Discard
              </button>
            )}
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => runAction("update")} disabled={saving || !dirty}>
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </section>

        <div className="adm-stack">
          <section className="adm-card">
            <header className="adm-card__head">
              <h2>What visitors will see</h2>
            </header>
            <div className={`adm-preview${type === "emergency" ? " adm-preview--emergency" : ""}`} aria-label="Maintenance page preview">
              <LogoMark size={36} />
              <p className="adm-preview__kind">{type === "emergency" ? "Emergency maintenance" : "Scheduled maintenance"}</p>
              <p className="adm-preview__title">{form.title || "Untitled"}</p>
              <p className="adm-preview__msg">{form.message}</p>
              {form.estimatedEnd && <p className="adm-preview__meta">Expected back: {form.estimatedEnd}</p>}
              {form.supportInfo && <p className="adm-preview__meta">Contact: {form.supportInfo}</p>}
            </div>
          </section>

          {!offline && (
            <section className="adm-card adm-card--danger-zone">
              <header className="adm-card__head">
                <h2>Take the site offline</h2>
              </header>
              <p className="adm-muted">Visitors see the maintenance page until you bring the site back. You keep access.</p>
              <div className="adm-segmented" role="radiogroup" aria-label="Maintenance type">
                <button type="button" role="radio" aria-checked={type === "scheduled"} className={type === "scheduled" ? "is-on" : ""} onClick={() => setType("scheduled")}>
                  Scheduled
                </button>
                <button type="button" role="radio" aria-checked={type === "emergency"} className={type === "emergency" ? "is-on is-danger" : ""} onClick={() => setType("emergency")}>
                  Emergency
                </button>
              </div>
              <button type="button" className={`adm-btn adm-btn--block ${type === "emergency" ? "adm-btn--danger" : "adm-btn--warning"}`} onClick={() => setConfirmOffline(true)} disabled={saving}>
                <Icon name="power" />
                {type === "emergency" ? "Start emergency maintenance" : "Start scheduled maintenance"}
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  );

  const feedbackPanel = <FeedbackPanel feedback={feedback} loading={loadingSubmissions} error={submissionsError} />;
  const applicationsPanel = <ApplicationsPanel rows={teamApplications} loading={loadingSubmissions} error={submissionsError} onCopied={setNotice} />;

  const activityPanel = (
    <section className="adm-card">
      <header className="adm-card__head">
        <h2>Activity</h2>
        <span className="adm-muted">{auditLog.length} recent actions</span>
      </header>
      {auditLog.length === 0 ? (
        <p className="adm-empty">No maintenance actions recorded yet.</p>
      ) : (
        <ol className="adm-timeline">
          {auditLog.map((entry) => {
            const kind = entry.action === "enabled" ? (entry.maintenance_type === "emergency" ? "emergency" : "maintenance") : entry.action === "disabled" ? "live" : "neutral";
            return (
              <li key={entry.id}>
                <span className={`adm-dot adm-dot--${kind}`} aria-hidden="true" />
                <div>
                  <p className="adm-timeline__title">
                    {entry.action === "enabled" ? `Site taken offline${entry.maintenance_type === "emergency" ? " (emergency)" : ""}` : entry.action === "disabled" ? "Site brought back online" : "Maintenance page updated"}
                  </p>
                  <p className="adm-timeline__meta" title={fullTime(entry.created_at)}>
                    {entry.admin_label || "Admin"} · {relativeTime(entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  const counts: Partial<Record<TabId, number>> = { feedback: feedback.length, applications: teamApplications.length };

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top__inner">
          <a className="adm-brand" href="/" title="Open the site">
            <LogoMark size={30} />
            <span className="adm-brand__name">
              ma<b>NOW</b>j
            </span>
            <span className="adm-brand__tag">Admin</span>
          </a>
          <span className={`adm-pill adm-pill--${siteState === "live" ? "operational" : siteState === "emergency" ? "down" : "degraded"}`}>
            <span className={`adm-dot adm-dot--${siteState}`} aria-hidden="true" />
            {siteLabel}
          </span>
          <div className="adm-top__actions">
            <span className="adm-top__updated">{lastUpdated ? `Updated ${relativeTime(new Date(lastUpdated).toISOString())}` : ""}</span>
            <button type="button" className="adm-iconbtn" onClick={refreshAll} aria-label="Refresh" title="Refresh">
              <Icon name="refresh" />
            </button>
            <a className="adm-iconbtn" href="/" target="_blank" rel="noopener noreferrer" aria-label="Open site in a new tab" title="Open site">
              <Icon name="external" />
            </a>
            <button type="button" className="adm-iconbtn" onClick={lock} aria-label="Lock admin" title="Lock">
              <Icon name="lock" />
            </button>
          </div>
        </div>
        <nav className="adm-tabs" aria-label="Admin sections">
          <div className="adm-tabs__inner" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`adm-tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                {counts[t.id] !== undefined && <span className="adm-tab__count">{counts[t.id]}</span>}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="adm-main">
        {offline && tab !== "overview" && tab !== "maintenance" && (
          <div className={`adm-banner${emergency ? " adm-banner--emergency" : ""}`}>
            <span>The site is offline for visitors.</span>
            <button type="button" className="adm-btn adm-btn--sm adm-btn--success" onClick={() => runAction("disable")} disabled={saving}>
              Bring back online
            </button>
          </div>
        )}
        {actionError && <p className="adm-error adm-error--box">{actionError}</p>}

        {tab === "overview" && overview}
        {tab === "maintenance" && maintenancePanel}
        {tab === "feedback" && feedbackPanel}
        {tab === "applications" && applicationsPanel}
        {tab === "activity" && activityPanel}

        <p className="adm-foot">Signed in with the shared admin key. It is forgotten when this tab closes, or when you tap Lock.</p>
      </main>

      {notice && (
        <div className="adm-toast" role="status">
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}

      <ConfirmOffline
        open={confirmOffline}
        type={type}
        saving={saving}
        title={form.title}
        onCancel={() => setConfirmOffline(false)}
        onConfirm={() => runAction("enable", type)}
      />
    </div>
  );
}

const HEALTH_LABEL: Record<DependencyState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  not_configured: "Not set up",
};

function Trend({ now, before }: { now: number; before: number }) {
  if (now === 0 && before === 0) return <p className="adm-kpi__foot">None in the last two weeks</p>;
  const diff = now - before;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return (
    <p className={`adm-kpi__foot adm-trend adm-trend--${cls}`}>
      {diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} {diff === 0 ? "Same as" : `${Math.abs(diff)} ${diff > 0 ? "more than" : "fewer than"}`} the week before
    </p>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="adm-toggle">
      <span className="adm-toggle__text">
        <span className="adm-toggle__label">{label}</span>
        <span className="adm-toggle__hint">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="adm-toggle__track" aria-hidden="true" />
    </label>
  );
}

function ConfirmOffline({
  open,
  type,
  saving,
  title,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  type: MaintenanceType;
  saving: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useDialog({ open, onClose: onCancel });
  if (!open) return null;
  const emergency = type === "emergency";
  return (
    <div className="adm-overlay" onClick={onCancel}>
      <div ref={ref} className="adm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-text" onClick={(e) => e.stopPropagation()}>
        <h3 id="adm-confirm-title">{emergency ? "Start emergency maintenance?" : "Take the site offline?"}</h3>
        <p id="adm-confirm-text">
          Every visitor to manowj.com will immediately see the maintenance page{title ? ` ("${title}")` : ""} instead of the map. You keep access, and you can bring the site
          back at any time.
        </p>
        <div className="adm-dialog__actions">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`adm-btn ${emergency ? "adm-btn--danger" : "adm-btn--warning"}`} onClick={onConfirm} disabled={saving}>
            {saving ? "Working…" : "Take site offline"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedbackRow({ entry, compact = false }: { entry: FeedbackSubmission; compact?: boolean }) {
  return (
    <li className="adm-item">
      <div className="adm-item__head">
        <Stars rating={entry.rating} />
        <span className="adm-tag">{entry.category}</span>
        <span className="adm-item__time" title={fullTime(entry.created_at)}>
          {relativeTime(entry.created_at)}
        </span>
      </div>
      {entry.message ? <p className={`adm-item__msg${compact ? " adm-item__msg--clamp" : ""}`}>{entry.message}</p> : <p className="adm-item__msg adm-muted">No comment, rating only.</p>}
      {!compact && (
        <p className="adm-item__meta">
          {describeDevice(entry.user_agent)} · {maskIp(entry.ip_address)}
        </p>
      )}
    </li>
  );
}

function FeedbackPanel({ feedback, loading, error }: { feedback: FeedbackSubmission[]; loading: boolean; error: string | null }) {
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => Array.from(new Set(feedback.map((f) => f.category))).sort(), [feedback]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feedback.filter(
      (f) => (rating === null || Math.round(f.rating) === rating) && (category === "all" || f.category === category) && (!q || (f.message ?? "").toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
    );
  }, [feedback, query, rating, category]);

  return (
    <section className="adm-card">
      <header className="adm-card__head">
        <h2>
          Feedback <span className="adm-muted">{rows.length === feedback.length ? feedback.length : `${rows.length} of ${feedback.length}`}</span>
        </h2>
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `manowj-feedback-${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(rows, [
                { key: "created_at", label: "Date" },
                { key: "rating", label: "Rating" },
                { key: "category", label: "Category" },
                { key: "message", label: "Message" },
                { key: "user_agent", label: "Device" },
              ])
            )
          }
        >
          <Icon name="download" size={16} />
          Export CSV
        </button>
      </header>

      <div className="adm-toolbar">
        <label className="adm-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search comments" aria-label="Search feedback" />
        </label>
        {categories.length > 1 && (
          <select className="adm-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="adm-chips" role="group" aria-label="Filter by rating">
        <button type="button" className={`adm-chip${rating === null ? " adm-chip--on" : ""}`} onClick={() => setRating(null)}>
          All ratings
        </button>
        {[5, 4, 3, 2, 1].map((r) => (
          <button key={r} type="button" className={`adm-chip${rating === r ? " adm-chip--on" : ""}`} onClick={() => setRating(rating === r ? null : r)}>
            {r} ★
          </button>
        ))}
      </div>

      {error && <p className="adm-error">{error}</p>}
      {loading && feedback.length === 0 ? (
        <p className="adm-muted">Loading feedback…</p>
      ) : rows.length === 0 ? (
        <p className="adm-empty">{feedback.length === 0 ? "No feedback submitted yet." : "Nothing matches these filters."}</p>
      ) : (
        <ul className="adm-list">
          {rows.map((f) => (
            <FeedbackRow key={f.id} entry={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicationsPanel({ rows: all, loading, error, onCopied }: { rows: TeamApplicationSubmission[]; loading: boolean; error: string | null; onCopied: (msg: string) => void }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((a) => [a.name, a.email, a.interest, a.message ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [all, query]);

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      onCopied("Email copied.");
    } catch {
      onCopied(email);
    }
  }

  return (
    <section className="adm-card">
      <header className="adm-card__head">
        <h2>
          Join Our Team <span className="adm-muted">{rows.length === all.length ? all.length : `${rows.length} of ${all.length}`}</span>
        </h2>
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `manowj-applications-${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(rows, [
                { key: "created_at", label: "Date" },
                { key: "name", label: "Name" },
                { key: "email", label: "Email" },
                { key: "interest", label: "Interest" },
                { key: "message", label: "Message" },
              ])
            )
          }
        >
          <Icon name="download" size={16} />
          Export CSV
        </button>
      </header>
      <div className="adm-toolbar">
        <label className="adm-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or interest" aria-label="Search applications" />
        </label>
      </div>
      {error && <p className="adm-error">{error}</p>}
      {loading && all.length === 0 ? (
        <p className="adm-muted">Loading applications…</p>
      ) : rows.length === 0 ? (
        <p className="adm-empty">{all.length === 0 ? "No applications submitted yet." : "Nothing matches your search."}</p>
      ) : (
        <ul className="adm-list">
          {rows.map((a) => (
            <li key={a.id} className="adm-item adm-item--person">
              <span className="adm-avatar" aria-hidden="true">
                {initials(a.name)}
              </span>
              <div className="adm-item__body">
                <div className="adm-item__head">
                  <span className="adm-item__name">{a.name}</span>
                  <span className="adm-tag">{a.interest}</span>
                  <span className="adm-item__time" title={fullTime(a.created_at)}>
                    {relativeTime(a.created_at)}
                  </span>
                </div>
                <div className="adm-item__contact">
                  <a href={`mailto:${a.email}`}>
                    <Icon name="mail" size={15} />
                    {a.email}
                  </a>
                  <button type="button" className="adm-linkbtn" onClick={() => copy(a.email)} aria-label={`Copy ${a.email}`}>
                    <Icon name="copy" size={15} />
                    Copy
                  </button>
                </div>
                {a.message && <p className="adm-item__msg">{a.message}</p>}
                <p className="adm-item__meta">
                  {describeDevice(a.user_agent)} · {maskIp(a.ip_address)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
