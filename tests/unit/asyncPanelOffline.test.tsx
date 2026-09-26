import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AsyncPanel } from "../../src/components/AsyncPanel";

/**
 * What a panel says when the network is the problem.
 *
 * Offline, TanStack pauses a query rather than failing it. A paused query is
 * neither loading nor errored, so panels fell through to "Select a location
 * to load weather" in front of someone who had selected one. And a refresh
 * that failed replaced data already on screen with an error box.
 */

afterEach(cleanup);

function q<T>(over: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    error: null,
    status: "pending",
    fetchStatus: "idle",
    isLoading: false,
    isError: false,
    isSuccess: false,
    dataUpdatedAt: 0,
    refetch: async () => ({}) as never,
    ...over,
  } as UseQueryResult<T>;
}

const body = (d: { temp: number }) => <p>Temperature {d.temp}°</p>;

describe("AsyncPanel and the network", () => {
  it("says offline, not 'select a location', when a first load is paused", () => {
    render(<AsyncPanel query={q({ fetchStatus: "paused", status: "pending" })} label="Weather">{body}</AsyncPanel>);
    expect(screen.getByText(/you're offline/i)).toBeTruthy();
    expect(screen.queryByText(/select a location/i)).toBeNull();
  });

  it("keeps showing loaded data when a refresh fails, labelled with its time", () => {
    const loaded = new Date("2026-09-26T09:05:00").getTime();
    render(
      <AsyncPanel
        query={q({ data: { temp: 31 }, status: "error", isError: true, error: new Error("timeout"), dataUpdatedAt: loaded })}
        label="Weather"
      >
        {body}
      </AsyncPanel>
    );
    expect(screen.getByText("Temperature 31°")).toBeTruthy();
    expect(screen.getByText(/couldn't refresh weather/i).textContent).toMatch(/showing what loaded at/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("keeps showing loaded data while offline, labelled as offline", () => {
    render(
      <AsyncPanel query={q({ data: { temp: 31 }, status: "success", isSuccess: true, fetchStatus: "paused", dataUpdatedAt: Date.now() })} label="Weather">
        {body}
      </AsyncPanel>
    );
    expect(screen.getByText("Temperature 31°")).toBeTruthy();
    expect(screen.getByText(/^offline\./i)).toBeTruthy();
  });

  it("still shows the error box when there is nothing to fall back on", () => {
    render(<AsyncPanel query={q({ status: "error", isError: true, error: new Error("Provider down") })} label="Weather">{body}</AsyncPanel>);
    expect(screen.getByText(/failed to load/i)).toBeTruthy();
    expect(screen.getByText("Provider down")).toBeTruthy();
  });

  it("shows fresh data with no note at all", () => {
    render(<AsyncPanel query={q({ data: { temp: 30 }, status: "success", isSuccess: true, dataUpdatedAt: Date.now() })} label="Weather">{body}</AsyncPanel>);
    expect(screen.getByText("Temperature 30°")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
