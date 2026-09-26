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
  it.each(["who is his future wife", "Who built this app?", "When is Manoj's birthday?", "hi", "Thanks!", "good morning", "who is the co-founder"])(
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

async function ask(question: string) {
  vi.doMock("../../api/_lib/ai", () => ({
    getAiCompletion: vi.fn(async () => ({ ok: true, content: "Answer.", model: "test-model" })),
  }));
  vi.doMock("../../api/_lib/kb", () => ({ searchKnowledgeBase: vi.fn(async () => [{ title: "Using the map", content: "..." }]) }));
  const { default: handler } = await import("../../api/_routes/ai/copilot");
  const call = fakeReqRes({});
  call.req.method = "POST";
  call.req.body = { question, context: { locationName: "Greater London", weather: { temperatureC: 14, condition: "Cloudy" } } };
  await handler(call.req, call.res);
  return call.body as { sources: string[] };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../api/_lib/ai");
  vi.doUnmock("../../api/_lib/kb");
});

describe("Copilot sources", () => {
  it("names no data sources under a personal question", async () => {
    vi.resetModules();
    expect((await ask("who is his future wife")).sources).toEqual([]);
  });

  it("still names them under a question about the place", async () => {
    vi.resetModules();
    const { sources } = await ask("What's the weather here?");
    expect(sources).toContain("Open-Meteo (weather)");
    expect(sources).toContain("Help article: Using the map");
  });
});
