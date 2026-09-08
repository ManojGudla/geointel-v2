import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";

const ORIGINAL_ADMIN_KEY = process.env.GEOINTEL_ADMIN_KEY;
const ADMIN_KEY = "test-admin-key";

function mockSupabase(feedbackRows: unknown[] = [], teamRows: unknown[] = []) {
  vi.doMock("../../api/_lib/supabase", () => ({
    getSupabaseClient: () => ({
      from: (table: string) => {
        if (table === "feedback") {
          return { select: () => ({ order: () => ({ limit: async () => ({ data: feedbackRows, error: null }) }) }) };
        }
        if (table === "team_applications") {
          return { select: () => ({ order: () => ({ limit: async () => ({ data: teamRows, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }),
  }));
}

describe("api/admin/submissions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/supabase");
    if (ORIGINAL_ADMIN_KEY === undefined) delete process.env.GEOINTEL_ADMIN_KEY;
    else process.env.GEOINTEL_ADMIN_KEY = ORIGINAL_ADMIN_KEY;
  });

  it("rejects a GET with no admin key", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/submissions");

    const result = fakeReqRes({});
    result.req.method = "GET";
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(401);
  });

  it("rejects when the admin key isn't configured on the server", async () => {
    vi.resetModules();
    delete process.env.GEOINTEL_ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/submissions");

    const result = fakeReqRes({});
    result.req.method = "GET";
    result.req.headers["x-geointel-admin-key"] = "anything";
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(503);
    expect((result.body as { code: string }).code).toBe("NOT_CONFIGURED");
  });

  it("returns real feedback and team-application rows for a valid admin key", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase(
      [{ id: "f1", device_id: "d1", rating: 5, category: "praise", message: "Great!", ip_address: "1.2.3.4", user_agent: "TestAgent", created_at: "2026-09-01T00:00:00.000Z" }],
      [{ id: "t1", name: "Manoj", email: "m@example.com", interest: "engineering", message: null, ip_address: "5.6.7.8", user_agent: "TestAgent", created_at: "2026-09-01T00:00:00.000Z" }]
    );
    const { default: handler } = await import("../../api/_routes/admin/submissions");

    const result = fakeReqRes({});
    result.req.method = "GET";
    result.req.headers["x-geointel-admin-key"] = ADMIN_KEY;
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { feedback: Array<{ id: string }>; teamApplications: Array<{ id: string }> };
    expect(body.feedback).toHaveLength(1);
    expect(body.feedback[0]?.id).toBe("f1");
    expect(body.teamApplications).toHaveLength(1);
    expect(body.teamApplications[0]?.id).toBe("t1");
  });

  it("only accepts GET", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/submissions");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.headers["x-geointel-admin-key"] = ADMIN_KEY;
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(405);
  });

  // Security regression: this endpoint returns real visitor PII (feedback +
  // team-application rows, including recorded IP address and user agent)
  // behind the same shared admin key as maintenance mode, and previously had
  // no rate limit at all — unlimited attempts to guess GEOINTEL_ADMIN_KEY.
  it("rate-limits repeated requests from the same IP, including wrong-key guesses", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/submissions");

    let lastStatus = 200;
    for (let i = 0; i < 21; i++) {
      const result = fakeReqRes({});
      result.req.method = "GET";
      result.req.headers["x-geointel-admin-key"] = "guess-" + i;
      await handler(result.req, result.res);
      lastStatus = result.statusCode;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
