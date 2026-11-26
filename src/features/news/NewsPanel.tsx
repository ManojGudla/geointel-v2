import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchNews, type NewsResult } from "@/services/intel";
import { useLocationStore } from "@/stores/locationStore";
import "./NewsPanel.css";

/** "just now", "35 min ago", "3 hours ago", "yesterday", "4 days ago", else the date. */
export function timeAgo(iso: string | undefined, fallback: string, now = Date.now()): string {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return fallback;
  const minutes = Math.round((now - t) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return fallback;
}

/**
 * The area to ask about inside the city: the suburb when the geocoder gave
 * one, otherwise the place's own name, but only when it is not the city
 * itself (asking for "Hyderabad" news inside "Hyderabad" adds nothing).
 */
export function newsArea(location: { name?: string; address: { suburb?: string; city?: string } } | null): string | undefined {
  if (!location) return undefined;
  const city = location.address.city?.toLowerCase();
  for (const candidate of [location.address.suburb, location.name]) {
    const c = candidate?.trim();
    // A long display name or a house address is not something news is written about.
    if (c && c.toLowerCase() !== city && c.length <= 40 && !/\d{3,}/.test(c)) return c;
  }
  return undefined;
}

const ALL = "All";

export function NewsPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const place = location?.address.city || location?.name;
  const area = newsArea(location);
  const [topic, setTopic] = useState(ALL);

  const query = useQuery<NewsResult>({
    queryKey: ["news", place, area],
    queryFn: ({ signal }) => fetchNews(place!, area, signal),
    enabled: !!place,
    staleTime: 10 * 60 * 1000,
  });

  const topics = useMemo(() => {
    const seen = new Set<string>();
    for (const a of query.data?.articles ?? []) seen.add(a.category);
    return [ALL, ...seen];
  }, [query.data]);

  return (
    <div className="news-panel">
      <h2>Location News</h2>
      <AsyncPanel query={query} label="News" isEmpty={(data) => data.articles.length === 0} idleMessage="Select a location to see local news.">
        {(data) => {
          const shown = topic === ALL ? data.articles : data.articles.filter((a) => a.category === topic);
          return (
            <>
              {topics.length > 2 && (
                <div className="news-panel__topics" role="group" aria-label="News topics">
                  {topics.map((t) => (
                    <button key={t} type="button" className={t === topic ? "is-active" : ""} aria-pressed={t === topic} onClick={() => setTopic(t)}>
                      {t === "Nearby" && area ? area : t}
                    </button>
                  ))}
                </div>
              )}
              {data.widened && (
                <p className="news-panel__note">Nothing from the last few weeks, so these include older stories. Check the dates.</p>
              )}
              <ul className="news-panel__list">
                {shown.map((article) => (
                  <li key={article.url}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                    <span>
                      {article.source} · {article.category === "Nearby" && area ? area : article.category} ·{" "}
                      <time dateTime={article.publishedIso}>{timeAgo(article.publishedIso, article.publishedAt)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </AsyncPanel>
      {place && (
        <p className="news-panel__source">
          Source: Google News RSS, newest first, about &ldquo;{place}&rdquo;{area ? <> and &ldquo;{area}&rdquo;</> : null}. Headlines link to
          the publisher.
        </p>
      )}
    </div>
  );
}
