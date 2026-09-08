import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";

/**
 * Regression coverage for a real bug: buildDataBlock() in api/ai/agent.ts
 * used to push "Active route: none set." into the data block for EVERY
 * agent kind, not just "navigation". The GIS Intelligence agent (asked
 * about property/GIS evidence, nothing to do with directions) would latch
 * onto that stray unrelated line and start talking about routing — "the
 * active route is set to none" — instead of answering the question it was
 * actually asked. These tests capture the exact system prompt sent to the
 * model and assert route noise only reaches agents that care about routes.
 */
function mockAi(capture: { systemPrompt?: string }) {
  vi.doMock("../../api/_lib/ai", () => ({
    getAiCompletion: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
      capture.systemPrompt = messages.find((m) => m.role === "system")?.content;
      return { ok: true, content: "Summary.", model: "test-model" };
    }),
  }));
}

function mockKb() {
  vi.doMock("../../api/_lib/kb", () => ({
    searchKnowledgeBase: vi.fn(async () => []),
  }));
}

describe("api/ai/agent handler", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/ai");
    vi.doUnmock("../../api/_lib/kb");
  });

  it("does not mention routes at all for a non-navigation agent when no route is set", async () => {
    vi.resetModules();
    const capture: { systemPrompt?: string } = {};
    mockAi(capture);
    mockKb();
    const { default: handler } = await import("../../api/_routes/ai/agent");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { kind: "gis", context: { locationName: "Eiffel Tower", gis: { radiusMeters: 60, counts: { poi: 3 } } } };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    expect(capture.systemPrompt).toBeDefined();
    expect(capture.systemPrompt).not.toMatch(/active route/i);
  });

  it("still tells the navigation agent explicitly when no route is set", async () => {
    vi.resetModules();
    const capture: { systemPrompt?: string } = {};
    mockAi(capture);
    mockKb();
    const { default: handler } = await import("../../api/_routes/ai/agent");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { kind: "navigation", context: { locationName: "Eiffel Tower" } };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    expect(capture.systemPrompt).toMatch(/active route: none set/i);
  });

  it("includes real route details for any agent kind when a route is actually set", async () => {
    vi.resetModules();
    const capture: { systemPrompt?: string } = {};
    mockAi(capture);
    mockKb();
    const { default: handler } = await import("../../api/_routes/ai/agent");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = {
      kind: "property",
      context: { locationName: "Eiffel Tower", route: { mode: "walk", distanceMeters: 500, durationSeconds: 400 } },
    };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    expect(capture.systemPrompt).toMatch(/active route: walk, 500m, 400s/i);
  });

  it("rejects an unknown agent kind", async () => {
    vi.resetModules();
    mockKb();
    vi.doMock("../../api/_lib/ai", () => ({ getAiCompletion: vi.fn() }));
    const { default: handler } = await import("../../api/_routes/ai/agent");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { kind: "not-a-real-kind" };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(400);
  });

  it("only accepts POST", async () => {
    vi.resetModules();
    mockKb();
    vi.doMock("../../api/_lib/ai", () => ({ getAiCompletion: vi.fn() }));
    const { default: handler } = await import("../../api/_routes/ai/agent");

    const result = fakeReqRes({});
    result.req.method = "GET";
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(405);
  });
});
