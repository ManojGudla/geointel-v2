/**
 * A small concurrency gate for AI provider calls.
 *
 * Reported bug: clicking through the six agent cards in the strip (which is
 * the natural thing to do — they sit in a row) fired six near-simultaneous
 * POSTs to /api/ai/agent, and OpenRouter's free tier answered a couple of
 * them with HTTP 429. Two cards showed "The AI provider's rate limit or
 * free-tier quota was hit" while the other four returned real answers — not
 * a provider outage, just more requests at once than a free-tier key is
 * allowed to make. Nothing in the app spaced them out; every card fetched
 * the moment it was clicked.
 *
 * This queues AI calls so at most `maxConcurrent` are in flight and starts
 * are at least `minGapMs` apart, turning that burst into a short ramp. It
 * deliberately does NOT retry a rejected call: a 429 can mean either the
 * per-minute limit (which spacing avoids in the first place) or the daily
 * free-tier quota (which no amount of retrying fixes), and silently
 * retrying the second case would just hide a real "you're out of quota"
 * answer behind a longer wait. The card's existing Retry button stays the
 * honest way to try again.
 */
export interface RequestGateOptions {
  /** Maximum number of tasks running at the same time. */
  maxConcurrent: number;
  /** Minimum delay between two task starts, so a burst can't all leave at once. */
  minGapMs: number;
}

export interface RunOptions {
  /**
   * Jump the queue. Used for a Copilot question, which is a person waiting
   * on an answer right now — it shouldn't sit behind five background agent
   * cards someone clicked a moment earlier.
   */
  priority?: boolean;
  /** Fires when the task actually leaves the queue, so callers can show "queued" vs. "running" honestly. */
  onStart?: () => void;
}

export interface RequestGate {
  run<T>(task: () => Promise<T>, options?: RunOptions): Promise<T>;
  /** In-flight count — exposed for tests and debugging, not used by the UI. */
  activeCount(): number;
}

export function createRequestGate({ maxConcurrent, minGapMs }: RequestGateOptions): RequestGate {
  let active = 0;
  // The earliest time the NEXT task may start. Each task reserves its slot
  // synchronously (before it awaits), so several tasks released together
  // line up at +0, +gap, +2*gap. Measuring against a "last start" timestamp
  // instead looks equivalent but isn't: tasks that begin waiting in the same
  // tick all read the same stale value, all sleep the same amount, and then
  // start simultaneously anyway — which is exactly the burst this exists to
  // prevent. A unit test covers that case directly.
  let nextAllowedStart = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    if (active >= maxConcurrent) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next();
  };

  return {
    activeCount: () => active,

    run<T>(task: () => Promise<T>, options: RunOptions = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = async () => {
          try {
            const now = Date.now();
            const startAt = Math.max(now, nextAllowedStart);
            nextAllowedStart = startAt + minGapMs;
            if (startAt > now) {
              await new Promise((r) => setTimeout(r, startAt - now));
            }
            options.onStart?.();
            resolve(await task());
          } catch (error) {
            reject(error);
          } finally {
            active -= 1;
            pump();
          }
        };

        if (options.priority) queue.unshift(start);
        else queue.push(start);
        pump();
      });
    },
  };
}
