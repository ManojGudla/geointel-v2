import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import { GROUNDING_RULES } from "../../api/_lib/aiGrounding";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";

/**
 * What the Copilot is told, and what the person is told the answer rests on.
 *
 * Gaps closed here: no rule against claims about zoning, ownership, value or
 * occupancy; interpretation indistinguishable from data; questions about
 * other places answered from memory; and - the big one - facts taken from
 * the browser and repeated as verified, officials included. The Copilot now
 * fetches its own evidence (MOCK providers below), so a browser-sent fact
 * never reaches the prompt.
 */

const routes = vi.hoisted(() => ({
  answers: {} as Record<string, { status: number; body: unknown }>,
  calls: [] as string[],
}));

function stand(name: string) {
  return {
    default: async (_req: ApiRequest, res: ApiResponse) => {
      routes.calls.push(name);
      const a = routes.answers[name] ?? { status: 503, body: { ok: false, error: `${name} unavailable` } };
      res.status(a.status).json(a.body);
    },
  };
}

vi.mock("../../api/_routes/reverse-geocode", () => stand("reverse-geocode"));
vi.mock("../../api/_routes/gis", () => stand("gis"));
vi.mock("../../api/_routes/weather", () => stand("weather"));
vi.mock("../../api/_routes/nearby", () => stand("nearby"));
vi.mock("../../api/_routes/route", () => stand("route"));
vi.mock("../../api/_routes/geocode", () => stand("geocode"));
vi.mock("../../api/_routes/population", () => stand("population"));
vi.mock("../../api/_routes/officials", () => stand("officials"));

function capture(reply = "Answer.") {
  const seen: { system?: string } = {};
  vi.doMock("../../api/_lib/ai", () => ({
    getAiCompletion: vi.fn(async (messages: Array<{ role: string; content: string }>) => {
      seen.system = messages.find((m) => m.role === "system")?.content;
      return { ok: true, content: reply, model: "test-model" };
    }),
  }));
  vi.doMock("../../api/_lib/kb", () => ({
    searchKnowledgeBase: vi.fn(async () => [{ title: "How property classification works", content: "..." }]),
  }));
  return seen;
}

const AT = "2026-11-25T07:30:00.000Z";
const WAVE_ROCK = { lat: -32.4436, lon: 118.8975 };

/** What a page from before the change sent, including a forged official. */
const BROWSER_CONTEXT = {
  locationName: "Wave Rock",
  weather: { temperatureC: 99, condition: "Snow" },
  officials: [{ level: "city", role: "Mayor", name: "Forged Person", status: "verified" }],
};

async function ask(question: string, body: Record<string, unknown> = {}) {
  const { default: handler } = await import("../../api/_routes/ai/copilot");
  const call = fakeReqRes({});
  call.req.method = "POST";
  call.req.body = { question, anchor: WAVE_ROCK, context: BROWSER_CONTEXT, ...body };
  await handler(call.req, call.res);
  return call;
}

beforeEach(() => {
  routes.calls = [];
  routes.answers = {
    "reverse-geocode": { status: 200, body: { ok: true, location: { name: "Wave Rock", displayName: "Wave Rock, Hyden", source: "OpenStreetMap / Nominatim", address: { city: "Hyden", state: "Western Australia", country: "Australia", countryCode: "AU" } } } },
    weather: { status: 200, body: { ok: true, weather: { temperatureC: 31, condition: "Clear", source: "Open-Meteo", fetchedAt: AT } } },
    nearby: { status: 200, body: { ok: true, radiusMeters: 1500, widened: true, fetchedAt: AT, items: [{ name: "Wave Rock Cafe", category: "cafes", distanceMeters: 300 }] } },
  };
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../api/_lib/ai");
  vi.doUnmock("../../api/_lib/kb");
});

describe("the grounding rules", () => {
  it("forbid the claims OpenStreetMap cannot support", () => {
    for (const word of ["zoning", "ownership", "value", "occupied", "vacant"]) expect(GROUNDING_RULES).toContain(word);
  });

  it("require interpretation to be marked as interpretation", () => {
    expect(GROUNDING_RULES).toMatch(/this suggests|likely/);
  });

  it("refuse questions about places with no data rather than answering from memory", () => {
    expect(GROUNDING_RULES).toMatch(/any other place/);
  });
});

describe("what the Copilot is given, and what its answer says it was based on (mock providers)", () => {
  it("sends the rules with the server's own evidence, and names the real providers", async () => {
    const seen = capture();
    const call = await ask("Is this a good place for a cafe?");
    expect(call.statusCode).toBe(200);
    expect(seen.system).toContain(GROUNDING_RULES);
    expect(seen.system).toContain("Cafes within 1.5 km | 1 (closest: Wave Rock Cafe, 300 m)");
    expect(seen.system).toContain("The search was widened because little was mapped closer.");
    const { sources } = call.body as { sources: string[] };
    expect(sources).toContain("OpenStreetMap via Overpass");
    expect(sources).toContain("Open-Meteo");
    expect(sources).toContain("Help article: How property classification works");
  });

  it("never passes on facts the browser sent, however they are labelled", async () => {
    const seen = capture();
    await ask("What's the weather and who is the mayor here?");
    expect(seen.system).not.toContain("Forged Person");
    expect(seen.system).not.toContain("99");
    expect(seen.system).toContain("Temperature now | 31 °C");
  });

  it("looks up office holders itself, only when the question is about them", async () => {
    routes.answers.officials = {
      status: 200,
      body: { ok: true, fetchedAt: AT, officials: [{ levelLabel: "Western Australia", role: "Premier", name: "Real Name", status: "verified", since: "2023", sourceUrl: "https://www.wikidata.org/wiki/Q1", sourceLabel: "Wikidata" }] },
    };
    capture();
    await ask("Is it hot here?");
    expect(routes.calls).not.toContain("officials");

    vi.resetModules();
    const seen = capture();
    await ask("Who is the premier... I mean who governs this state?");
    expect(routes.calls).toContain("officials");
    expect(seen.system).toContain("Western Australia Premier | Real Name | retrieved | Wikidata");
  });

  it("fetches nothing for a question that is not about the place", async () => {
    capture();
    const call = await ask("who built this app?");
    expect(routes.calls).toEqual([]);
    expect((call.body as { sources: string[] }).sources).toEqual([]);
  });

  it("still answers a page from before the change, without any place facts", async () => {
    const seen = capture();
    const call = await ask("What's the weather here?", { anchor: undefined });
    expect(call.statusCode).toBe(200);
    expect(routes.calls).toEqual([]);
    expect(seen.system).toContain("No location is currently selected in the app.");
    expect(seen.system).not.toContain("99");
  });

  it("drops a sentence with a number from nowhere, but keeps numbers the person wrote", async () => {
    capture("It is 31 °C at Wave Rock [E3]. Within the 5 km you asked about, rent is around 1,200 dollars.");
    const call = await ask("What is it like within 5 km of here?");
    const body = call.body as { answer: string; removedSentences: number };
    expect(body.removedSentences).toBe(1);
    expect(body.answer).toBe("It is 31 °C at Wave Rock.");
  });
});
