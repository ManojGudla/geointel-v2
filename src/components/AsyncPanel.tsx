import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiUnavailableError } from "@/services/apiClient";

interface AsyncPanelProps<T> {
  query: UseQueryResult<T>;
  /** Panel name shown in state messages, e.g. "Live weather", "GIS evidence". */
  label: string;
  /** Return true when a successful response has no meaningful content. */
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  idleMessage?: string;
  children: (data: T) => ReactNode;
}

function loadedAt(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The one shared implementation of the loading / success / empty / error /
 * unavailable state machine every intelligence panel needs (weather, news,
 * GIS evidence, property analysis, nearby, routing...). Reusing this instead
 * of five copies of the same conditional is what keeps those panels honest:
 * a provider outage always reads as "<X> temporarily unavailable," never a
 * blank panel or fabricated content.
 */
export function AsyncPanel<T>({ query, label, isEmpty, emptyMessage, idleMessage, children }: AsyncPanelProps<T>) {
  const lower = label.toLowerCase();
  const paused = query.fetchStatus === "paused";

  if (query.fetchStatus === "idle" && query.status === "pending") {
    return (
      <div className="async-panel async-panel--idle" role="status">
        {idleMessage ?? `Select a location to load ${lower}.`}
      </div>
    );
  }

  /*
    Offline with nothing loaded yet. TanStack pauses a query instead of
    failing it when there is no connection, and a paused query is neither
    loading nor errored, so it used to fall through to the idle branch below
    and tell someone who HAD picked a place to "select a location". It resumes
    by itself when the connection returns.
  */
  if (paused && query.data === undefined) {
    return (
      <div className="async-panel async-panel--unavailable async-panel--fade-in" role="status">
        <span className="async-panel__icon" aria-hidden="true">
          📡
        </span>
        <strong>You're offline</strong>
        <p>{label} will load as soon as the connection is back.</p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="async-panel async-panel--loading" role="status" aria-live="polite">
        <span className="async-panel__spinner" aria-hidden="true" />
        Loading {lower}…
      </div>
    );
  }

  if (query.isError && query.data === undefined) {
    const unavailable = query.error instanceof ApiUnavailableError;
    return (
      <div className="async-panel async-panel--unavailable async-panel--fade-in" role="status">
        <span className="async-panel__icon" aria-hidden="true">
          {unavailable ? "🔌" : "⚠️"}
        </span>
        <strong>{label} {unavailable ? "temporarily unavailable" : "failed to load"}</strong>
        <p>{query.error instanceof Error ? query.error.message : "Please try again."}</p>
        <button type="button" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (query.data === undefined) {
    return (
      <div className="async-panel async-panel--idle" role="status">
        {idleMessage ?? `Select a location to load ${lower}.`}
      </div>
    );
  }

  /*
    Data already on screen stays on screen when a refresh fails or the
    connection drops. It used to be replaced by the error, throwing away a
    perfectly good answer. It is labelled with when it was loaded, so it is
    never passed off as live.
  */
  const stale = query.isError || paused;
  const staleNote = stale ? (
    <p className="async-panel__stale" role="status">
      {paused ? "Offline." : `Couldn't refresh ${lower}.`} Showing what loaded at {loadedAt(query.dataUpdatedAt)}.
      {!paused && (
        <>
          {" "}
          <button type="button" className="async-panel__stale-retry" onClick={() => query.refetch()}>
            Retry
          </button>
        </>
      )}
    </p>
  ) : null;

  if (isEmpty?.(query.data)) {
    return (
      <>
        {staleNote}
        <div className="async-panel async-panel--empty async-panel--fade-in" role="status">
          <span className="async-panel__icon" aria-hidden="true">
            🔍
          </span>
          {emptyMessage ?? `No ${lower} found for this location.`}
        </div>
      </>
    );
  }

  return (
    <>
      {staleNote}
      {children(query.data)}
    </>
  );
}
