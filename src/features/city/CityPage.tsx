import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/services/apiClient";
import { fetchAirQuality } from "@/services/live";
import { fetchNearby } from "@/services/intel";
import { usePageMeta, useJsonLd } from "@/hooks/usePageMeta";
import { buildShareUrl } from "@/features/share/viewState";
import { CITIES, type City } from "@/data/cities";
import { track } from "@/services/analytics";
import type { PopulationData } from "@/features/population/PopulationPanel";
import "./CityPage.css";

/**
 * A page for one city.
 *
 * This exists because of a specific, measurable problem: the site had two
 * indexable URLs. Somebody searching "hospitals near Hyderabad" or "Hyderabad
 * satellite map" had nothing of this application to find, and the only way in
 * was to already know the brand — which for a new product means no way in at
 * all.
 *
 * The rule these pages are built to, and the reason there are eight rather than
 * eighty: an indexable page has to be worth reading. Generated pages that
 * differ only in a name are what search engines have spent fifteen years
 * learning to discount, and they pull down the pages that would otherwise have
 * ranked. So each page carries hand-written geography specific to that city,
 * and every number on it is fetched live with its source and date attached
 * rather than baked into a data file where it silently rots.
 *
 * That last part matters more than it sounds. A hardcoded population is wrong
 * the day it ships and gets more wrong every year, inside a page whose whole
 * job is to look authoritative. This application's claim is that every answer
 * shows where it came from and when. A city page full of unsourced figures
 * would be the one place that claim was false, and it would be the page
 * strangers see first.
 */

interface Props {
  city: City;
}

/** The six counts worth leading with, and all of them come from live queries. */
const COUNT_CATEGORIES = [
  { id: "hospitals", label: "Hospitals" },
  { id: "schools", label: "Schools" },
  { id: "pharmacies", label: "Pharmacies" },
  { id: "banks", label: "Banks" },
  { id: "restaurants", label: "Restaurants" },
  { id: "parks", label: "Parks" },
] as const;

const COUNT_RADIUS = 5000;

/**
 * The canonical URL for a city page — always on www.manowj.com, whatever host
 * served the request.
 *
 * This used to read `window.location.origin`, and that is a quietly expensive
 * mistake. This app is reachable on at least two hosts: www.manowj.com, and
 * the manowj-geointel.vercel.app address Vercel assigns and keeps live. An
 * origin-derived canonical means that if a crawler ever reaches a city page on
 * the vercel.app host, the page tells it "the canonical version of this is the
 * vercel.app one" — so the two hosts compete as duplicates, on exactly the
 * pages this site is trying to rank, and the authority splits between them.
 *
 * Naming the one preferred host is the entire job of rel=canonical; deriving
 * it from wherever you happen to be defeats the point. ComparePage already
 * hardcodes it, which is why comparison pages were never exposed to this and
 * city pages were.
 */
const CANONICAL_ORIGIN = "https://www.manowj.com";

function cityUrl(slug: string): string {
  return `${CANONICAL_ORIGIN}/maps/${slug}`;
}

