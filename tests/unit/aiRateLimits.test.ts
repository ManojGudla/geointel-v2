import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_MESSAGES, getAiCompletion, rateLimitScope, resetAiPause } from "../../api/_lib/ai";

/**
 * Which 429 is which, and what each one costs (MOCK TESTS: OpenRouter is
 * replaced by recorded error shapes; nothing here reaches it).
 *
 * The bodies below follow OpenRouter's documented shapes: its own free-tier
 * limits carry "free-models-per-min" / "free-models-per-day", a limit_source
 * and X-RateLimit-* headers; a busy provider's 429 carries the provider's
 * own text instead.
 */
const MINUTE = (resetAt: number) =>
  JSON.stringify({
    error: {
      message: "Rate limit exceeded: free-models-per-min. ",
      code: 429,
      metadata: {
        headers: { "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(resetAt) },
        limit_source: "openrouter_free_tier_per_minute",
        provider_name: null,
      },
    },
  });
const DAY = JSON.stringify({
  error: {
    message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
    code: 429,
    metadata: { headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0" }, provider_name: null },
  },
});
const UPSTREAM = JSON.stringify({
  error: {
    message: "Provider returned error",
    code: 429,
    metadata: { raw: "Resource has been exhausted (e.g. check quota).", provider_name: "Google AI Studio" },
  },
});
const GOOD = { ok: true, status: 200, json: async () => ({ model: "nvidia/nemotron-3.5-lightning:free", choices: [{ message: { content: "An answer." } }] }) };
const refuse = (body: string) => ({ ok: false, status: 429, text: async () => body });
const modelsAsked = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).model as string);

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, OPENROUTER_API_KEY: "test-key" };
  delete process.env.OPENROUTER_MODEL;
  resetAiPause();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe("rateLimitScope", () => {
  it("tells this account's limits apart from a busy provider", () => {
    expect(rateLimitScope(MINUTE(1_800_000_000_000))).toEqual({ scope: "minute", resetAt: 1_800_000_000_000 });
    expect(rateLimitScope(DAY).scope).toBe("day");
    expect(rateLimitScope("google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly").scope).toBe("upstream");
  });

  it("does not take a provider's own 'quota' wording for this account's quota", () => {
    expect(rateLimitScope(UPSTREAM).scope).toBe("upstream");
  });
});

describe("account-wide limits", () => {
  it("stop at the first per-minute refusal instead of asking three more models", async () => {
    const spy = vi.fn(async () => refuse(MINUTE(Date.now() + 30_000)));
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, error: AI_MESSAGES.minuteLimit, reason: "minute-limit" });
  });

  it("stop at the first per-day refusal, and say so to the code, not the visitor", async () => {
    const spy = vi.fn(async () => refuse(DAY));
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("daily-limit");
      // Owner's request, 28 November 2026: no "allowance used, resets at midnight" for visitors.
      expect(result.error).not.toMatch(/free|busy|try again|in a minute|allowance|quota/i);
    }
  });

  it("are remembered, so the next questions are answered at once without spending quota", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T16:25:00Z"));
    const spy = vi.fn(async () => refuse(MINUTE(Date.now() + 20_000)));
    vi.stubGlobal("fetch", spy);

    await getAiCompletion([{ role: "user", content: "first" }]);
    const second = await getAiCompletion([{ role: "user", content: "second" }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ ok: false, error: AI_MESSAGES.minuteLimit, reason: "minute-limit" });

    // Once the reset time OpenRouter gave has passed, it asks again.
    vi.setSystemTime(new Date("2026-11-25T16:25:21Z"));
    spy.mockImplementation(async () => GOOD as never);
    const third = await getAiCompletion([{ role: "user", content: "third" }]);
    expect(third.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("re-check a used-up day every ten minutes, so bought credits are noticed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T16:25:00Z"));
    const spy = vi.fn(async () => refuse(DAY));
    vi.stubGlobal("fetch", spy);
    await getAiCompletion([{ role: "user", content: "first" }]);

    vi.setSystemTime(new Date("2026-11-25T16:34:00Z"));
    expect((await getAiCompletion([{ role: "user", content: "nine minutes on" }])).ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-25T16:35:01Z"));
    spy.mockImplementation(async () => GOOD as never);
    expect((await getAiCompletion([{ role: "user", content: "ten minutes on" }])).ok).toBe(true);
  });

  it("never hold a paid model back: free-model limits do not apply to it", async () => {
    process.env.OPENROUTER_MODEL = "openai/gpt-5-mini";
    // The paid model is down, so the free ones are tried, and they hit the day's limit.
    const spy = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, text: async () => "down" }).mockResolvedValueOnce(refuse(DAY));
    vi.stubGlobal("fetch", spy);
    const first = await getAiCompletion([{ role: "user", content: "first" }]);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.reason).toBe("daily-limit");

    // While the free models are paused, the paid one is still asked.
    spy.mockReset();
    spy.mockResolvedValue(GOOD);
    const second = await getAiCompletion([{ role: "user", content: "second" }]);
    expect(second.ok).toBe(true);
    expect(modelsAsked(spy)).toEqual(["openai/gpt-5-mini"]);
  });
});

describe("a busy provider", () => {
  it("is still a reason to try the next model", async () => {
    const spy = vi.fn().mockResolvedValueOnce(refuse(UPSTREAM)).mockResolvedValueOnce(GOOD);
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    expect(modelsAsked(spy)).toEqual(["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"]);
  });

  it("on every model ends with the plain 'busy' message, and leaves nothing remembered", async () => {
    const spy = vi.fn(async () => refuse(UPSTREAM));
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ ok: false, error: AI_MESSAGES.busy, reason: "busy" });

    spy.mockImplementation(async () => GOOD as never);
    expect((await getAiCompletion([{ role: "user", content: "again" }])).ok).toBe(true);
  });
});

describe("an account that needs attention", () => {
  it("is reported once, without asking the other models", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 402, text: async () => "Payment required" }));
    vi.stubGlobal("fetch", spy);
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("account");
  });
});
