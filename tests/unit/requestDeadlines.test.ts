import { describe, expect, it, vi, afterEach } from "vitest";
import { apiGet, shouldRetryQuery, ApiUnavailableError, MAX_QUERY_RETRIES } from "../../src/services/apiClient";

/**
 * Every request ends. The timeout used to be cleared as soon as response
 * headers arrived, so a body that started and then stalled could keep a panel
 * spinning for as long as the connection stayed open.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("request deadlines", () => {
  it("times out a response whose body never finishes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"ok":true,'));
            // ...and never closes. Aborting the signal errors the stream,
            // the same way a real fetch body reacts to an abort.
            init.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      })
    );

    const pending = apiGet("/api/weather", { lat: 1, lon: 2 }, undefined, 5_000);
    const settled = expect(pending).rejects.toThrow(/timed out after 5s/);
    await vi.advanceTimersByTimeAsync(5_100);
    await settled;
  });
});

describe("which failures are retried", () => {
  it("retries transient failures up to the limit", () => {
    const transient = new Error("Could not reach /api/gis");
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, transient)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, transient)).toBe(false);
    expect(shouldRetryQuery(0, new ApiUnavailableError("Overpass down", "PROVIDER_UNAVAILABLE"))).toBe(true);
  });

  it("does not hammer a provider that said too many requests", () => {
    expect(shouldRetryQuery(0, new ApiUnavailableError("Too many GIS requests.", "RATE_LIMITED"))).toBe(false);
  });

  it("does not retry answers that cannot change", () => {
    for (const code of ["NOT_CONFIGURED", "UNAUTHORIZED", "NO_RESULT", "MAINTENANCE", "BBOX_TOO_LARGE"]) {
      expect(shouldRetryQuery(0, new ApiUnavailableError("final", code))).toBe(false);
    }
  });
});
