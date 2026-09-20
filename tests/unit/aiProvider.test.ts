import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { getAiCompletion } from "../../api/_lib/ai";

const ORIGINAL_ENV = { ...process.env };

describe("getAiCompletion", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns ok:false without throwing when no API key is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/configured/i);
  });

  it("returns ok:true with the model's content on a successful call", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "  The area shows mostly commercial evidence.  " } }] }),
      }))
    );
    const result = await getAiCompletion([{ role: "user", content: "Describe this area" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe("The area shows mostly commercial evidence.");
  });

  it("degrades to ok:false instead of throwing when the provider errors", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "internal error" }))
    );
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(false);
  });

  // A flat "temporarily unavailable" for every non-2xx status made a bad/
  // expired key and a hit-your-free-quota rate limit look identical to a
  // real outage - these assert each surfaces a distinct, actionable reason.
  it("reports an unauthorized key distinctly from a generic provider error", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "invalid api key" }))
    );
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unauthorized|api key/i);
  });

  it("reports a rate-limit/quota hit distinctly from a generic provider error", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, text: async () => "rate limited" }))
    );
    const result = await getAiCompletion([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rate limit|quota/i);
  });

  it("degrades to ok:false instead of throwing when the network request itself fails", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    await expect(getAiCompletion([{ role: "user", content: "hi" }])).resolves.toEqual(
      expect.objectContaining({ ok: false })
    );
  });
});
