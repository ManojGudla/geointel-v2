import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout } from "../_lib/cache.js";
import { parseRssItems, type ParsedRssItem } from "../_lib/rss.js";

/**
 * News for a place, from Google News RSS.
 *
 * Reworked on 26 November 2026, after the owner asked for news to work
 * properly. What was wrong with the first version:
 *
 * - Nothing was sorted. Google News RSS search results come in relevance
 *   order, so a two-year-old story could sit above this morning's.
 * - Nothing was recent. With no time limit in the query, an ordinary city
 *   name returned articles from any year.
 * - "Hyderabad real estate OR property" does not mean what it looks like:
 *   OR binds only to the words either side of it. The topics are now
 *   bracketed, and the place is quoted so "Abids" does not match "abides".
 * - Every title ended with " - Source", and the source was printed again
 *   beside it.
 * - The locality was never asked about: Gachibowli and Old City got the
 *   same Hyderabad list. When the panel passes an area inside the city, it
 *   gets its own "Nearby" set first.
 *
 * Google's `when:Nd` search operator limits each feed to the last N days.
 * When a quiet place has nothing that recent, each feed is asked again
 * without the limit, and the articles say how old they are.
 */

export interface Article {
  title: string;
  source: string;
  category: string;
  url: string;
  /** For display, e.g. "26 Nov 2026"; "Recent" when the feed gave no date. */
  publishedAt: string;
  /** ISO time, for sorting and for "3 hours ago". Absent when the feed gave no date. */
  publishedIso?: string;
}

const cache = new TtlCache<{ articles: Article[]; widened: boolean }>(10 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

const PER_FEED = 6;
const MAX_ARTICLES = 14;

interface Feed {
  category: string;
  query: string;
  days: number;
}

/** Quotes a name for a search, dropping characters that would break the quoting. */
function quoted(name: string): string {
  return `"${name.replace(/["()]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

export function newsFeeds(place: string, area?: string): Feed[] {
  const p = quoted(place);
  const feeds: Feed[] = [];
  if (area && area.toLowerCase() !== place.toLowerCase()) {
    feeds.push({ category: "Nearby", query: `${quoted(area)} ${p}`, days: 30 });
  }
  feeds.push(
    { category: "Local", query: p, days: 7 },
    { category: "Real Estate", query: `${p} (real estate OR property OR housing OR RERA)`, days: 30 },
    { category: "Infrastructure", query: `${p} (infrastructure OR metro OR flyover OR road OR development)`, days: 30 }
  );
  return feeds;
}

export function feedUrl(query: string, days: number | null): string {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", days ? `${query} when:${days}d` : query);
  url.searchParams.set("hl", "en-IN");
  url.searchParams.set("gl", "IN");
  url.searchParams.set("ceid", "IN:en");
  return url.toString();
}

/** "Metro work begins - The Hindu" with source "The Hindu" → "Metro work begins". */
export function cleanTitle(title: string, source: string): string {
  if (source) {
    const suffix = ` - ${source}`;
    if (title.endsWith(suffix)) return title.slice(0, -suffix.length).trim();
  }
  return title.trim();
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function buildArticles(raw: Array<{ items: ParsedRssItem[]; category: string }>): Article[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Article[] = [];
  for (const { items, category } of raw) {
    for (const item of items.slice(0, PER_FEED)) {
      const source = item.source || "Google News";
      const title = cleanTitle(item.title, item.source);
      const key = titleKey(title);
      if (!title || seenUrl.has(item.link) || seenTitle.has(key)) continue;
      seenUrl.add(item.link);
      seenTitle.add(key);
      const date = item.pubDate ? new Date(item.pubDate) : null;
      const valid = date && !Number.isNaN(date.getTime());
      out.push({
        title,
        source,
        category,
        url: item.link,
        publishedAt: valid ? date!.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Recent",
        ...(valid ? { publishedIso: date!.toISOString() } : {}),
      });
    }
  }
  // Newest first; undated last, in the order they came.
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const tx = x.a.publishedIso ? Date.parse(x.a.publishedIso) : -Infinity;
      const ty = y.a.publishedIso ? Date.parse(y.a.publishedIso) : -Infinity;
      return ty === tx ? x.i - y.i : ty > tx ? 1 : -1;
    })
    .map(({ a }) => a)
    .slice(0, MAX_ARTICLES);
}

async function readFeed(feed: Feed, days: number | null): Promise<{ items: ParsedRssItem[]; category: string }> {
  const response = await fetchWithTimeout(feedUrl(feed.query, days), { headers: { "User-Agent": "maNOWj-GeoIntel/2.0 news reader" } }, 8000);
  if (!response.ok) throw new Error(`Google News returned HTTP ${response.status}`);
  return { items: parseRssItems(await response.text()), category: feed.category };
}

function fulfilledOnly<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled").map((r) => r.value);
}

const handler: ApiHandler = async (req, res) => {
  const place = getQueryParam(req, "place")?.trim().slice(0, 80);
  if (!place) return err(res, 400, "Query parameter 'place' is required.");
  const area = getQueryParam(req, "area")?.trim().slice(0, 80) || undefined;

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many news requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${place.toLowerCase()}|${(area ?? "").toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return ok(res, { ...cached, source: "Google News RSS", place, area });

  try {
    const feeds = newsFeeds(place, area);
    let raw = fulfilledOnly(await Promise.allSettled(feeds.map((f) => readFeed(f, f.days))));
    let articles = buildArticles(raw);
    let widened = false;
    if (!articles.length) {
      // A quiet place: nothing in the last few weeks. Ask again with no time limit.
      raw = fulfilledOnly(await Promise.allSettled(feeds.map((f) => readFeed(f, null))));
      articles = buildArticles(raw);
      widened = articles.length > 0;
    }
    if (!articles.length) {
      return err(res, 502, "No news found for this place right now.", "NO_RESULT");
    }
    cache.set(cacheKey, { articles, widened });
    ok(res, { articles, widened, source: "Google News RSS", place, area });
  } catch (error) {
    console.error("[api/news]", error);
    err(res, 502, "News is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
  }
};

export default withMaintenanceGuard(withEdgeCache(600)(handler));
