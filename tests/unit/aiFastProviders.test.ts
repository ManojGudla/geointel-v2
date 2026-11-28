import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredAiProviders, getAiCompletion, resetAiPause, resetProviderPauses } from "../../api/_lib/ai";

/*
  Added 28 November 2026, after Ask maNOWj and the agents were slow and
  "busy" in a client meeting: faster providers are asked before OpenRouter's
  shared free models, each only when its key is set. MOCK providers: these
  prove the order and the fallbacks, not the live services.
*/

const ORIGINAL_ENV = { ...process.env };

type Call = { url: string; model: string };

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function answer(content: string, model?: string) {
  return reply(200, { choices: [{ message: { content } }], ...(model ? { model } : {}) });
}

function stubFetch(script: (call: Call) => ReturnType<typeof reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const call = { url: String(url), model: JSON.parse(init.body).model as string };
      calls.push(call);
      return script(call);
    })
  );
  return calls;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GROQ_MODEL;
  resetAiPause();
  resetProviderPauses();
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("the fast providers", () => {
  it("asks Groq first when its key is set, and says who answered", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.OPENROUTER_API_KEY = "o";
    const calls = stubFetch(() => answer("A quick answer.", "llama-3.3-70b-versatile"));
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("A quick answer.");
      expect(result.model).toBe("llama-3.3-70b-versatile (Groq)");
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("moves to Groq's next model when one is busy, since its limits are per model", async () => {
    process.env.GROQ_API_KEY = "g";
    const calls = stubFetch((c) => (c.model === "llama-3.3-70b-versatile" ? reply(429, { error: { message: "rate limit" } }) : answer("From the second model.")));
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.model)).toEqual(["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
  });

  it("skips a retired model name and uses the next one", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GROQ_MODEL = "some-old-model";
    const calls = stubFetch((c) => (c.model === "some-old-model" ? reply(404, { error: { message: "model_not_found" } }) : answer("Fine.")));
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.model)).toEqual(["some-old-model", "llama-3.3-70b-versatile"]);
  });

  it("falls back to Google Gemini, then OpenRouter, when the one before cannot answer", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GEMINI_API_KEY = "m";
    process.env.OPENROUTER_API_KEY = "o";
    const calls = stubFetch((c) =>
      c.url.includes("groq") ? reply(503, {}) : c.url.includes("generativelanguage") ? reply(429, {}, { "retry-after": "30" }) : answer("OpenRouter answered.")
    );
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe("OpenRouter answered.");
    const hosts = [...new Set(calls.map((c) => new URL(c.url).host))];
    expect(hosts).toEqual(["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai"]);
  });

  it("stops asking a provider that rejected its key, instead of failing every request on it", async () => {
    process.env.GROQ_API_KEY = "wrong";
    process.env.OPENROUTER_API_KEY = "o";
    const calls = stubFetch((c) => (c.url.includes("groq") ? reply(401, { error: { message: "invalid key" } }) : answer("Fallback.")));
    await getAiCompletion([{ role: "user", content: "one" }]);
    await getAiCompletion([{ role: "user", content: "two" }]);
    expect(calls.filter((c) => c.url.includes("groq"))).toHaveLength(1);
  });

  it("works with only a fast provider configured, and says busy rather than 'not configured' when it is", async () => {
    process.env.GROQ_API_KEY = "g";
    stubFetch(() => reply(503, {}));
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("busy");
  });

  it("changes nothing when no fast provider is configured", async () => {
    process.env.OPENROUTER_API_KEY = "o";
    const calls = stubFetch(() => answer("As before."));
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    expect(new URL(calls[0]!.url).host).toBe("openrouter.ai");
  });

  it("lists configured providers by name only, in the order they are asked", () => {
    expect(configuredAiProviders({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" } as NodeJS.ProcessEnv)).toEqual(["groq", "openrouter"]);
    expect(configuredAiProviders({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});
