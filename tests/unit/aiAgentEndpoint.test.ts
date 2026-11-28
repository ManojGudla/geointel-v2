import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";
import type { AgentResult } from "../../src/types/ai";

/**
 * The agent endpoint, end to end, with the providers and the model replaced
 * (MOCK TESTS: nothing here proves a provider or a model is right).
 *
 * What they pin down: the browser can say only where to look; every fact in
 * the prompt comes from the server's own routes; an agent with nothing to
 * explain does not spend a model request; and a sentence with an invented
 * number never reaches the reader.
 */
const state = vi.hoisted(() => ({
  answers: {} as Record<string, { status: number; body: unknown }>,
  prompt: undefined as string | undefined,
  modelCalls: 0,
  reply: "Summary.",
  /** When set, the model "fails" with this message, as a busy free tier does. */
  fail: null as string | null,
}));

function stand(name: string) {
  return {
    default: async (_req: ApiRequest, res: ApiResponse) => {
      const a = state.answers[name] ?? { status: 503, body: { ok: false, error: `${name} unavailable` } };
      res.status(a.status).json(a.body);
    },
  };
}

vi.mock("../../api/_routes/reverse-geocode", () => stand("reverse-geocode"));
vi.mock("../../api/_routes/gis", () => stand("gis"));
vi.mock("../../api/_routes/property", () => stand("property"));
vi.mock("../../api/_routes/weather", () => stand("weather"));
vi.mock("../../api/_routes/nearby", () => stand("nearby"));
vi.mock("../../api/_routes/route", () => stand("route"));
vi.mock("../../api/_routes/geocode", () => stand("geocode"));
vi.mock("../../api/_routes/population", () => stand("population"));
vi.mock("../../api/_lib/ai", () => ({
  getAiCompletion: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
    state.modelCalls += 1;
    state.prompt = messages.find((m) => m.role === "system")?.content;
    if (state.fail) return { ok: false, error: state.fail, reason: "busy" };
    return { ok: true, content: state.reply, model: "test-model" };
  }),
}));

import handler, { resetAgentAnswers } from "../../api/_routes/ai/agent";

const AT = "2026-11-25T07:30:00.000Z";
const PLACE = { status: 200, body: { ok: true, location: { name: "Eiffel Tower", displayName: "Eiffel Tower, Paris", source: "OpenStreetMap / Nominatim", address: { city: "Paris", country: "France" } } } };
const GIS = {
  status: 200,
  body: {
    ok: true,
    evidence: {
      trust: "verified",
      radiusMeters: 250,
      counts: { buildings: 30, shops: 6, offices: 2, residential: 4, industrial: 0, institutional: 1, amenities: 14, tourism: 9, transport: 5 },
      scores: { commercial: 30, residential: 8, industrial: 0, institutional: 3, landmark: 60, transport: 10 },
      subject: { name: "Eiffel Tower", kind: "attraction", category: "landmark", distanceMeters: 4 },
      features: [],
      source: "OpenStreetMap / Overpass",
      fetchedAt: AT,
      incomplete: false,
    },
  },
};
const ROUTE = { status: 200, body: { ok: true, route: { mode: "car", distanceMeters: 12400, durationSeconds: 1860, alternatives: 1, source: "OSRM" } } };
const EIFFEL = { lat: 48.8584, lon: 2.2945 };

async function post(body: unknown) {
  const r = fakeReqRes({});
  r.req.method = "POST";
  r.req.body = body;
  (r.req.headers as Record<string, string>)["x-forwarded-for"] = `198.51.100.${Math.floor(Math.random() * 200)}`;
  await handler(r.req, r.res);
  return r;
}

const resultOf = (r: { body: unknown }) => (r.body as { result: AgentResult }).result;

