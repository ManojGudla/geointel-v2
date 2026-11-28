import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";
import type { TeamResult } from "../../src/types/ai";
import { planRequest } from "../../api/_lib/evidence/planner";
import { splitSections } from "../../api/_routes/ai/ask";

/**
 * Several agents on one request (/api/ai/ask). The planner is plain word
 * rules, tested directly. The endpoint runs with MOCK providers and a MOCK
 * model: these check the orchestration, not any provider's data.
 */
const HITEC = { lat: 17.4474, lon: 78.3762 };

describe("which agents a request needs", () => {
  it("brings in Search, GIS, Property and Navigation for the family-home-and-hospital request", () => {
    const plan = planRequest("Evaluate this location for a family home and plan a route to the nearest hospital.", { ...HITEC, query: "HITEC City" });
    expect(plan.agents).toEqual(["search", "gis", "property", "navigation"]);
    expect(plan.nearest).toEqual({ category: "hospitals", label: "hospital or clinic" });
    expect(plan.tools).toEqual(["place", "search", "gis", "property", "population", "nearby", "route"]);
    expect(plan.understood).toBe("Asked to check the search match, analyse what is mapped around the place, assess the property and route to the nearest hospital or clinic.");
  });

  it("reads a radius the request asks for, and snaps it to one the GIS route accepts", () => {
    expect(planRequest("Analyse the area within 2 km of this location", HITEC).radiusMeters).toBe(2000);
    expect(planRequest("what is within 600 m", HITEC).radiusMeters).toBe(500);
  });

  it("treats 'plan a route' as a route, not a trip", () => {
    expect(planRequest("plan a route to the nearest school", HITEC).agents).toEqual(["navigation"]);
  });

  it("recognises a day plan and a visit", () => {
    expect(planRequest("Plan a day here with food and parks", HITEC).agents).toEqual(["makeMyTrip"]);
    expect(planRequest("What's the weather like for a visit?", HITEC).agents).toEqual(["travel"]);
  });

  it("says so when it recognised nothing, and falls back to a general look", () => {
    const plan = planRequest("hmm", HITEC);
    expect(plan.agents).toEqual(["gis", "property"]);
    expect(plan.understood).toMatch(/^No specific question was recognised/);
  });
});

describe("splitting the report into agent sections", () => {
  it("takes each agent's text after its tag, in any order", () => {
    const parts = splitSections("GIS: Shops dominate [E4].\nNAVIGATION: The route is 2.1 km [E9].\n**PROPERTY**: Commercial [E7].", ["gis", "property", "navigation"]);
    expect(parts.get("gis")).toBe("Shops dominate [E4].");
    expect(parts.get("property")).toBe("Commercial [E7].");
    expect(parts.get("navigation")).toBe("The route is 2.1 km [E9].");
  });

  it("ignores tags for agents that were not asked", () => {
    expect(splitSections("TRAVEL: Sunny.\nGIS: Busy.", ["gis"]).has("travel" as never)).toBe(false);
  });
});

const state = vi.hoisted(() => ({
  answers: {} as Record<string, { status: number; body: unknown }>,
  calls: [] as Array<{ name: string; query: Record<string, string> }>,
  prompt: "",
  modelCalls: 0,
  reply: "",
  /** When set, the model "fails" with this message, as a busy free tier does. */
  fail: null as string | null,
}));

function stand(name: string) {
  return {
    default: async (req: ApiRequest, res: ApiResponse) => {
      state.calls.push({ name, query: req.query as Record<string, string> });
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
vi.mock("../../api/_routes/officials", () => stand("officials"));
vi.mock("../../api/_lib/ai", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAiCompletion: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
    state.modelCalls += 1;
    state.prompt = messages.find((m) => m.role === "system")?.content ?? "";
    if (state.fail) return { ok: false, error: state.fail, reason: "busy" };
    return { ok: true, content: state.reply, model: "test-model" };
  }),
}));

import askHandler from "../../api/_routes/ai/ask";

const AT = "2026-11-25T07:30:00.000Z";

function fixtures() {
  return {
    "reverse-geocode": { status: 200, body: { ok: true, location: { name: "HITEC City", displayName: "HITEC City, Hyderabad", source: "OpenStreetMap / Nominatim", address: { city: "Hyderabad", state: "Telangana", country: "India", countryCode: "IN" } } } },
    geocode: { status: 200, body: { ok: true, source: "OpenStreetMap / Nominatim", results: [{ name: "HITEC City", displayName: "HITEC City, Hyderabad", lat: 17.4474, lon: 78.3762 }] } },
    gis: {
      status: 200,
      body: {
        ok: true,
        evidence: {
          trust: "verified",
          radiusMeters: 250,
          counts: { buildings: 22, shops: 9, offices: 14, residential: 3, industrial: 0, institutional: 1, amenities: 8, tourism: 0, transport: 3 },
          scores: { commercial: 70, residential: 6, industrial: 0, institutional: 3, landmark: 0, transport: 6 },
          subject: null,
          features: [],
          source: "OpenStreetMap / Overpass",
          fetchedAt: AT,
          incomplete: false,
        },
      },
    },
    population: { status: 200, body: { ok: true, population: null } },
    nearby: {
      status: 200,
      body: {
        ok: true,
        radiusMeters: 1000,
        fetchedAt: AT,
        items: [
          { name: "Care Clinic", category: "hospitals", distanceMeters: 640, lat: 17.452, lon: 78.379 },
          { name: "Metro Pharmacy", category: "pharmacies", distanceMeters: 200, lat: 17.448, lon: 78.377 },
        ],
      },
    },
    route: { status: 200, body: { ok: true, route: { mode: "car", distanceMeters: 1900, durationSeconds: 300, alternatives: 0, source: "OSRM" } } },
  };
}

