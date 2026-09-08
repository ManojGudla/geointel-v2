import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/stores/locationStore";
import { useReportStore } from "@/stores/reportStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { analyzeProperty } from "@/features/property/propertyAnalyzer";
import { fetchWeather } from "@/services/intel";
import { aqiBand, useAirQuality } from "@/features/live/useLiveLayers";
import { formatCoordinateLabel, formatDms } from "@/features/search/coordinateSearch";
import "./AreaReport.css";

/**
 * A printable geospatial analysis report for the selected location.
 *
 * Deliberately built from what the app has already fetched and shown rather
 * than from a fresh round of queries — a report that quietly disagrees with
 * the screen it was generated from is worse than no report. Every section
 * names its source, and any section whose data didn't load says so instead
 * of being silently omitted, so a gap in the report is visible as a gap.
 *
 * Output is via the browser's own print dialogue ("Save as PDF") rather than
 * a PDF library. That's a deliberate trade: a client-side PDF generator adds
 * several hundred kilobytes to a bundle that is already large, and produces
 * worse typography than the browser's own print pipeline. The print
 * stylesheet at the bottom of AreaReport.css is what makes the printed page
 * a real document — no interface chrome, no dark theme, real page breaks.
 */
export function AreaReport() {
  const isOpen = useReportStore((s) => s.isOpen);
  const close = useReportStore((s) => s.close);
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const evidence = useGisEvidence();
  const air = useAirQuality();
  const analysis = useAnalysisStore((s) => s.result);

  const weather = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchWeather(location!.lat, location!.lon, signal),
    enabled: !!location && isOpen,
    staleTime: 10 * 60 * 1000,
  });

  if (!isOpen || !location) return null;

  const property = evidence.data ? analyzeProperty(evidence.data) : null;
  const counts = evidence.data?.counts;
  const band = aqiBand(air.data?.europeanAqi ?? null);
  const generatedAt = new Date();

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Area report">
      <div className="report-sheet">
        <div className="report-toolbar">
          <button type="button" onClick={() => window.print()} className="report-toolbar__print">
            🖨️ Print / Save as PDF
          </button>
          <button type="button" onClick={close} className="report-toolbar__close">
            Close
          </button>
        </div>

        <article className="report">
          <header className="report__head">
            <div>
              <h1>Geospatial analysis</h1>
              <p className="report__place">{location.displayName}</p>
            </div>
            <div className="report__brand">
              <strong>maNOWj GeoIntel</strong>
              <span>{generatedAt.toLocaleString()}</span>
            </div>
          </header>

          <section className="report__section">
            <h2>Location</h2>
            <dl className="report__grid">
              <div>
                <dt>Coordinates</dt>
                <dd>{formatCoordinateLabel({ lat: location.lat, lon: location.lon })}</dd>
              </div>
              <div>
                <dt>DMS</dt>
                <dd>{formatDms({ lat: location.lat, lon: location.lon })}</dd>
              </div>
              <div>
                <dt>City</dt>
                <dd>{location.address?.city ?? "—"}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{location.address?.state ?? "—"}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{location.address?.country ?? "—"}</dd>
              </div>
              <div>
                <dt>Analysis radius</dt>
                <dd>{radiusMeters} m</dd>
              </div>
            </dl>
            <p className="report__source">Source: {location.source}</p>
          </section>

          <section className="report__section">
            <h2>Mapped evidence within {radiusMeters} m</h2>
            {evidence.isLoading && <p className="report__pending">Evidence was still loading when this report was generated.</p>}
            {evidence.isError && <p className="report__pending">Evidence could not be loaded — this section is incomplete.</p>}
            {counts && (
              <>
                <dl className="report__grid report__grid--tight">
                  <div>
                    <dt>Buildings</dt>
                    <dd>{counts.buildings.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Shops</dt>
                    <dd>{counts.shops.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Offices</dt>
                    <dd>{counts.offices.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Residential</dt>
                    <dd>{counts.residential.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Amenities</dt>
                    <dd>{counts.amenities.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Institutional</dt>
                    <dd>{counts.institutional.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Industrial</dt>
                    <dd>{counts.industrial.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Transport</dt>
                    <dd>{counts.transport.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Tourism</dt>
                    <dd>{counts.tourism.toLocaleString()}</dd>
                  </div>
                </dl>
                <p className="report__source">Source: {evidence.data?.source}. Counts are features mapped in OpenStreetMap, not a survey or a census.</p>
              </>
            )}
          </section>

          {property && (
            <section className="report__section">
              <h2>Property classification</h2>
              <p className="report__headline">
                {property.classification} · confidence {property.confidence}%
              </p>
              <p>{property.reasoning}</p>
              <ul>
                {property.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="report__source">
                Derived from the mapped evidence above by this application&apos;s own scoring, not by a third party. Sources:{" "}
                {property.sources.join(", ")}.
              </p>
            </section>
          )}

          {analysis && (
            <section className="report__section">
              <h2>Spatial analysis — {analysis.title}</h2>
              {analysis.suitability && (
                <p className="report__headline">
                  Suitability score {analysis.suitability.score} / 100 · {analysis.suitability.band}
                </p>
              )}
              <dl className="report__grid report__grid--tight">
                {analysis.stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              {analysis.suitability && (
                <table className="report__table">
                  <thead>
                    <tr>
                      <th>Factor</th>
                      <th>Weight</th>
                      <th>Score</th>
                      <th>Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.suitability.factors.map((factor) => (
                      <tr key={factor.id}>
                        <td>{factor.label}</td>
                        <td>{factor.weight}%</td>
                        <td>{factor.score}</td>
                        <td>{factor.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="report__source">{analysis.note}</p>
            </section>
          )}

          <section className="report__section">
            <h2>Conditions</h2>
            <dl className="report__grid report__grid--tight">
              <div>
                <dt>Temperature</dt>
                <dd>{weather.data ? `${Math.round(weather.data.temperatureC)} °C` : "—"}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{weather.data?.condition ?? "—"}</dd>
              </div>
              <div>
                <dt>Humidity</dt>
                <dd>{weather.data ? `${weather.data.humidityPct}%` : "—"}</dd>
              </div>
              <div>
                <dt>Wind</dt>
                <dd>{weather.data ? `${weather.data.windKph} km/h` : "—"}</dd>
              </div>
              <div>
                <dt>Air quality (EAQI)</dt>
                <dd>{air.data?.europeanAqi != null ? `${Math.round(air.data.europeanAqi)} · ${band.label}` : "—"}</dd>
              </div>
              <div>
                <dt>PM2.5</dt>
                <dd>{air.data?.pm25 != null ? `${air.data.pm25.toFixed(1)} µg/m³` : "—"}</dd>
              </div>
            </dl>
            <p className="report__source">
              Sources: {weather.data?.source ?? "Open-Meteo"} for weather; {air.data?.source ?? "Open-Meteo Air Quality"} for air quality.
            </p>
          </section>

          <footer className="report__footer">
            <p>
              Generated by maNOWj GeoIntel on {generatedAt.toLocaleString()}. All figures are derived from open data sources named
              beside each section. Nothing in this report is estimated or inferred beyond what is stated.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
