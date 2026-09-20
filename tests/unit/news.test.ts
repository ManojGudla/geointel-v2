import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/news";

const SAMPLE_RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>Local Story - Example Source</title><link>https://example.com/a</link><pubDate>Mon, 31 Aug 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

function mockFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => SAMPLE_RSS }))
  );
}

describe("api/news handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires a place parameter", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("returns articles for a valid place", async () => {
    mockFetchOk();
    const result = fakeReqRes({ place: "Hyderabad" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { ok: boolean; articles: unknown[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.articles.length).toBeGreaterThan(0);
  });

  /**
   * Feature Status audit finding: this endpoint had caching but no rate
   * limiting at all, unlike every other data-fetching handler in the
   * project. This asserts the fix.
   */
  it("rate-limits repeated requests from the same client", async () => {
    // A fresh module instance so this test gets its own, empty RateLimiter -
    // the earlier tests in this file already made calls through the shared
    // module-level limiter, which would throw off the exact call count.
    vi.resetModules();
    mockFetchOk();
    const { default: freshHandler } = await import("../../api/_routes/news");

    let lastResult = fakeReqRes({ place: "place-0" });
    for (let i = 0; i < 20; i++) {
      lastResult = fakeReqRes({ place: `place-${i}` });
      await freshHandler(lastResult.req, lastResult.res);
    }
    expect(lastResult.statusCode).toBe(200);

    const limited = fakeReqRes({ place: "place-final" });
    await freshHandler(limited.req, limited.res);
    expect(limited.statusCode).toBe(429);
    expect((limited.body as { code: string }).code).toBe("RATE_LIMITED");
    vi.resetModules();
  });
});
