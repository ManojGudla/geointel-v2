import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/services/apiClient";
import { fetchAirQuality } from "@/services/live";
import { fetchNearby } from "@/services/intel";
import { usePageMeta, useJsonLd } from "@/hooks/usePageMeta";
import { buildShareUrl } from "@/features/share/viewState";
import { track } from "@/services/analytics";
import { distanceKm, type Pair } from "./comparePairs";
import type { City } from "@/data/cities";
import type { PopulationData } from "@/features/population/PopulationPanel";
import "./ComparePage.css";

/**
 * Two cities, side by side.
 *
 * This is the shape of question people actually type — "Hyderabad vs
 * Bangalore" is a real, high-volume search in India, and it is one this
 * application can answer better than a listicle can, because every figure comes
 * from a live source with its date attached rather than from whatever someone
 * copied into a blog post in 2019.
 *
 * The discipline is the same as the city pages and it matters more here.
 * Comparisons invite invention: it is very tempting to fill an empty cell so
 * the table looks complete, and a table is the most authoritative-looking
 * format there is. Nothing here is filled in. Where a source has no figure for
 * one of the two cities, the row says so for that city and the comparison
 * simply is not drawn — because "Hyderabad 0, Bengaluru 4,300,000" read as a
 * fact would be a straightforwardly false claim about a real place.
 */

interface Props {
  pair: Pair;
}

const COUNT_CATEGORIES = [
  { id: "hospitals", label: "Hospitals" },
  { id: "schools", label: "Schools" },
  { id: "restaurants", label: "Restaurants" },
  { id: "parks", label: "Parks" },
] as const;

const COUNT_RADIUS = 5000;

