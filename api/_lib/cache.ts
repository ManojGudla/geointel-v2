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

  delete(key: string) {
    this.store.delete(key);
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

/**
 * Races an arbitrary awaitable against a deadline. Every OUTBOUND HTTP call
 * in this project goes through fetchWithTimeout above — except the
 * Supabase JS client, which doesn't take a per-query AbortController the
 * way a plain fetch() does. That gap is the real cause behind the reported
 * "everything hangs for 5+ minutes, then works": getMaintenanceState()
 * (api/_lib/maintenance.ts, called by withMaintenanceGuard on nearly every
 * handler — nearby, gis, weather, officials, both AI endpoints, all of it)
 * and searchKnowledgeBase() (api/_lib/kb.ts, called on every Copilot/agent
 * request) each did one Supabase read with NOTHING bounding it, unlike
 * every other external dependency here. A slow-to-wake or unreachable
 * Supabase project (a paused free-tier project is the common real-world
 * case) left that await hanging until whatever socket-level timeout the
 * runtime happens to default to — which is consistent with a stall that
 * hits every feature at once (almost every handler passes through the same
 * unguarded maintenance check first) and clears itself once the connection
 * finally resolves one way or the other.
 *
 * This can't cancel the underlying Supabase request the way fetchWithTimeout
 * cancels a real fetch (the client doesn't expose that per-query), but it
 * stops the CALLER from waiting past `timeoutMs` — which is what actually
 * unblocks the user; the abandoned request just finishes in the background.
 */
export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
