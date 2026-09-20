import { RateLimiter, withTimeout } from "./cache.js";
import { getSupabaseClient } from "./supabase.js";

/**
 * A rate limit that actually holds across serverless instances.
 *
 * The in-memory RateLimiter in cache.ts counts inside one Node process. On
 * Vercel that means: concurrent requests land on different instances, each
 * starting at zero; a cold start resets the count; and an attacker who simply
 * opens twenty connections at once never meets the limit at all. The comment
 * at the top of cache.ts admitted this and called it acceptable.
 *
 * It stopped being acceptable at GET /api/admin/maintenance, which returns
 * `adminKeyValid: true|false` for any key sent to it without authentication.
 * That is a guessing oracle, and the in-memory counter was the only thing
 * limiting how fast it could be guessed. The AI routes are the other case:
 * every call there spends real money on OpenRouter.
 *
 * The counting happens in Postgres (supabase/migrations/0005_rate_limits.sql)
 * in a single atomic statement, so two simultaneous callers cannot both read
 * the same count and both decide they are under the limit.
 *
 * WHERE THIS IS NOT USED, on purpose: the geographic routes. They are
 * edge-cached and called constantly, and a database round trip on each one
 * would cost every visitor latency to prevent abuse the CDN already absorbs.
 */

/**
 * What happens when the database cannot be reached.
 *
 * It falls back to the in-memory limiter rather than failing either fully open
 * or fully closed. Failing open drops all protection during exactly the outage
 * an attacker might have caused. Failing closed is worse than it sounds here:
 * it would lock the owner out of the admin endpoints - including the one that
 * turns maintenance mode off - at the moment something is already wrong.
 *
 * So a Supabase outage degrades to the weak-but-real behaviour this had
 * before, and says so in the log.
 */
const fallbacks = new Map<string, RateLimiter>();

function fallbackFor(windowMs: number, maxRequests: number): RateLimiter {
  const id = `${windowMs}:${maxRequests}`;
  let limiter = fallbacks.get(id);
  if (!limiter) {
    limiter = new RateLimiter(windowMs, maxRequests);
    fallbacks.set(id, limiter);
  }
  return limiter;
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterMs: number;
  /** True when this answer came from process memory because the store was unreachable. */
  degraded: boolean;
}

/** A short timeout: a slow limiter must never become the reason a request is slow. */
const LIMIT_TIMEOUT_MS = 2_500;

export async function checkDurableLimit(
  scope: string,
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateVerdict> {
  // Scoped so that one IP's admin attempts and its AI requests are counted
  // separately, rather than one starving the other.
  const compositeKey = `${scope}:${key}`;
  const client = getSupabaseClient();

  if (!client) {
    const local = fallbackFor(windowMs, maxRequests).check(compositeKey);
    return { ...local, degraded: true };
  }

  try {
    const { data, error } = await withTimeout(
      client.rpc("check_rate_limit", { p_key: compositeKey, p_window_ms: windowMs, p_max: maxRequests }),
      LIMIT_TIMEOUT_MS,
      "rate limit"
    );
    if (error) throw new Error(error.message);

    // The function returns a one-row table.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") throw new Error("unexpected rate_limit shape");

    return { allowed: row.allowed, retryAfterMs: Number(row.retry_after_ms) || 0, degraded: false };
  } catch (error) {
    console.error("[rate-limit] falling back to in-memory", error instanceof Error ? error.message : error);
    const local = fallbackFor(windowMs, maxRequests).check(compositeKey);
    return { ...local, degraded: true };
  }
}
