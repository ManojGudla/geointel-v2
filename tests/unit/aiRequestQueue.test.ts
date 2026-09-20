import { describe, expect, it, vi, afterEach } from "vitest";
import { createRequestGate } from "../../src/services/aiRequestQueue";

/**
 * Regression coverage for a real, screenshotted bug: clicking through the six
 * agent cards fired six near-simultaneous calls at OpenRouter's free tier,
 * and two came back HTTP 429 ("The AI provider's rate limit or free-tier
 * quota was hit") while the other four returned real answers. Nothing spaced
 * the requests out. These tests assert the gate's actual behavior - bounded
 * concurrency, spaced starts, honest queued→running signalling - rather than
 * the end-to-end symptom.
 */
afterEach(() => vi.useRealTimers());

/** Resolves when `fn()` first returns true, polling the microtask/timer queue. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("createRequestGate", () => {
  it("never runs more than maxConcurrent tasks at once", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ maxConcurrent: 2, minGapMs: 0 });

    let concurrent = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const task = () =>
      gate.run(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise<void>((r) => release.push(r));
        concurrent -= 1;
        return "ok";
      });

    const all = Promise.all([task(), task(), task(), task(), task(), task()]);
    await settle();

    expect(peak).toBe(2);
    expect(gate.activeCount()).toBe(2);

    // Let them finish one wave at a time; concurrency must stay capped.
    while (release.length) {
      release.shift()!();
      await settle();
      expect(peak).toBeLessThanOrEqual(2);
    }

    await expect(all).resolves.toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
  });

  it("spaces out starts by at least minGapMs so a burst can't all leave at once", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ maxConcurrent: 4, minGapMs: 600 });

    const startTimes: number[] = [];
    const task = () =>
      gate.run(async () => {
        startTimes.push(Date.now());
        return "ok";
      });

    const all = Promise.all([task(), task(), task()]);
    await vi.advanceTimersByTimeAsync(5_000);
    await all;

    expect(startTimes).toHaveLength(3);
    expect(startTimes[1]! - startTimes[0]!).toBeGreaterThanOrEqual(600);
    expect(startTimes[2]! - startTimes[1]!).toBeGreaterThanOrEqual(600);
  });

  it("runs a priority task (a Copilot question) ahead of already-queued agent tasks", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ maxConcurrent: 1, minGapMs: 0 });

    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = gate.run(async () => {
      order.push("agent-1");
      await new Promise<void>((r) => (releaseFirst = r));
    });
    await settle();

    const queuedAgent = gate.run(async () => void order.push("agent-2"));
    const copilot = gate.run(async () => void order.push("copilot"), { priority: true });

    releaseFirst!();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, queuedAgent, copilot]);

    expect(order).toEqual(["agent-1", "copilot", "agent-2"]);
  });

  it("fires onStart only when the task actually leaves the queue, not when it's enqueued", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ maxConcurrent: 1, minGapMs: 0 });

    const started: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = gate.run(async () => new Promise<void>((r) => (releaseFirst = r)), { onStart: () => started.push("first") });
    await settle();

    const second = gate.run(async () => {}, { onStart: () => started.push("second") });
    await settle();

    // Second is queued behind first - it must not have reported "running" yet.
    expect(started).toEqual(["first"]);

    releaseFirst!();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);

    expect(started).toEqual(["first", "second"]);
  });

  it("frees its slot when a task rejects, so one failure doesn't wedge the queue", async () => {
    vi.useFakeTimers();
    const gate = createRequestGate({ maxConcurrent: 1, minGapMs: 0 });

    const failing = gate.run(async () => {
      throw new Error("rate limited");
    });
    await expect(failing).rejects.toThrow("rate limited");

    await vi.advanceTimersByTimeAsync(10);
    await expect(gate.run(async () => "recovered")).resolves.toBe("recovered");
    expect(gate.activeCount()).toBe(0);
  });
});
