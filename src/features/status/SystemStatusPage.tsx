import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/services/apiClient";
import "./SystemStatusPage.css";

type DependencyState = "operational" | "degraded" | "down" | "not_configured";

interface DependencyStatus {
  id: string;
  name: string;
  affects: string;
  status: DependencyState;
  latencyMs: number | null;
  detail: string;
}

interface StatusResponse {
  dependencies: DependencyStatus[];
  checkedAt: string;
  stale: boolean;
}

const LABEL: Record<DependencyState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  not_configured: "Not configured",
};

/**
 * Live dependency health, read from /api/status.
 *
 * This app's failure modes are overwhelmingly other people's
 * infrastructure — six free Overpass mirrors, Nominatim, Wikidata,
 * OpenRouter, Supabase — so when a panel says "temporarily unavailable" the
 * useful question is which dependency is at fault. Answering that used to
 * require reading server logs, which is fine for one developer and not fine
 * for a tool a team relies on daily.
 *
 * Every row here reflects a real probe with a real measured latency. There
 * is no hardcoded green anywhere on this page: if a check didn't run, it
 * says so rather than implying health.
 */
export function SystemStatusPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["system-status"],
    queryFn: ({ signal }) => apiGet<StatusResponse>("/api/status", undefined, signal),
    // The endpoint caches for 60s server-side; matching that here avoids
    // hammering it from an open tab while keeping the page useful during an
    // active incident.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const worst = data?.dependencies.reduce<DependencyState>((acc, dep) => {
    if (acc === "down" || dep.status === "down") return "down";
    if (acc === "degraded" || dep.status === "degraded") return "degraded";
    if (acc === "not_configured" || dep.status === "not_configured") return "not_configured";
    return "operational";
  }, "operational");

  return (
    <div className="system-status">
      <header className="system-status__head">
        <div>
          <h1>System status</h1>
          <p className="system-status__sub">Live health of every external service maNOWj GeoIntel depends on.</p>
        </div>
        <a className="system-status__back" href="/">
          ← Back to app
        </a>
      </header>

      {isLoading && <p className="system-status__note">Running live checks…</p>}

      {isError && (
        <div className="system-status__error">
          <p>Couldn't run the status checks: {error instanceof Error ? error.message : "unknown error"}</p>
          <button type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className={`system-status__overall system-status__overall--${worst}`}>
            <strong>
              {worst === "operational"
                ? "All systems operational"
                : worst === "degraded"
                  ? "Degraded: some features may be slow or intermittent"
                  : worst === "down"
                    ? "Outage: one or more dependencies are unreachable"
                    : "Partially configured: some features are switched off"}
            </strong>
            <span>
              Checked {new Date(data.checkedAt).toLocaleTimeString()}
              {data.stale ? " (cached reading)" : ""}
              {isFetching ? " · refreshing…" : ""}
            </span>
          </div>

          <ul className="system-status__list">
            {data.dependencies.map((dep) => (
              <li key={dep.id} className={`system-status__row system-status__row--${dep.status}`}>
                <div className="system-status__row-head">
                  <span className={`system-status__dot system-status__dot--${dep.status}`} aria-hidden="true" />
                  <strong>{dep.name}</strong>
                  <span className="system-status__state">{LABEL[dep.status]}</span>
                  {dep.latencyMs !== null && <span className="system-status__latency">{dep.latencyMs} ms</span>}
                </div>
                <p className="system-status__detail">{dep.detail}</p>
                <p className="system-status__affects">Affects: {dep.affects}</p>
              </li>
            ))}
          </ul>

          <p className="system-status__note">
            Each row is a real probe run from the server, not a cached assumption. Results are cached for 60 seconds so this page doesn't itself add load to
            the free public services it monitors. The AI check confirms the provider is reachable and the key is accepted. It deliberately doesn't spend a
            generation request, so it can't report on the daily quota.
          </p>
        </>
      )}
    </div>
  );
}
