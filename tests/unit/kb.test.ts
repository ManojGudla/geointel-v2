import { describe, expect, it, vi, afterEach } from "vitest";

describe("api/_lib/kb", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../api/_lib/supabase");
    vi.useRealTimers();
  });

  it("returns [] when Supabase isn't configured", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({ getSupabaseClient: () => null }));
    const { searchKnowledgeBase } = await import("../../api/_lib/kb");
    expect(await searchKnowledgeBase("parking rules")).toEqual([]);
  });

  it("returns [] for a blank query", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({ getSupabaseClient: () => ({}) }));
    const { searchKnowledgeBase } = await import("../../api/_lib/kb");
    expect(await searchKnowledgeBase("   ")).toEqual([]);
  });

  it("returns real hits from a matching Supabase search", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            textSearch: () => ({
              limit: async () => ({
                data: [{ title: "Parking rules", content: "Street parking is free on Sundays.", tags: ["parking"] }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { searchKnowledgeBase } = await import("../../api/_lib/kb");
    const hits = await searchKnowledgeBase("parking rules");
    expect(hits).toEqual([{ title: "Parking rules", content: "Street parking is free on Sundays.", tags: ["parking"] }]);
  });

  it("returns [] instead of throwing when Supabase reports an error", async () => {
    vi.resetModules();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            textSearch: () => ({
              limit: async () => ({ data: null, error: { message: "relation does not exist" } }),
            }),
          }),
        }),
      }),
    }));
    const { searchKnowledgeBase } = await import("../../api/_lib/kb");
    expect(await searchKnowledgeBase("parking rules")).toEqual([]);
  });

  // Same real bug as api/_lib/maintenance.ts's hang test: this Supabase
  // call used to have no timeout, so a slow/unreachable Supabase project
  // could hang an entire Copilot/agent request regardless of how fast
  // OpenRouter itself responded.
  it("returns [] instead of hanging when Supabase never responds", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock("../../api/_lib/supabase", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            textSearch: () => ({
              limit: () => new Promise(() => {}),
            }),
          }),
        }),
      }),
    }));
    const { searchKnowledgeBase } = await import("../../api/_lib/kb");

    const hitsPromise = searchKnowledgeBase("parking rules");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await hitsPromise).toEqual([]);
  });
});
