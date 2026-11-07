import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The funnel events that were defined but never sent until v3.2's audit
 * (docs/audit/TECHNICAL_ISSUES.md T-08). Each test drives the real code path
 * and reads what reached the dataLayer, with consent granted.
 */

interface TestWindow extends Window {
  dataLayer?: unknown[];
}
const w = globalThis as unknown as TestWindow;
const pushed = () => (w.dataLayer ?? []) as Array<Record<string, unknown>>;
const events = (name: string) => pushed().filter((e) => e.event === name);

vi.mock("@/services/apiClient", async (orig) => {
  const actual = await orig<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiPost: vi.fn(async (path: string) => {
      if (path === "/api/ai/copilot") return { answer: "Three hospitals.", sources: [], model: "test/model" };
      if (path === "/api/feedback") return { saved: true };
      throw new Error("unexpected " + path);
    }),
    apiGet: vi.fn(async () => ({ route: { distanceMeters: 1000, durationSeconds: 60, geometry: [] } })),
  };
});

beforeEach(() => {
  w.dataLayer = [];
  localStorage.clear();
  localStorage.setItem("manowj.consent.v1", "granted");
});

describe("funnel events", () => {
  it("counts a distance or area measurement when the tool is left, with the point count only", async () => {
    const { useMeasureStore } = await import("@/stores/measureStore");
    const m = useMeasureStore.getState();
    m.setMode("distance");
    m.addPoint([78.4, 17.4]);
    m.addPoint([78.5, 17.5]);
    useMeasureStore.getState().setMode("area");
    m.addPoint([78.4, 17.4]);
    m.addPoint([78.5, 17.5]);
    useMeasureStore.getState().clear(); // only 2 points: not an area, not counted
    m.addPoint([78.4, 17.4]);
    m.addPoint([78.5, 17.5]);
    m.addPoint([78.6, 17.4]);
    useMeasureStore.getState().setMode("off");

    expect(events("distance_measured")).toEqual([expect.objectContaining({ pointCount: 2 })]);
    expect(events("area_measured")).toEqual([expect.objectContaining({ pointCount: 3 })]);
    // No coordinates anywhere in what was sent.
    expect(JSON.stringify(pushed())).not.toMatch(/78\.|17\./);
  });

  it("counts layers switched on, not off", async () => {
    const { useLiveLayerStore } = await import("@/stores/liveLayerStore");
    useLiveLayerStore.getState().toggle("radar");
    useLiveLayerStore.getState().toggle("radar");
    expect(events("layer_opened")).toEqual([expect.objectContaining({ layer: "radar", kind: "live" })]);
  });

  it("counts a Copilot answer with its model, never the question", async () => {
    const { askCopilot } = await import("@/services/ai");
    await askCopilot("how many hospitals near my home at 12 Road No 5", {} as never);
    const [e] = events("ai_question_asked");
    expect(e).toMatchObject({ surface: "copilot", model: "test/model" });
    expect(JSON.stringify(pushed())).not.toMatch(/hospitals|Road/);
  });

  it("counts a submitted feedback with rating and category, never the message", async () => {
    const { submitFeedback } = await import("@/services/feedback");
    await submitFeedback({ rating: 4, category: "bug", message: "my email is a@b.com" });
    expect(events("feedback_submitted")).toEqual([expect.objectContaining({ rating: 4, category: "bug" })]);
    expect(JSON.stringify(pushed())).not.toMatch(/a@b\.com/);
  });

  it("counts a route with its mode", async () => {
    const { fetchRoute } = await import("@/services/route");
    await fetchRoute({ lat: 17.4, lon: 78.4 }, { lat: 17.5, lon: 78.5 }, "walk" as never);
    expect(events("route_started")).toEqual([expect.objectContaining({ mode: "walk" })]);
    expect(JSON.stringify(pushed())).not.toMatch(/78\.|17\./);
  });
});