export function CityPage({ city }: Props) {
  usePageMeta({
    // Written to match how people actually search: the place first, then what
    // they can do. "maNOWj" is deliberately last — nobody is searching for a
    // brand they have never heard of.
    title: `${city.name} map, population and geographic data | maNOWj GeoIntel`,
    description: `${city.summary} Population, air quality, hospitals, schools and satellite imagery for ${city.name}, ${city.state}.`,
    url: cityUrl(city.slug),
  });

  /*
    WebPage and BreadcrumbList, not FAQPage.

    An FAQ schema needs questions and answers actually visible on the page. The
    questions below are prompts that run a live query — the answer does not
    exist until somebody clicks — so marking them up as an FAQ would be a
    structured-data claim the page cannot back, which is the kind of thing that
    earns a manual action rather than a rich result.
  */
  useJsonLd(
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${city.name} map and geographic data`,
      description: city.summary,
      url: cityUrl(city.slug),
      about: {
        "@type": "City",
        name: city.name,
        address: { "@type": "PostalAddress", addressRegion: city.state, addressCountry: "IN" },
        geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lon },
      },
      isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: "https://www.manowj.com/" },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "maNOWj GeoIntel", item: "https://www.manowj.com/" },
          { "@type": "ListItem", position: 2, name: city.name, item: cityUrl(city.slug) },
        ],
      },
    },
    `city-${city.slug}`
  );

  const population = useQuery({
    queryKey: ["city-population", city.slug],
    queryFn: ({ signal }) =>
      apiGet<{ population: PopulationData | null }>("/api/population", { lat: city.lat, lon: city.lon }, signal),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const air = useQuery({
    queryKey: ["city-air", city.slug],
    queryFn: ({ signal }) => fetchAirQuality(city.lat, city.lon, signal),
    staleTime: 30 * 60 * 1000,
  });

  const counts = useQuery({
    queryKey: ["city-counts", city.slug],
    queryFn: async ({ signal }) => {
      /*
        Six queries, run together rather than in sequence.

        Each hits the free Overpass mirrors, so sequentially this page would
        take most of a minute to fill in and a crawler would time out long
        before it finished. allSettled rather than all: one category failing
        must not blank the other five, and a missing count is shown as unknown
        rather than as zero. "0 hospitals in Hyderabad" is a wrong answer
        someone might act on.
      */
      const results = await Promise.allSettled(
        COUNT_CATEGORIES.map((c) => fetchNearby(city.lat, city.lon, COUNT_RADIUS, c.id, signal))
      );
      return COUNT_CATEGORIES.map((c, i) => {
        const r = results[i]!;
        return { ...c, count: r.status === "fulfilled" ? r.value.length : null };
      });
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  const openInApp = (question?: string) =>
    buildShareUrl({ lat: city.lat, lon: city.lon, zoom: city.zoom, question }, { zoom: 12 });

  const others = CITIES.filter((c) => c.slug !== city.slug);
  const pop = population.data?.population ?? null;

  return (
    <div className="city">
      <header className="city__head">
        <nav className="city__crumbs" aria-label="Breadcrumb">
          <a href="/">maNOWj GeoIntel</a>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{city.name}</span>
        </nav>
        <h1 className="city__title">{city.name} map and geographic data</h1>
        <p className="city__lede">{city.summary}</p>
        <div className="city__actions">
          <a
            className="city__btn city__btn--primary"
            href={openInApp()}
            onClick={() => track("map_opened", { source: "city-page" })}
          >
            Open {city.name} on the map
          </a>
          <a className="city__btn" href="/ai-map-search">
            How this works
          </a>
        </div>
      </header>

      <main className="city__main">
        {/* ── The live figures. Every one carries its source. ───────────── */}
        <section className="city__section" aria-labelledby="city-figures">
          <h2 id="city-figures">{city.name} in numbers</h2>

          <div className="city__figures">
            <div className="city__figure">
              <span className="city__figure-label">Population</span>
              {population.isLoading && <span className="city__figure-value city__figure-value--muted">Loading…</span>}
              {!population.isLoading && pop && (
                <>
                  <span className="city__figure-value">{pop.population.toLocaleString("en-IN")}</span>
                  {/*
                    The most important line on this page.

                    Without the year, a population figure implies "now", and it
                    never is — these come from censuses and official estimates
                    that are often years old. Stating the year is the difference
                    between a fact and a misleading number.
                  */}
                  <span className="city__figure-note">
                    {pop.year ? `As of ${pop.year}. ` : ""}Source: {pop.source}
                  </span>
                </>
              )}
              {!population.isLoading && !pop && (
                <span className="city__figure-value city__figure-value--muted">Not published</span>
              )}
            </div>

            <div className="city__figure">
              <span className="city__figure-label">Area</span>
              {pop?.areaKm2 ? (
                <>
                  <span className="city__figure-value">{pop.areaKm2.toLocaleString("en-IN")} km²</span>
                  <span className="city__figure-note">Administrative boundary. Source: {pop.source}</span>
                </>
              ) : (
                <span className="city__figure-value city__figure-value--muted">Not published</span>
              )}
            </div>

            <div className="city__figure">
              <span className="city__figure-label">Air quality</span>
              {air.isLoading && <span className="city__figure-value city__figure-value--muted">Loading…</span>}
              {!air.isLoading && air.data?.europeanAqi != null && (
                <>
                  <span className="city__figure-value">{Math.round(air.data.europeanAqi)}</span>
                  <span className="city__figure-note">
                    European AQI{air.data.observedAt ? `, observed ${new Date(air.data.observedAt).toLocaleString()}` : ""}.
                    Source: {air.data.source}
                  </span>
                </>
              )}
              {!air.isLoading && air.data?.europeanAqi == null && (
                <span className="city__figure-value city__figure-value--muted">Unavailable</span>
              )}
            </div>

            <div className="city__figure">
              <span className="city__figure-label">Coordinates</span>
              <span className="city__figure-value city__figure-value--small">
                {city.lat.toFixed(4)}, {city.lon.toFixed(4)}
              </span>
              <span className="city__figure-note">City centre, WGS 84</span>
            </div>
          </div>
        </section>

        {/* ── Geography. Hand-written, and the reason this page is not thin. */}
        <section className="city__section" aria-labelledby="city-geography">
          <h2 id="city-geography">The geography of {city.name}</h2>
          <p className="city__prose">{city.geography}</p>
          <p className="city__prose">
            Landmarks you can find on the map:{" "}
            {city.landmarks.map((l, i) => (
              <span key={l}>
                <strong>{l}</strong>
                {i < city.landmarks.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </section>

        {/* ── Live counts ───────────────────────────────────────────────── */}
        <section className="city__section" aria-labelledby="city-whats-here">
          <h2 id="city-whats-here">What is within 5 km of the centre</h2>
          <p className="city__prose city__prose--small">
            Counted live from OpenStreetMap when this page loaded, within {COUNT_RADIUS / 1000} km of the coordinates
            above. OpenStreetMap is edited by volunteers, so these are what has been mapped rather than a complete
            register.
          </p>
          <ul className="city__counts">
            {(counts.data ?? COUNT_CATEGORIES.map((c) => ({ ...c, count: null }))).map((c) => (
              <li key={c.id} className="city__count">
                <span className="city__count-value">
                  {counts.isLoading ? "…" : c.count === null ? "-" : c.count.toLocaleString("en-IN")}
                </span>
                <span className="city__count-label">{c.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Questions, each of which really runs ──────────────────────── */}
        <section className="city__section" aria-labelledby="city-ask">
          <h2 id="city-ask">Ask something about {city.name}</h2>
          <p className="city__prose city__prose--small">
            Each of these opens the map at {city.name} and runs the question against live data. Every answer shows the
            source it came from.
          </p>
          <ul className="city__questions">
            {city.questions.map((q) => (
              <li key={q}>
                <a
                  className="city__question"
                  href={openInApp(q)}
                  onClick={() => track("search_started", { kind: "city-page", queryLength: q.length })}
                >
                  {q}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Internal linking ──────────────────────────────────────────── */}
        <section className="city__section" aria-labelledby="city-others">
          <h2 id="city-others">Other cities</h2>
          <ul className="city__others">
            {others.map((c) => (
              <li key={c.slug}>
                <a href={`/maps/${c.slug}`}>
                  <strong>{c.name}</strong>
                  <span>{c.state}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="city__section city__section--sources" aria-labelledby="city-sources">
          <h2 id="city-sources">Where this data comes from</h2>
          <p className="city__prose city__prose--small">
            Population and area come from Wikidata, with the year each figure applies to. Air quality comes from
            Open-Meteo's CAMS model. Counts of places come from{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              OpenStreetMap contributors
            </a>{" "}
            via Overpass. Nothing on this page is estimated or filled in: where a source has no figure, it says so.
          </p>
        </section>
      </main>

      <footer className="city__footer">
        <a href="/">maNOWj GeoIntel</a>
        <span aria-hidden="true">·</span>
        <a href="/ai-map-search">AI Map Search</a>
        <span aria-hidden="true">·</span>
        <a href="/status">System status</a>
      </footer>
    </div>
  );
}