describe("api/ai/agent", () => {
  beforeEach(() => {
    resetAgentAnswers();
    state.answers = { "reverse-geocode": PLACE, gis: GIS, population: { status: 200, body: { ok: true, population: null } } };
    state.prompt = undefined;
    state.modelCalls = 0;
    state.reply = "Summary.";
    state.fail = null;
  });

  it("refuses a request that sends facts but no anchor (a page from before the change)", async () => {
    const r = await post({ kind: "gis", context: { locationName: "Eiffel Tower", gis: { counts: { shops: 3 } } } });
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("ANCHOR_REQUIRED");
    expect(state.modelCalls).toBe(0);
  });

  it("never shows the model facts the browser sent, including 'verified' officials", async () => {
    await post({
      kind: "gis",
      anchor: EIFFEL,
      context: { officials: [{ level: "city", role: "Mayor", name: "Forged Person", status: "verified" }], gis: { counts: { shops: 999 } } },
    });
    expect(state.prompt).toBeDefined();
    expect(state.prompt).not.toContain("Forged Person");
    // Whole number only: the prompt's random fence can contain these digits.
    expect(state.prompt).not.toMatch(/\b999\b/);
    expect(state.prompt).toContain("Mapped shops within 250 m | 6 | retrieved | OpenStreetMap via Overpass | as of 25 Nov 2026, 07:30 UTC");
  });

  it("sends the shared grounding rules with the evidence", async () => {
    const { GROUNDING_RULES } = await import("../../api/_lib/aiGrounding");
    await post({ kind: "property", anchor: EIFFEL });
    expect(state.prompt).toContain(GROUNDING_RULES);
    expect(state.prompt).toContain("Property classification |");
  });

  it("does not mention routes at all to an agent that has nothing to do with them", async () => {
    await post({ kind: "gis", anchor: EIFFEL });
    expect(state.prompt).not.toMatch(/route/i);
  });

  it("tells the navigation agent's reader there is no route, without spending a model request", async () => {
    const r = await post({ kind: "navigation", anchor: EIFFEL });
    const result = resultOf(r);
    expect(state.modelCalls).toBe(0);
    expect(result.summary).toBe("No route is planned yet. Choose a start and an end in Directions, then run this agent again.");
    expect(result.confidence?.level).toBe("insufficient");
    expect(result.evidence?.find((e) => e.label === "Route")?.value).toBe("No route planned");
  });

  it("gives the navigation agent the routing provider's own distance and time", async () => {
    state.answers.route = ROUTE;
    await post({ kind: "navigation", anchor: { ...EIFFEL, route: { fromLat: 48.8584, fromLon: 2.2945, toLat: 48.8606, toLon: 2.3376, mode: "car" } } });
    expect(state.prompt).toContain("Route distance | 12.4 km | retrieved | OSRM");
    expect(state.prompt).toContain("Route time | about 31 min");
  });

  it("removes a sentence with an invented number before anyone sees it", async () => {
    state.reply = "The Eiffel Tower is mapped right at the point [E1, E14]. Rent nearby is about 3,000 euros a month.";
    const result = resultOf(await post({ kind: "gis", anchor: EIFFEL }));
    expect(result.removedSentences).toBe(1);
    expect(result.summary).not.toMatch(/euros/);
    expect(result.steps?.at(-1)).toEqual({ step: "Checking every number against the evidence", status: "partial", ms: 0 });
  });

  it("answers with the brief's own sentence when nothing the model wrote survives the check", async () => {
    state.reply = "There are 12 museums within 250 m.";
    const result = resultOf(await post({ kind: "gis", anchor: EIFFEL }));
    expect(result.summary).toBe("Insufficient verified data to provide a reliable conclusion.");
    expect(result.findings).toEqual([]);
  });

  it("keeps each finding's citations, and only ones that exist", async () => {
    state.reply = "Tourism places dominate here, with 9 mapped within 250 m [E10, E99].";
    const result = resultOf(await post({ kind: "gis", anchor: EIFFEL }));
    const cited = result.findings![0]!.evidenceIds;
    expect(cited).toEqual(["E10"]);
    expect(result.evidence!.find((e) => e.id === "E10")!.label).toBe("Mapped tourism places within 250 m");
  });

  it("returns the evidence, confidence, sources and the real steps with the answer", async () => {
    const result = resultOf(await post({ kind: "gis", anchor: EIFFEL }));
    expect(result.confidence).toEqual({ level: "high", reason: "Every source this agent uses answered in full." });
    // The population lookup found no figure, so Wikidata is not named as a source.
    expect(result.sources).toEqual(["OpenStreetMap / Nominatim", "OpenStreetMap via Overpass", "maNOWj, from OpenStreetMap features"]);
    expect(result.steps!.map((s) => s.step)).toEqual([
      "Naming the place (OpenStreetMap)",
      "Counting mapped features (OpenStreetMap via Overpass)",
      "Looking up population (Wikidata)",
      "Writing the explanation (AI model)",
      "Checking every number against the evidence",
    ]);
    expect(result.model).toBe("test-model");
  });

  it("still shows the checked facts when the AI cannot write, and says why", async () => {
    // Reported 25 November 2026: every card showed only "busy" although the
    // evidence had already been fetched and checked.
    state.fail = "The free AI models are busy right now. Please try again in a minute.";
    const r = await post({ kind: "gis", anchor: EIFFEL });
    const result = resultOf(r);
    expect(r.statusCode).toBe(200);
    expect(result.aiUnavailable).toBe(state.fail);
    expect(result.summary).toBe(`${state.fail} The facts this agent checked are listed below.`);
    expect(result.findings).toEqual([]);
    expect(result.model).toBe("none: the AI could not answer this time");
    // The evidence and its confidence are exactly what a written answer would have had.
    expect(result.evidence!.find((e) => e.label === "Mapped shops within 250 m")!.value).toBe("6");
    expect(result.confidence?.level).toBe("high");
    expect(result.steps!.at(-1)).toEqual(expect.objectContaining({ step: "Writing the explanation (AI model)", status: "failed" }));
  });

  it("rejects an unknown agent kind", async () => {
    const r = await post({ kind: "astrology", anchor: EIFFEL });
    expect(r.statusCode).toBe(400);
  });

  it("refuses coordinates off the globe", async () => {
    const r = await post({ kind: "gis", anchor: { lat: 95, lon: 2.29 } });
    expect(r.statusCode).toBe(400);
  });

  it("only accepts POST", async () => {
    const r = fakeReqRes({});
    r.req.method = "GET";
    await handler(r.req, r.res);
    expect(r.statusCode).toBe(405);
  });
});