async function ask(request: string, anchor: unknown = { ...HITEC, query: "HITEC City" }) {
  const r = fakeReqRes({});
  r.req.method = "POST";
  r.req.body = { request, anchor };
  (r.req.headers as Record<string, string>)["x-forwarded-for"] = `192.0.2.${Math.floor(Math.random() * 200)}`;
  await askHandler(r.req, r.res);
  return r;
}

const resultOf = (r: { body: unknown }) => (r.body as { result: TeamResult }).result;

describe("the agents working together on one request (mock providers and model)", () => {
  beforeEach(() => {
    state.answers = fixtures();
    state.calls = [];
    state.prompt = "";
    state.modelCalls = 0;
    state.reply = "";
    state.fail = null;
  });

  it("finds the nearest hospital from the nearby places, routes to it, and returns the destination", async () => {
    state.reply = "SEARCH: The selected place is the search's best match [E4].\nGIS: Offices dominate here, with 14 mapped within 250 m [E8].\nPROPERTY: It reads as Commercial [E15].\nNAVIGATION: The nearest hospital or clinic is Care Clinic [E19], 1.9 km by road [E21].";
    const result = resultOf(await ask("Evaluate this location for a family home and plan a route to the nearest hospital."));

    const routeCall = state.calls.find((c) => c.name === "route")!;
    expect(routeCall.query).toEqual({ fromLat: "17.4474", fromLon: "78.3762", toLat: "17.452", toLon: "78.379", mode: "car" });
    expect(result.route).toEqual({ name: "Care Clinic", lat: 17.452, lon: 78.379, mode: "car" });
    expect(result.evidence.find((e) => e.label === "Nearest hospital or clinic")).toMatchObject({ value: "Care Clinic, 640 m away in a straight line", kind: "computed" });
    expect(result.agents).toEqual(["search", "gis", "property", "navigation"]);
  });

  it("asks each source once, even when several agents use it", async () => {
    state.reply = "GIS: Busy.";
    await ask("Evaluate this location for a family home and plan a route to the nearest hospital.");
    const count = (name: string) => state.calls.filter((c) => c.name === name).length;
    expect(count("gis")).toBe(1);
    expect(count("nearby")).toBe(1);
    expect(count("reverse-geocode")).toBe(1);
    expect(state.modelCalls).toBe(1);
  });

  it("attributes each finding to the agent that wrote it, and checks each section's numbers", async () => {
    state.reply = "GIS: Offices dominate, with 14 mapped within 250 m [E8].\nPROPERTY: It reads as Commercial [E15]. Flats here cost 90 lakh.";
    const result = resultOf(await ask("Evaluate this property", HITEC));
    const gis = result.sections.find((s) => s.agent === "gis")!;
    const property = result.sections.find((s) => s.agent === "property")!;
    expect(gis.findings).toEqual([{ text: "Offices dominate, with 14 mapped within 250 m.", evidenceIds: ["E8"] }]);
    expect(property.summary).toBe("It reads as Commercial.");
    expect(result.removedSentences).toBe(1);
  });

  it("returns a timeline of real steps only, in order", async () => {
    state.reply = "GIS: Busy.\nPROPERTY: Commercial.";
    const result = resultOf(await ask("Evaluate this property", HITEC));
    expect(result.steps.map((s) => s.step)).toEqual([
      "Understanding the request: 2 agents chosen",
      "Naming the place (OpenStreetMap)",
      "Counting mapped features (OpenStreetMap via Overpass)",
      "Classifying the property from that evidence",
      "Looking up population (Wikidata)",
      "Verifying the evidence: 2 of 2 agents have enough to answer",
      "Writing the report (AI model, one request for all agents)",
      "Checking every number against the evidence",
    ]);
  });

  it("does not ask the model when no agent has enough evidence", async () => {
    state.answers = { "reverse-geocode": fixtures()["reverse-geocode"] };
    const result = resultOf(await ask("plan a route to the nearest hospital", HITEC));
    expect(state.modelCalls).toBe(0);
    expect(result.sections[0]!.confidence.level).toBe("insufficient");
    expect(result.sections[0]!.summary).toMatch(/^Insufficient verified data to provide a reliable conclusion\./);
  });

  it("gives a missing section the brief's sentence rather than inventing one", async () => {
    state.reply = "GIS: Offices dominate [E8].";
    const result = resultOf(await ask("Evaluate this property", HITEC));
    expect(result.sections.find((s) => s.agent === "property")!.summary).toBe("Insufficient verified data to provide a reliable conclusion.");
  });

  it("still returns the checked facts and the route when the AI cannot write", async () => {
    state.fail = "Ask maNOWj has used today's free AI allowance. It resets at midnight UTC (5:30 AM India time).";
    const r = await ask("Is this good for a family home? Route to the nearest hospital", HITEC);
    const result = resultOf(r);
    expect(r.statusCode).toBe(200);
    expect(result.aiUnavailable).toBe(state.fail);
    expect(result.model).toBe("none: the AI could not answer this time");
    expect(result.evidence.length).toBeGreaterThan(0);
    // The nearest hospital was found from the evidence, not by the model, so the route still works.
    expect(result.route).toEqual({ name: "Care Clinic", lat: 17.452, lon: 78.379, mode: "car" });
    for (const section of result.sections) {
      expect(section.findings).toEqual([]);
      expect(section.summary).toBe("Not written this time, because the AI could not answer. This agent's facts are in the evidence list.");
    }
  });

  it("needs a request and a place", async () => {
    expect((await ask("")).statusCode).toBe(400);
    const r = await ask("analyse this", null);
    expect(r.statusCode).toBe(400);
    expect((r.body as { code: string }).code).toBe("ANCHOR_REQUIRED");
  });
});
