import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler, { buildArticles, cleanTitle, feedUrl, newsFeeds } from "../../api/_routes/news";
import { newsArea, timeAgo } from "../../src/features/news/NewsPanel";

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

/*
  Added 26 November 2026, when the owner asked for news to work properly:
  newest first, recent only, the place quoted, topics bracketed, the area
  inside the city asked about, and no source repeated in every title.
*/
describe("what news is asked for", () => {
  it("quotes the place and brackets the topics, so OR means what it looks like", () => {
    const feeds = newsFeeds("Hyderabad");
    expect(feeds.map((f) => f.category)).toEqual(["Local", "Real Estate", "Infrastructure"]);
    expect(feeds[0]!.query).toBe('"Hyderabad"');
    expect(feeds[1]!.query).toBe('"Hyderabad" (real estate OR property OR housing OR RERA)');
  });

  it("asks about the area inside the city first, and not when it is the city itself", () => {
    expect(newsFeeds("Hyderabad", "Gachibowli")[0]).toMatchObject({ category: "Nearby", query: '"Gachibowli" "Hyderabad"' });
    expect(newsFeeds("Hyderabad", "hyderabad")[0]!.category).toBe("Local");
  });

  it("limits each feed to recent days with Google's when: operator, or not at all when widened", () => {
    expect(new URL(feedUrl('"Hyderabad"', 7)).searchParams.get("q")).toBe('"Hyderabad" when:7d');
    expect(new URL(feedUrl('"Hyderabad"', null)).searchParams.get("q")).toBe('"Hyderabad"');
  });

  it("drops quotation marks a place name could use to break out of its quotes", () => {
    expect(newsFeeds('Bad" OR "x')[0]!.query).toBe('"Bad OR x"');
  });
});

describe("how the articles are put together", () => {
  const item = (title: string, link: string, pubDate: string, source = "The Hindu") => ({ title, link, pubDate, source });

  it("sorts newest first, whatever order the feeds came in", () => {
    const articles = buildArticles([
      { category: "Local", items: [item("Old story - The Hindu", "https://a/1", "Mon, 01 Sep 2025 10:00:00 GMT"), item("New story - The Hindu", "https://a/2", "Wed, 26 Nov 2026 05:00:00 GMT")] },
      { category: "Infrastructure", items: [item("Middle story - The Hindu", "https://a/3", "Tue, 25 Nov 2026 05:00:00 GMT")] },
    ]);
    expect(articles.map((a) => a.title)).toEqual(["New story", "Middle story", "Old story"]);
    expect(articles[0]!.publishedIso).toBe("2026-11-26T05:00:00.000Z");
  });

  it("strips the source from the end of the title, since it is shown beside it", () => {
    expect(cleanTitle("Metro work begins - The Hindu", "The Hindu")).toBe("Metro work begins");
    expect(cleanTitle("A - B story", "Deccan Chronicle")).toBe("A - B story");
  });

  it("lists the same story once, even from two topics or two links", () => {
    const articles = buildArticles([
      { category: "Local", items: [item("Flyover opens - The Hindu", "https://a/1", "Wed, 26 Nov 2026 05:00:00 GMT")] },
      { category: "Infrastructure", items: [item("Flyover opens - The Hindu", "https://a/9", "Wed, 26 Nov 2026 05:00:00 GMT"), item("Flyover opens - The Hindu", "https://a/1", "Wed, 26 Nov 2026 05:00:00 GMT")] },
    ]);
    expect(articles).toHaveLength(1);
  });

  it("puts undated articles last and says Recent rather than inventing a date", () => {
    const articles = buildArticles([{ category: "Local", items: [item("No date", "https://a/5", ""), item("Dated", "https://a/6", "Wed, 26 Nov 2026 05:00:00 GMT")] }]);
    expect(articles.map((a) => a.title)).toEqual(["Dated", "No date"]);
    expect(articles[1]!.publishedAt).toBe("Recent");
    expect(articles[1]!.publishedIso).toBeUndefined();
  });
});

describe("the news panel's helpers", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");

  it("says how old a story is in words", () => {
    expect(timeAgo("2026-11-26T11:59:30Z", "26 Nov 2026", now)).toBe("just now");
    expect(timeAgo("2026-11-26T11:25:00Z", "26 Nov 2026", now)).toBe("35 min ago");
    expect(timeAgo("2026-11-26T09:00:00Z", "26 Nov 2026", now)).toBe("3 hours ago");
    expect(timeAgo("2026-11-25T10:00:00Z", "25 Nov 2026", now)).toBe("yesterday");
    expect(timeAgo("2026-11-01T10:00:00Z", "01 Nov 2026", now)).toBe("01 Nov 2026");
    expect(timeAgo(undefined, "Recent", now)).toBe("Recent");
  });

  it("asks about the suburb or the place's name, never the city itself or a street address", () => {
    expect(newsArea({ name: "Wave Rock", address: { suburb: "Nanakramguda", city: "Hyderabad" } })).toBe("Nanakramguda");
    expect(newsArea({ name: "Charminar", address: { city: "Hyderabad" } })).toBe("Charminar");
    expect(newsArea({ name: "Hyderabad", address: { city: "Hyderabad" } })).toBeUndefined();
    expect(newsArea({ name: "Plot 1234, Road No. 36", address: { city: "Hyderabad" } })).toBeUndefined();
    expect(newsArea(null)).toBeUndefined();
  });
});

describe("api/news with no recent stories (MOCK feed)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks again without the time limit, and says the list is older", async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const q = new URL(String(url)).searchParams.get("q") ?? "";
        calls.push(q);
        const recent = q.includes("when:");
        return { ok: true, status: 200, text: async () => (recent ? "<rss><channel></channel></rss>" : SAMPLE_RSS) };
      })
    );
    const { default: fresh } = await import("../../api/_routes/news");
    const r = fakeReqRes({ place: "Quietville" });
    await fresh(r.req, r.res);
    expect(r.statusCode).toBe(200);
    expect((r.body as { widened: boolean }).widened).toBe(true);
    expect(calls.some((c) => c.includes("when:"))).toBe(true);
    expect(calls.some((c) => !c.includes("when:"))).toBe(true);
    vi.resetModules();
  });
});

