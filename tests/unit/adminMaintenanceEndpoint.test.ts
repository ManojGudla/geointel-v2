import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";

const ORIGINAL_ADMIN_KEY = process.env.GEOINTEL_ADMIN_KEY;
const ADMIN_KEY = "test-admin-key";

function mockSupabase(overrides: { selectData?: unknown; updateError?: unknown; auditRows?: unknown[] } = {}) {
  vi.doMock("../../api/_lib/supabase", () => ({
    getSupabaseClient: () => ({
      from: (table: string) => {
        if (table === "app_settings") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: overrides.selectData ?? null, error: null }) }) }),
            update: () => ({ eq: async () => ({ error: overrides.updateError ?? null }) }),
          };
        }
        if (table === "maintenance_audit_log") {
          return {
            select: () => ({ order: () => ({ limit: async () => ({ data: overrides.auditRows ?? [], error: null }) }) }),
            insert: async () => ({ error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }),
  }));
}

describe("api/admin/maintenance", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/supabase");
    if (ORIGINAL_ADMIN_KEY === undefined) delete process.env.GEOINTEL_ADMIN_KEY;
    else process.env.GEOINTEL_ADMIN_KEY = ORIGINAL_ADMIN_KEY;
  });

  it("GET without a key returns the public maintenance state only - no audit log, no key-validity flag", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase({ selectData: { maintenance_mode: false } });
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "GET";
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { maintenance: { enabled: boolean }; adminKeyValid?: boolean; auditLog?: unknown[] };
    expect(body.maintenance.enabled).toBe(false);
    expect(body.adminKeyValid).toBeUndefined();
    expect(body.auditLog).toBeUndefined();
  });

  /**
   * The security property, not merely a shape check.
   *
   * This endpoint used to answer "is this key correct?" for anyone who asked,
   * which handed an anonymous attacker a confirm oracle in front of the only
   * secret protecting every visitor's name, email, message and IP address -
   * guessing with instant feedback. A wrong key must now be byte-for-byte
   * indistinguishable from sending no key at all, so there is no signal to
   * optimise a guess against. Comparing the two whole response bodies is the
   * assertion that actually holds that line: it fails if anyone later adds a
   * field that differs between the two, which is exactly how such an oracle
   * would come back.
   */
  it("GET with a wrong key is indistinguishable from GET with no key", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase({ selectData: { maintenance_mode: false } });
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const anonymous = fakeReqRes({});
    anonymous.req.method = "GET";
    await handler(anonymous.req, anonymous.res);

    const wrongKey = fakeReqRes({});
    wrongKey.req.method = "GET";
    wrongKey.req.headers["x-geointel-admin-key"] = "wrong";
    await handler(wrongKey.req, wrongKey.res);

    expect(wrongKey.statusCode).toBe(anonymous.statusCode);
    expect(wrongKey.body).toEqual(anonymous.body);

    const body = wrongKey.body as { adminKeyValid?: boolean; auditLog?: unknown[] };
    expect(body.adminKeyValid).toBeUndefined();
    expect(body.auditLog).toBeUndefined();
  });

  it("GET with the correct key confirms validity and includes the audit log", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase({ selectData: { maintenance_mode: false }, auditRows: [{ id: "1", action: "enabled", admin_label: "Manoj" }] });
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "GET";
    result.req.headers["x-geointel-admin-key"] = ADMIN_KEY;
    await handler(result.req, result.res);

    const body = result.body as { adminKeyValid?: boolean; auditLog?: Array<{ admin_label: string }> };
    expect(body.adminKeyValid).toBe(true);
    expect(body.auditLog).toHaveLength(1);
    expect(body.auditLog?.[0]?.admin_label).toBe("Manoj");
  });

  it("POST is refused with 503 when no admin key is configured on the server at all", async () => {
    vi.resetModules();
    delete process.env.GEOINTEL_ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.body = { action: "enable" };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(503);
    expect((result.body as { code: string }).code).toBe("NOT_CONFIGURED");
  });

  it("POST is refused with 401 when the key is wrong", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.headers["x-geointel-admin-key"] = "nope";
    result.req.body = { action: "enable" };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(401);
    expect((result.body as { code: string }).code).toBe("UNAUTHORIZED");
  });

  it("POST enable with the correct key updates state and returns it as enabled", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    // After the update, getMaintenanceState() re-reads - return the
    // "now enabled" row to reflect what the update just did.
    mockSupabase({ selectData: { maintenance_mode: true, maintenance_type: "scheduled", maintenance_title: "Scheduled Maintenance" } });
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.headers["x-geointel-admin-key"] = ADMIN_KEY;
    result.req.body = { action: "enable", title: "Scheduled Maintenance", message: "Upgrading services." };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const body = result.body as { maintenance: { enabled: boolean; title: string } };
    expect(body.maintenance.enabled).toBe(true);
  });

  it("POST rejects an unknown action", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase();
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

    const result = fakeReqRes({});
    result.req.method = "POST";
    result.req.headers["x-geointel-admin-key"] = ADMIN_KEY;
    result.req.body = { action: "self-destruct" };
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(400);
  });

  // Security regression: this endpoint accepts a shared admin key and its
  // GET path even echoes back whether a given key was valid - without a
  // rate limit, that's an unlimited-attempts oracle for brute-forcing
  // GEOINTEL_ADMIN_KEY. Every other endpoint in this project rate-limits by
  // IP; this one now does too.
  it("rate-limits repeated requests from the same IP, including wrong-key guesses", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = ADMIN_KEY;
    mockSupabase({ selectData: { maintenance_mode: false } });
    const { default: handler } = await import("../../api/_routes/admin/maintenance");

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
