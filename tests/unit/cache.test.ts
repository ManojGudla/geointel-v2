import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TtlCache, RateLimiter, withTimeout } from "../../api/_lib/cache";

describe("TtlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a stored value before it expires", () => {
    const cache = new TtlCache<string>(1000);
    cache.set("a", "hello");
    expect(cache.get("a")).toBe("hello");
  });

  it("expires values after the TTL", () => {
    const cache = new TtlCache<string>(1000);
    cache.set("a", "hello");
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests under the limit", () => {
    const limiter = new RateLimiter(1000, 3);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("blocks requests over the limit within the window", () => {
    const limiter = new RateLimiter(1000, 2);
    limiter.check("ip1");
    limiter.check("ip1");
    const third = limiter.check("ip1");
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const limiter = new RateLimiter(1000, 1);
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new RateLimiter(1000, 1);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip2").allowed).toBe(true);
  });
});

// Regression coverage for a real bug: getMaintenanceState() and
// searchKnowledgeBase() each awaited a Supabase call with nothing bounding
// it — unlike every other external dependency in this project, which all
// go through fetchWithTimeout above. A slow/unreachable Supabase project
// (a paused free-tier project is the common real case) left that await
// hanging until some much longer platform-level socket timeout finally
// gave up, which is what actually caused "every feature hangs for 5+
// minutes, then works." withTimeout is the fix both call sites now use.
describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the underlying value when it settles before the deadline", async () => {
    const result = withTimeout(Promise.resolve("real data"), 1000, "test call");
    await expect(result).resolves.toBe("real data");
  });

  it("propagates a rejection from the underlying promise when it rejects before the deadline", async () => {
    const result = withTimeout(Promise.reject(new Error("boom")), 1000, "test call");
    await expect(result).rejects.toThrow("boom");
  });

  it("rejects on its own once the deadline passes, instead of hanging forever", async () => {
    const neverSettles = new Promise<string>(() => {});
    const result = withTimeout(neverSettles, 1000, "slow thing");
    const assertion = expect(result).rejects.toThrow(/slow thing timed out after 1s/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
