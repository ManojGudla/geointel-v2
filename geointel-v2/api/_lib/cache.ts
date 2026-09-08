/**
 * A tiny in-memory TTL cache + simple sliding-window rate limiter, shared by
 * every api/*.ts handler that hits an external provider (Nominatim,
 * Overpass, OSRM, Open-Meteo, news RSS). Ported from the pattern that was
 * already working well in the previous version of this project.
 *
 * Note: in a real multi-instance serverless deployment this cache is
 * per-instance, not shared — that's an acceptable, explicit limitation for
 * now (it still cuts duplicate-request load within a warm instance); a
 * follow-up phase can move this to a shared store (e.g. Supabase or Redis)
 * if traffic warrants it.
 */

type CacheEntry<T> = { expires: number; data: T };

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T) {
    this.store.set(key, { expires: Date.now() + this.ttlMs, data });
  }
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private windowMs: number, private maxRequests: number) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count >= this.maxRequests) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
