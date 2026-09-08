import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchNews } from "@/services/intel";
import { useLocationStore } from "@/stores/locationStore";
import "./NewsPanel.css";

export function NewsPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const place = location?.address.city || location?.name;

  const query = useQuery({
    queryKey: ["news", place],
    queryFn: ({ signal }) => fetchNews(place!, signal),
    enabled: !!place,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="news-panel">
      <h2>Location News</h2>
      <AsyncPanel query={query} label="News" isEmpty={(items) => items.length === 0} idleMessage="Select a location to see local news.">
        {(articles) => (
          <ul className="news-panel__list">
            {articles.map((article) => (
              <li key={article.url}>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <span>
                  {article.source} · {article.category} · {article.publishedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncPanel>
      {place && <p className="news-panel__source">Source: Google News RSS, scoped to "{place}"</p>}
    </div>
  );
}
