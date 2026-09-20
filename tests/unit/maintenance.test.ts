import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";

const ORIGINAL_ADMIN_KEY = process.env.GEOINTEL_ADMIN_KEY;

describe("api/_lib/maintenance", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/supabase");
    vi.useRealTimers();
    if (ORIGINAL_ADMIN_KEY === undefined) delete process.env.GEOINTEL_ADMIN_KEY;
    else process.env.GEOINTEL_ADMIN_KEY = ORIGINAL_ADMIN_KEY;
  });

  it("getMaintenanceState falls back to 'not in maintenance' when Supabase isn't configured", async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getMaintenanceState } = await import("../../api/_lib/maintenance");
    const state = await getMaintenanceState();
    expect(state.enabled).toBe(false);
  });

  it("getMaintenanceState maps a real app_settings row, including a custom message", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  maintenance_mode: true,
                  maintenance_type: "emergency",
                  maintenance_title: "Emergency Maintenance",
                  maintenance_message: "Fixing a critical issue.",
                  maintenance_estimated_end: "~15 minutes",
                  maintenance_support_info: "support@example.com",
                  maintenance_show_status: true,
                  maintenance_show_countdown: false,
                  maintenance_started_at: "2026-09-01T02:00:00.000Z",
                  updated_at: "2026-09-01T02:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { getMaintenanceState } = await import("../../api/_lib/maintenance");
    const state = await getMaintenanceState();
    expect(state).toMatchObject({
      enabled: true,
      type: "emergency",
      title: "Emergency Maintenance",
      message: "Fixing a critical issue.",
      estimatedEnd: "~15 minutes",
    });
  });

  // The actual bug behind "every feature hangs for 5+ minutes, then works":
  // this Supabase read used to have no timeout, so withMaintenanceGuard
  // (which wraps nearly every handler - nearby, gis, weather, officials,
  // both AI endpoints) would wait on it indefinitely whenever Supabase was
  // slow to answer or unreachable (a paused free-tier project, e.g.).
  it("getMaintenanceState falls back to 'not in maintenance' instead of hanging when Supabase never responds", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              // Simulates an unreachable/slow-to-wake Supabase project: the
              // query never settles on its own.
              maybeSingle: () => new Promise(() => {}),
            }),
          }),
        }),
      }),
    }));
    const { getMaintenanceState } = await import("../../api/_lib/maintenance");

    const statePromise = getMaintenanceState();
    await vi.advanceTimersByTimeAsync(4_000);
    const state = await statePromise;

    expect(state.enabled).toBe(false);
  });

  it("withMaintenanceGuard blocks a normal request with a real 503 when maintenance is on", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { maintenance_mode: true, maintenance_message: "Down for upgrades." },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { withMaintenanceGuard } = await import("../../api/_lib/maintenance");
    const inner = vi.fn(async () => {});
    const guarded = withMaintenanceGuard(inner);

    const result = fakeReqRes({});
    await guarded(result.req, result.res);

    expect(result.statusCode).toBe(503);
    expect((result.body as { code: string }).code).toBe("MAINTENANCE");
    expect(inner).not.toHaveBeenCalled();
  });

  it("withMaintenanceGuard lets a valid admin request through even while maintenance is on", async () => {
    vi.resetModules();
    process.env.GEOINTEL_ADMIN_KEY = "the-real-key";
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { maintenance_mode: true }, error: null }),
            }),
          }),
        }),
      }),
    }));
    const { withMaintenanceGuard } = await import("../../api/_lib/maintenance");
    const inner = vi.fn(async (_req, res) => res.status(200).json({ ok: true }));
    const guarded = withMaintenanceGuard(inner);

    const result = fakeReqRes({});
    result.req.headers["x-geointel-admin-key"] = "the-real-key";
    await guarded(result.req, result.res);

    expect(inner).toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
  });

  it("withMaintenanceGuard passes normal requests through untouched when maintenance is off", async () => {
    vi.resetModules();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { withMaintenanceGuard } = await import("../../api/_lib/maintenance");
    const inner = vi.fn(async (_req, res) => res.status(200).json({ ok: true, data: 42 }));
    const guarded = withMaintenanceGuard(inner);

    const result = fakeReqRes({});
    await guarded(result.req, result.res);

    expect(inner).toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
  });
});
