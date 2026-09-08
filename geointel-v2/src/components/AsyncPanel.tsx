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

/**
 * The one shared implementation of the loading / success / empty / error /
 * unavailable state machine every intelligence panel needs (weather, news,
 * GIS evidence, property analysis, nearby, routing...). Reusing this instead
 * of five copies of the same conditional is what keeps those panels honest:
 * a provider outage always reads as "<X> temporarily unavailable," never a
 * blank panel or fabricated content.
 */
export function AsyncPanel<T>({ query, label, isEmpty, emptyMessage, idleMessage, children }: AsyncPanelProps<T>) {
  if (query.fetchStatus === "idle" && query.status === "pending") {
    return (
      <div className="async-panel async-panel--idle" role="status">
        {idleMessage ?? `Select a location to load ${label.toLowerCase()}.`}
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="async-panel async-panel--loading" role="status" aria-live="polite">
        <span className="async-panel__spinner" aria-hidden="true" />
        Loading {label.toLowerCase()}…
      </div>
    );
  }

  if (query.isError) {
    const unavailable = query.error instanceof ApiUnavailableError;
    return (
      <div className="async-panel async-panel--unavailable" role="status">
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
        {idleMessage ?? `Select a location to load ${label.toLowerCase()}.`}
      </div>
    );
  }

  if (isEmpty?.(query.data)) {
    return (
      <div className="async-panel async-panel--empty" role="status">
        {emptyMessage ?? `No ${label.toLowerCase()} found for this location.`}
      </div>
    );
  }

  return <>{children(query.data)}</>;
}
