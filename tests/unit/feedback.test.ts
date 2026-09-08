import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";

describe("api/feedback handler", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("rejects a missing rating", async () => {
    vi.resetModules();
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { deviceId: "device-1" };
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("rejects an out-of-range rating", async () => {
    vi.resetModules();
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { deviceId: "device-1", rating: 9 };
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("rejects a missing device id", async () => {
    vi.resetModules();
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { rating: 5 };
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("returns 503 NOT_CONFIGURED (never throws) when Supabase credentials aren't set", async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { deviceId: "device-1", rating: 5, category: "general" };
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(503);
    expect((result.body as { code: string }).code).toBe("NOT_CONFIGURED");
  });

  it("degrades to a 502 instead of throwing when the database insert fails", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          insert: async () => ({ error: { message: "insert failed" } }),
          // withMaintenanceGuard (every non-admin handler is wrapped in it
          // now) calls getMaintenanceState(), which does this select — not
          // what this test is about, so just report "no maintenance row",
          // same as an unconfigured/unmigrated project.
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }));
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { deviceId: "device-1", rating: 4, category: "bug", message: "test" };
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(502);
  });

  it("saves successfully when the database insert succeeds", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          insert: async () => ({ error: null }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }));
    const { default: handler } = await import("../../api/_routes/feedback");
    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { deviceId: "device-1", rating: 5, category: "praise" };
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    expect((result.body as { ok: boolean; saved: boolean }).saved).toBe(true);
  });
});
