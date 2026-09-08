import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout } from "../_lib/cache.js";
import { parseRssItems } from "../_lib/rss.js";

type Article = ReturnType<typeof buildArticles>[number];
const cache = new TtlCache<Article[]>(10 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

const CATEGORY_QUERIES: Array<{ category: string; suffix: string }> = [
  { category: "Local", suffix: "" },
  { category: "Real Estate", suffix: " real estate OR property" },
  { category: "Infrastructure", suffix: " infrastructure OR metro OR development" },
];

function buildArticles(raw: Array<{ items: ReturnType<typeof parseRssItems>; category: string }>) {
  return raw
    .flatMap(({ items, category }) =>
      items.slice(0, 4).map((item) => ({
        title: item.title,
        source: item.source || "Google News",
        category,
        url: item.link,
        publishedAt: item.pubDate ? new Date(item.pubDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent",
      }))
    )
    .filter((a, i, all) => all.findIndex((b) => b.url === a.url) === i)
    .slice(0, 8);
}

const handler: ApiHandler = async (req, res) => {
  const place = getQueryParam(req, "place")?.trim();
  if (!place) return err(res, 400, "Query parameter 'place' is required.");

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many news requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = place.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return ok(res, { articles: cached, source: "Google News RSS", place });

  try {
    const results = await Promise.allSettled(
      CATEGORY_QUERIES.map(async ({ category, suffix }) => {
        const url = new URL("https://news.google.com/rss/search");
        url.searchParams.set("q", `${place}${suffix}`);
        url.searchParams.set("hl", "en-IN");
        url.searchParams.set("gl", "IN");
        url.searchParams.set("ceid", "IN:en");

        const response = await fetchWithTimeout(url.toString(), { headers: { "User-Agent": "maNOWj-GeoIntel/2.0 news reader" } }, 8000);
        if (!response.ok) throw new Error(`Google News returned HTTP ${response.status}`);
        const xml = await response.text();
        return { items: parseRssItems(xml), category };
      })
    );

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ items: ReturnType<typeof parseRssItems>; category: string }> => r.status === "fulfilled").map((r) => r.value);

    const articles = buildArticles(fulfilled);
    if (!articles.length) {
      return err(res, 502, "No location-relevant news found right now.", "NO_RESULT");
    }

    cache.set(cacheKey, articles);
    ok(res, { articles, source: "Google News RSS", place });
  } catch (error) {
    console.error("[api/news]", error);
    err(res, 502, "News is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
  }
};

export default withMaintenanceGuard(withEdgeCache(600)(handler));
