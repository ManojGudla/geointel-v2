import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { getAiCompletion } from "../../api/_lib/ai";
import { aiAttribution, formatGeneratedAt, formatModelLabel, UNKNOWN_MODEL_LABEL } from "../../src/lib/formatAiMeta";

/**
 * An AI answer is the least checkable thing this application shows. Every
 * other figure carries its source - population says Wikidata, air quality
 * says Open-Meteo, an officeholder that can't be confirmed says "Unable to
 * verify" rather than being filled in from memory. The AI answers were the
 * one exception, and they were the exception twice over: the server reported
 * the model slug it REQUESTED rather than the one that answered, and no
 * component rendered even that.
 *
 * The requested slug is not a detail here. The default is `openrouter/free`,
 * which is a router, not a model: it picks a free model at random per
 * request. Reporting it would have labelled every answer with a string that
 * names no author at all.
 */

const ORIGINAL_ENV = { ...process.env };

describe("the model reported for an AI answer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  function stubProvider(body: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
  }

  it("comes from the provider's response, not from what we asked for", async () => {
    /*
      The bug, stated as a test. We ask a router for an answer; the router
      hands the work to some free model and names it in `model`. That name
      was parsed away and discarded, and the requested slug was returned in
      its place.
    */
    stubProvider({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      choices: [{ message: { content: "Mostly commercial evidence within 500m." } }],
    });

    const result = await getAiCompletion([{ role: "user", content: "hi" }], { model: "openrouter/free" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    // And the request is still reported, separately, so the two can't be
    // confused for each other by a later reader.
    expect(result.requestedModel).toBe("openrouter/free");
  });

  it("still sends the requested slug to the provider", async () => {
    // Reporting what answered must not change what we ask for.
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ model: "google/gemma-3-27b-it:free", choices: [{ message: { content: "ok" } }] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await getAiCompletion([{ role: "user", content: "hi" }], { model: "openrouter/free" });

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).model).toBe("openrouter/free");
  });

  it("falls back to the requested slug only when the provider names nothing", async () => {
    stubProvider({ choices: [{ message: { content: "ok" } }] });
    const result = await getAiCompletion([{ role: "user", content: "hi" }], { model: "qwen/qwen3-4b:free" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("qwen/qwen3-4b:free");
  });

  it("does not let a blank provider field overwrite the requested slug", async () => {
    // "" and "   " are absent, not answers.
    stubProvider({ model: "   ", choices: [{ message: { content: "ok" } }] });
    const result = await getAiCompletion([{ role: "user", content: "hi" }], { model: "qwen/qwen3-4b:free" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("qwen/qwen3-4b:free");
  });
});

describe("how attribution reads", () => {
  it("never prints a router slug as if it were an author", () => {
    // "Written by openrouter/free" names no model. Saying what actually
    // happened is both shorter and true.
    expect(formatModelLabel("openrouter/free")).toBe("a free model chosen by OpenRouter");
  });

  it("prints a real model slug exactly as the provider gave it", () => {
    /*
      Not prettified to "Llama 3.3". The slug is the string someone can look
      up, and the ":free" and vendor parts are precisely the parts that
      explain why one run answered better than the next.
    */
    expect(formatModelLabel("meta-llama/llama-3.3-70b-instruct:free")).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("says so rather than inventing a name when nothing was reported", () => {
    expect(formatModelLabel(undefined)).toBe(UNKNOWN_MODEL_LABEL);
    expect(formatModelLabel("")).toBe(UNKNOWN_MODEL_LABEL);
  });

  it("adds the date once an answer is no longer from today", () => {
    /*
      A card left open overnight must not read as if it were written a moment
      ago - the time alone would say "18:42" for an answer a week old.
    */
    const now = new Date(2026, 8, 14, 20, 0, 0);
    const today = formatGeneratedAt(new Date(2026, 8, 14, 18, 42, 0).toISOString(), now);
    const yesterday = formatGeneratedAt(new Date(2026, 8, 13, 18, 42, 0).toISOString(), now);

    expect(today).not.toMatch(/Sep/);
    expect(yesterday).toMatch(/Sep/);
  });

  it("degrades to just the author when there is no usable timestamp", () => {
    expect(aiAttribution("x/y", undefined)).toBe("Written by x/y");
    expect(aiAttribution("x/y", "not-a-date")).toBe("Written by x/y");
  });
});

describe("an agent card that has finished", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it("shows the model and the time under the answer", async () => {
    /*
      The client half of the same bug: AgentResult has carried a `model`
      field the whole time, both routes return it, and no component rendered
      it. The answer arrived with no author and no date, in the part of the
      product where the reader can least check for themselves.
    */
    vi.doMock("../../src/stores/aiStore", () => ({
      useAiStore: (selector: (s: unknown) => unknown) =>
        selector({
          agentRuns: {
            gis: {
              status: "done",
              result: {
                kind: "gis",
                summary: "Dense retail evidence within 500m.",
                sources: [],
                generatedAt: new Date().toISOString(),
                model: "meta-llama/llama-3.3-70b-instruct:free",
              },
            },
          },
          setAgentRun: () => {},
        }),
    }));

    const { AgentCard } = await import("../../src/features/ai/AgentCard");
    render(
      <AgentCard
        definition={{ kind: "gis", label: "GIS Intelligence", icon: "🗺️", description: "Explains the evidence." }}
        context={{}}
      />
    );

    expect(screen.getByText(/meta-llama\/llama-3\.3-70b-instruct:free/)).toBeTruthy();
    expect(screen.getByText(/Written by/)).toBeTruthy();
  });
});