function useCityData(city: City) {
  const population = useQuery({
    queryKey: ["cmp-pop", city.slug],
    queryFn: ({ signal }) =>
      apiGet<{ population: PopulationData | null }>("/api/population", { lat: city.lat, lon: city.lon }, signal),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const air = useQuery({
    queryKey: ["cmp-air", city.slug],
    queryFn: ({ signal }) => fetchAirQuality(city.lat, city.lon, signal),
    staleTime: 30 * 60 * 1000,
  });
  const counts = useQuery({
    queryKey: ["cmp-counts", city.slug],
    queryFn: async ({ signal }) => {
      // allSettled, so one category failing does not blank the other three.
      // A missing count shows as unknown, never as zero.
      const r = await Promise.allSettled(
        COUNT_CATEGORIES.map((c) => fetchNearby(city.lat, city.lon, COUNT_RADIUS, c.id, signal))
      );
      return COUNT_CATEGORIES.map((c, i) => {
        const x = r[i]!;
        return { ...c, count: x.status === "fulfilled" ? x.value.length : null };
      });
    },
    staleTime: 6 * 60 * 60 * 1000,
  });
  return { population, air, counts };
}

/** Renders a figure, or says plainly that there is not one. */
function Cell({ value, note }: { value: string | null; note?: string }) {
  return (
    <td className="cmp__cell">
      {value === null ? (
        <span className="cmp__value cmp__value--none">Not published</span>
      ) : (
        <span className="cmp__value">{value}</span>
      )}
      {note && <span className="cmp__note">{note}</span>}
    </td>
  );
}

export function ComparePage({ pair }: Props) {
  const { a, b } = pair;
  const canonical = `https://www.manowj.com/compare/${pair.canonicalSlug}`;

  usePageMeta({
    title: `${a.name} vs ${b.name}: population, air quality and geography | maNOWj GeoIntel`,
    description: `Compare ${a.name} and ${b.name} on population, area, density, air quality and what is nearby. Every figure shows its source and date.`,
    /*
      Both orderings of a pair render, and both point here.

      Without this, /compare/a-vs-b and /compare/b-vs-a are two URLs with
      identical content competing with each other, splitting whatever authority
      the page earns and leaving a crawler to pick one on its own — which it
      usually resolves by ranking neither.
    */
    url: canonical,
  });

  useJsonLd(
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${a.name} vs ${b.name}`,
      description: `A geographic comparison of ${a.name}, ${a.state} and ${b.name}, ${b.state}.`,
      url: canonical,
      about: [
        { "@type": "City", name: a.name, geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lon } },
        { "@type": "City", name: b.name, geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lon } },
      ],
      isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: "https://www.manowj.com/" },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "maNOWj GeoIntel", item: "https://www.manowj.com/" },
          { "@type": "ListItem", position: 2, name: `${a.name} vs ${b.name}`, item: canonical },
        ],
      },
    },
    `compare-${pair.canonicalSlug}`
  );

  const da = useCityData(a);
  const db = useCityData(b);

  const popA = da.population.data?.population ?? null;
  const popB = db.population.data?.population ?? null;
  const apart = distanceKm(a, b);

  const num = (n: number | null | undefined) => (n == null ? null : n.toLocaleString("en-IN"));
  const openOnMap = (c: City) => buildShareUrl({ lat: c.lat, lon: c.lon, zoom: c.zoom }, { zoom: 12 });

  return (
    <div className="cmp">
      <header className="cmp__head">
        <nav className="cmp__crumbs" aria-label="Breadcrumb">
          <a href="/">maNOWj GeoIntel</a>
          <span aria-hidden="true">›</span>
          <span aria-current="page">
            {a.name} vs {b.name}
          </span>
        </nav>
        <h1 className="cmp__title">
          {a.name} vs {b.name}
        </h1>
        <p className="cmp__lede">
          A geographic comparison of {a.name}, {a.state} and {b.name}, {b.state}. They are <strong>{apart} km</strong>{" "}
          apart in a straight line. Every figure below is fetched live and shows the source it came from.
        </p>
      </header>

      <main className="cmp__main">
        <section className="cmp__section" aria-labelledby="cmp-table">
          <h2 id="cmp-table">Side by side</h2>
          <div className="cmp__scroll">
            <table className="cmp__table">
              <caption className="cmp__caption">
                Population and area from Wikidata, air quality from Open-Meteo, place counts from OpenStreetMap within{" "}
                {COUNT_RADIUS / 1000} km of each city centre.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">{a.name}</th>
                  <th scope="col">{b.name}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Population</th>
                  {/* The year is not decoration. Without it a population figure
                      implies "now", and it never is. */}
                  <Cell value={num(popA?.population)} note={popA?.year ? `As of ${popA.year}` : undefined} />
                  <Cell value={num(popB?.population)} note={popB?.year ? `As of ${popB.year}` : undefined} />
                </tr>
                <tr>
                  <th scope="row">Area</th>
                  <Cell value={popA?.areaKm2 ? `${num(popA.areaKm2)} km²` : null} note="Administrative boundary" />
                  <Cell value={popB?.areaKm2 ? `${num(popB.areaKm2)} km²` : null} note="Administrative boundary" />
                </tr>
                <tr>
                  <th scope="row">Density</th>
                  <Cell value={popA?.densityPerKm2 ? `${num(Math.round(popA.densityPerKm2))} / km²` : null} />
                  <Cell value={popB?.densityPerKm2 ? `${num(Math.round(popB.densityPerKm2))} / km²` : null} />
                </tr>
                <tr>
                  <th scope="row">Air quality</th>
                  <Cell
                    value={da.air.data?.europeanAqi != null ? String(Math.round(da.air.data.europeanAqi)) : null}
                    note="European AQI, lower is better"
                  />
                  <Cell
                    value={db.air.data?.europeanAqi != null ? String(Math.round(db.air.data.europeanAqi)) : null}
                    note="European AQI, lower is better"
                  />
                </tr>
                {COUNT_CATEGORIES.map((cat, i) => (
                  <tr key={cat.id}>
                    <th scope="row">{cat.label} within {COUNT_RADIUS / 1000} km</th>
                    <Cell value={num(da.counts.data?.[i]?.count)} />
                    <Cell value={num(db.counts.data?.[i]?.count)} />
                  </tr>
                ))}
                <tr>
                  <th scope="row">Coordinates</th>
                  <Cell value={`${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}`} />
                  <Cell value={`${b.lat.toFixed(4)}, ${b.lon.toFixed(4)}`} />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="cmp__prose cmp__prose--small">
            Where a row says "not published", the source has no figure for that city. Nothing on this page is estimated
            or filled in to make the table look complete.
          </p>
        </section>

        <section className="cmp__section" aria-labelledby="cmp-geo">
          <h2 id="cmp-geo">How they differ on the ground</h2>
          <div className="cmp__geos">
            {[a, b].map((c) => (
              <article key={c.slug} className="cmp__geo">
                <h3>{c.name}</h3>
                <p className="cmp__prose">{c.geography}</p>
                <div className="cmp__geo-links">
                  <a
                    className="cmp__btn cmp__btn--primary"
                    href={openOnMap(c)}
                    onClick={() => track("map_opened", { source: "compare-page" })}
                  >
                    Open {c.name} on the map
                  </a>
                  <a className="cmp__btn" href={`/maps/${c.slug}`}>
                    {c.name} page
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="cmp__section cmp__section--sources" aria-labelledby="cmp-sources">
          <h2 id="cmp-sources">Where this data comes from</h2>
          <p className="cmp__prose cmp__prose--small">
            Population, area and density come from Wikidata, with the year each figure applies to. Air quality comes
            from Open-Meteo's CAMS model. Counts of places come from{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              OpenStreetMap contributors
            </a>
            , which is edited by volunteers, so those are what has been mapped rather than a complete register. The
            distance between the two cities is calculated from the coordinates shown above.
          </p>
        </section>
      </main>

      <footer className="cmp__footer">
        <a href="/">maNOWj GeoIntel</a>
        <span aria-hidden="true">·</span>
        <a href={`/maps/${a.slug}`}>{a.name}</a>
        <span aria-hidden="true">·</span>
        <a href={`/maps/${b.slug}`}>{b.name}</a>
        <span aria-hidden="true">·</span>
        <a href="/ai-map-search">AI Map Search</a>
      </footer>
    </div>
  );
}
