import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TtlCache, RateLimiter } from "../../api/_lib/cache";

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
