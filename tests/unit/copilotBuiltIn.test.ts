import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";

/**
 * The Copilot route answers questions about the app itself without a model
 * (MOCK TESTS: the model and the rate limiter are replaced, so these prove
 * which path a question takes, not what any model says).
 *
 * Reported 25 November 2026: "What can this app do?" answered "The free AI
 * models are busy (rate limited) right now."
 */
const seen = vi.hoisted(() => ({ modelCalls: 0, limiterCalls: 0, kbCalls: 0 }));

function mockAll() {
  vi.doMock("../../api/_lib/ai", () => ({
    getAiCompletion: vi.fn(async () => {
      seen.modelCalls += 1;
      return { ok: false, error: "The free AI models are busy right now. Please try again in a minute.", reason: "busy" };
    }),
  }));
  vi.doMock("../../api/_lib/rateLimit", () => ({
    checkDurableLimit: vi.fn(async () => {
      seen.limiterCalls += 1;
      return { allowed: true };
    }),
  }));
  vi.doMock("../../api/_lib/kb", () => ({
    searchKnowledgeBase: vi.fn(async () => {
      seen.kbCalls += 1;
      return [];
    }),
  }));
}

async function ask(body: Record<string, unknown>) {
  const { default: handler } = await import("../../api/_routes/ai/copilot");
  const call = fakeReqRes({});
  call.req.method = "POST";
  call.req.body = body;
  await handler(call.req, call.res);
  return call;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../api/_lib/ai");
  vi.doUnmock("../../api/_lib/rateLimit");
  vi.doUnmock("../../api/_lib/kb");
  seen.modelCalls = 0;
  seen.limiterCalls = 0;
  seen.kbCalls = 0;
});

describe("Copilot built-in answers", () => {
  it("answers 'What can this app do?' while the free AI is busy, without asking it", async () => {
    mockAll();
    const call = await ask({ question: "What can this app do?" });
    const body = call.body as { answer: string; model: string; sources: string[]; evidence: unknown[] };
    expect(call.statusCode).toBe(200);
    expect(body.answer).toMatch(/^maNOWj GeoIntel shows you what any place is really like/);
    expect(body.model).toBe("built-in help");
    expect(body.sources).toEqual([]);
    expect(body.evidence).toEqual([]);
    expect(seen.modelCalls).toBe(0);
    expect(seen.kbCalls).toBe(0);
  });

  it("does not count a built-in answer against the visitor's AI allowance", async () => {
    mockAll();
    await ask({ question: "hi" });
    await ask({ question: "thanks" });
    expect(seen.limiterCalls).toBe(0);
  });

  it("still sends a question about the place to the model", async () => {
    mockAll();
    // No anchor, so no provider is asked; only the path to the model is under test.
    await ask({ question: "Is this a good area for a cafe?" });
    expect(seen.limiterCalls).toBe(1);
    expect(seen.modelCalls).toBe(1);
  });

  it("still checks the question before answering it", async () => {
    mockAll();
    expect((await ask({ question: "" })).statusCode).toBe(400);
    expect((await ask({ question: "x".repeat(501) })).statusCode).toBe(400);
  });
});
