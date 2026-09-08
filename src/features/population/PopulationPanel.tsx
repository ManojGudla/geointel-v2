import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/stores/locationStore";
import { apiGet } from "@/services/apiClient";
import "./PopulationPanel.css";

export interface PopulationData {
  place: string;
  population: number;
  year: number | null;
  areaKm2: number | null;
  densityPerKm2: number | null;
  source: string;
  sourceUrl: string | null;
}

/**
 * How many people live here.
 *
 * The headline choice: this is NOT presented as a live count, because there is
 * no such thing. Population comes from censuses and official estimates, and
 * every figure here is shown with the year it applies to and a link to the
 * record it came from. A number ticking upward would look impressive and be
 * fiction — on a map whose entire value is that its numbers are checkable.
 *
 * The second choice worth naming: the figure is for a PLACE, usually the whole
 * city, not for the selected radius. Saying which place, in the panel, stops
 * someone reading a city's population as their neighbourhood's.
 */
export function PopulationPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);

  const query = useQuery({
    queryKey: ["population", location?.lat, location?.lon],
    queryFn: ({ signal }) =>
      apiGet<{ population: PopulationData | null }>("/api/population", { lat: location!.lat, lon: location!.lon }, signal),
    enabled: !!location,
    // Population changes yearly at most — there is nothing to gain from
    // refetching it during a session.
    staleTime: 60 * 60 * 1000,
  });

  if (!location) {
    return (
      <div className="population">
        <h2>Population</h2>
        <p className="population__empty">Select a location to see how many people live there.</p>
      </div>
    );
  }

  const data = query.data?.population ?? null;
  const radiusLabel = radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`;
  const isOld = data?.year != null && new Date().getFullYear() - data.year > 5;

  return (
    <div className="population">
      <h2>Population</h2>

      {query.isPending && <p className="population__empty">Looking up the published figure…</p>}

      {query.isError && (
        <p className="population__empty">
          Couldn&apos;t reach the population sources just now. Nothing is shown rather than an estimate.
        </p>
      )}

      {!query.isPending && !query.isError && !data && (
        <p className="population__empty">
          No published population figure for this area. Many rural and less-mapped places have none — that is a gap in the
          data, not a population of zero.
        </p>
      )}

      {data && (
        <>
          <p className="population__figure">
            <strong>{data.population.toLocaleString()}</strong>
            <span>people</span>
          </p>

          <p className="population__scope">
            in <strong>{data.place}</strong>
            {data.year ? ` · as of ${data.year}` : " · year not stated by the source"}
          </p>

          {data.densityPerKm2 !== null && (
            <div className="population__density">
              <span>Density</span>
              <strong>{data.densityPerKm2.toLocaleString()} per km²</strong>
              {data.areaKm2 !== null && <span className="population__area">over {data.areaKm2.toLocaleString()} km²</span>}
            </div>
          )}

          {/* The most important line in the panel. Without it, someone with a
              500 m radius selected reads a whole city's population as the
              population of their block. */}
          <p className="population__caveat">
            This is the figure for {data.place} as a whole — not for the {radiusLabel} area you have selected.
            {isOld ? ` It is from ${data.year}, so the real figure today is likely higher.` : ""}
          </p>

          <p className="population__source">
            Source: {data.source}
            {data.sourceUrl && (
              <>
                {" · "}
                <a href={data.sourceUrl} target="_blank" rel="noreferrer">
                  check the record
                </a>
              </>
            )}
            . Population is never live — it comes from censuses and official estimates.
          </p>
        </>
      )}
    </div>
  );
}
