import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import { isAboutThePlace } from "../../api/_lib/aiGrounding";

/**
 * "Who is his future wife?" was answered with "Based on: OpenStreetMap
 * Nominatim, Overpass, Open-Meteo, Wikidata" underneath. None of those were
 * used, so naming them was a false citation. Sources are now given only for
 * questions about the place.
 */

describe("isAboutThePlace", () => {
  it.each(["who is his future wife", "Who built this app?", "When is Manoj's birthday?", "hi", "Thanks!", "good morning", "who is the co-founder", "मनोज कौन है?", "మనోజ్ ఎవరు?"])(
    "treats %j as not about the place",
    (q) => expect(isAboutThePlace(q)).toBe(false)
  );

  it.each([
    "What kind of area is Greater London?",
    "What's within 250 m of here?",
    "Is it safe to walk here at night?",
    "Who is the mayor?",
    "Did Manoj map the schools near here?",
    "how many cafes",
  ])("treats %j as about the place", (q) => expect(isAboutThePlace(q)).toBe(true));
});

const OTHER_ROUTES = [
  "../../api/_routes/reverse-geocode",
  "../../api/_routes/gis",
  "../../api/_routes/nearby",
  "../../api/_routes/route",
  "../../api/_routes/geocode",
  "../../api/_routes/population",
  "../../api/_routes/officials",
];

async function down(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(503).json({ ok: false, error: "Stubbed: provider down." });
}

async function ask(question: string) {
  vi.doMock("../../api/_lib/ai", () => ({
    getAiCompletion: vi.fn(async () => ({ ok: true, content: "Answer.", model: "test-model" })),
  }));
  vi.doMock("../../api/_lib/kb", () => ({ searchKnowledgeBase: vi.fn(async () => [{ title: "Using the map", content: "..." }]) }));
  // The server fetches its own facts, so every data route it may ask is
  // replaced here, before the handler is imported: weather answers, the rest
  // are down. Left real, they reached Overpass and Nominatim from CI and
  // timed the test out; here, with no network, they failed fast and hid it.
  vi.doMock("../../api/_routes/weather", () => ({
    default: async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
      res.status(200).json({ ok: true, weather: { temperatureC: 14, condition: "Cloudy", source: "Open-Meteo", fetchedAt: "2026-11-25T07:30:00.000Z" } }),
  }));
  for (const route of OTHER_ROUTES) vi.doMock(route, () => ({ default: down }));
  const { default: handler } = await import("../../api/_routes/ai/copilot");
  const call = fakeReqRes({});
  call.req.method = "POST";
  call.req.body = { question, anchor: { lat: 51.5072, lon: -0.1276 } };
  await handler(call.req, call.res);
  return call.body as { sources: string[] };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../api/_lib/ai");
  vi.doUnmock("../../api/_lib/kb");
  vi.doUnmock("../../api/_routes/weather");
  for (const route of OTHER_ROUTES) vi.doUnmock(route);
});

describe("Copilot sources", () => {
  it("names no data sources under a personal question", async () => {
    vi.resetModules();
    expect((await ask("who is his future wife")).sources).toEqual([]);
  });

  it("still names them under a question about the place", async () => {
    vi.resetModules();
    const { sources } = await ask("What's the weather here?");
    expect(sources).toContain("Open-Meteo");
    expect(sources).toContain("Help article: Using the map");
  });
});
