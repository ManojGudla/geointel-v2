import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The rate limiter that guards the admin key and the paid AI routes.
 *
 * What it replaced: a counter in a JavaScript Map inside the running function.
 * On Vercel that is per-process and per-cold-start, so two simultaneous
 * requests were counted by two different instances that had each seen zero
 * requests, and every cold start handed the caller a fresh budget. The old
 * code said so in a comment and shipped anyway.
 *
 * That mattered most at GET /api/admin/maintenance, which tells anyone who
 * asks whether an admin key is correct. Counting is now a single atomic
 * statement in Postgres (supabase/migrations/0005_rate_limits.sql).
 *
 * These tests pin the two behaviours that are easy to get wrong when wiring a
 * limiter to a database: it must not fail open, and it must not fail closed.
 */

const rpc = vi.fn();
vi.mock("../../api/_lib/supabase.js", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

const { checkDurableLimit } = await import("../../api/_lib/rateLimit.js");

afterEach(() => {
  rpc.mockReset();
  vi.restoreAllMocks();
});

describe("the durable rate limiter", () => {
  it("passes the scope, key, window and ceiling through to the database", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_ms: 0 }], error: null });

    const verdict = await checkDurableLimit("admin", "203.0.113.9", 60_000, 20);

    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "admin:203.0.113.9",
      p_window_ms: 60_000,
      p_max: 20,
    });
    expect(verdict).toEqual({ allowed: true, retryAfterMs: 0, degraded: false });
  });

  it("scopes the key, so admin attempts and AI calls do not share a budget", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_ms: 0 }], error: null });

    await checkDurableLimit("admin", "1.1.1.1", 60_000, 20);
    await checkDurableLimit("ai", "1.1.1.1", 60_000, 15);

    const keys = rpc.mock.calls.map((c) => c[1].p_key);
    expect(keys).toEqual(["admin:1.1.1.1", "ai:1.1.1.1"]);
  });

  it("refuses the request when the database says the window is full", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_ms: 41_000 }], error: null });

    const verdict = await checkDurableLimit("admin", "5.5.5.5", 60_000, 20);

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterMs).toBe(41_000);
    expect(verdict.degraded).toBe(false);
  });

  it("does NOT fail open when the database errors", async () => {
    // The failure mode that would matter: an attacker who can break the
    // limiter's storage should not thereby remove the limit. Falling back to
    // the in-memory counter is weak, but it is not nothing.
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkDurableLimit("fail-open-test", "9.9.9.9", 60_000, 2));

    expect(results.every((r) => r.degraded)).toBe(true);
    expect(results.map((r) => r.allowed)).toEqual([true, true, false, false]);
  });

  it("does NOT fail closed either, so an outage cannot lock the owner out", async () => {
    /**
     * The opposite mistake, and the more tempting one. Refusing every admin
     * request while Supabase is unreachable would lock the owner out of the
     * endpoint that turns maintenance mode OFF - at exactly the moment
     * something is already broken.
     */
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("network down"));

    const verdict = await checkDurableLimit("fail-closed-test", "8.8.8.8", 60_000, 20);

    expect(verdict.allowed).toBe(true);
    expect(verdict.degraded).toBe(true);
  });

  it("treats a malformed answer as a failure rather than trusting it", async () => {
    // A row without `allowed` must not be read as "allowed", which is what a
    // plain `data?.allowed` truthiness check would have done.
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: [{}], error: null });

    const verdict = await checkDurableLimit("malformed-test", "7.7.7.7", 60_000, 20);
    expect(verdict.degraded).toBe(true);
  });
});
