import { useLiveLayerStore } from "@/stores/liveLayerStore";
import { useLocationStore } from "@/stores/locationStore";
import { useMapStore } from "@/stores/mapStore";
import { aqiBand, useAirQuality, useEarthquakes, useRadarFrame } from "./useLiveLayers";
import "./LiveLayersPanel.css";

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "";
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * Live situational layers. Each switch reports its own state honestly —
 * loading, a real count, or the reason it isn't available — because a toggle
 * that silently does nothing is indistinguishable from a broken app, and
 * these depend on services this project does not control.
 */
/**
 * Past this zoom the radar image is being stretched rather than resolved, so
 * the panel says so. Matches RADAR_MAX_ZOOM in MapView.tsx.
 */
const RADAR_DETAIL_ZOOM = 10;

export function LiveLayersPanel() {
  const enabled = useLiveLayerStore((s) => s.enabled);
  const toggle = useLiveLayerStore((s) => s.toggle);
  const quakeWindow = useLiveLayerStore((s) => s.quakeWindow);
  const setQuakeWindow = useLiveLayerStore((s) => s.setQuakeWindow);
  const location = useLocationStore((s) => s.selectedLocation);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const zoom = useMapStore((s) => s.zoom);

  const quakes = useEarthquakes();
  const radar = useRadarFrame();
  const air = useAirQuality();

  const quakeStatus = !enabled.earthquakes
    ? "Off"
    : quakes.isLoading
      ? "Loading…"
      : quakes.isError
        ? "Unavailable: USGS didn't respond"
        : `${quakes.data?.events.length ?? 0} events`;

  const radarStatus = !enabled.radar
    ? "Off"
    : radar.isLoading
      ? "Loading…"
      : radar.isError
        ? "Unavailable: RainViewer didn't respond"
        : `Frame from ${timeAgo(radar.data ? radar.data.frameTime * 1000 : null)}`;

  const band = aqiBand(air.data?.europeanAqi ?? null);

  return (
    <div className="live-layers">
      <div className="live-layers__row">
        <label className="live-layers__toggle">
          <input type="checkbox" checked={enabled.earthquakes} onChange={() => toggle("earthquakes")} />
          <span>
            <strong>🌍 Earthquakes</strong>
            <span className="live-layers__status">{quakeStatus}</span>
          </span>
        </label>

        {enabled.earthquakes && (
          <div className="live-layers__sub">
            <div className="live-layers__segmented" role="group" aria-label="Earthquake time window">
              <button type="button" className={quakeWindow === "day" ? "active" : ""} onClick={() => setQuakeWindow("day")}>
                Last 24 h
              </button>
              <button type="button" className={quakeWindow === "week" ? "active" : ""} onClick={() => setQuakeWindow("week")}>
                7 days, M2.5+
              </button>
            </div>

            {quakes.data && quakes.data.events.length > 0 && (
              <ol className="live-layers__events">
                {quakes.data.events.slice(0, 6).map((event) => (
                  <li key={event.id}>
                    <button type="button" onClick={() => requestCamera({ center: [event.lon, event.lat], zoom: 6 })}>
                      <strong>M {event.magnitude.toFixed(1)}</strong>
                      <span>{event.place}</span>
                      <span className="live-layers__when">{timeAgo(event.time)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="live-layers__source">Source: {quakes.data?.source ?? "USGS Earthquake Hazards Program"}</p>
          </div>
        )}
      </div>

      <div className="live-layers__row">
        <label className="live-layers__toggle">
          <input type="checkbox" checked={enabled.radar} onChange={() => toggle("radar")} />
          <span>
            <strong>🌧️ Weather radar</strong>
            <span className="live-layers__status">{radarStatus}</span>
          </span>
        </label>
        {enabled.radar && !radar.isError && (
          <>
            <p className="live-layers__source">
              Precipitation intensity, most recent frame. Source: {radar.data?.source ?? "RainViewer"}. Coverage is worldwide but
              varies with local radar networks.
            </p>
            {/* Said plainly, because a radar image stretched well past its own
                resolution looks precise when it isn't. Rain shown over one
                street here really means rain somewhere in that kilometre. */}
            {zoom > RADAR_DETAIL_ZOOM && (
              <p className="live-layers__caveat">
                You&apos;re zoomed in past the radar&apos;s real detail. It&apos;s roughly a 1 km grid, so it shows the area
                rather than this exact street.
              </p>
            )}
          </>
        )}
      </div>

      {/* Air quality is a reading, not an overlay — see useLiveLayers.ts. */}
      <div className="live-layers__row">
        <div className="live-layers__aqi-head">
          <strong>💨 Air quality here</strong>
          {air.data?.europeanAqi != null && (
            <span className="live-layers__aqi-badge" style={{ background: band.color, color: band.textColor }}>
              {Math.round(air.data.europeanAqi)} · {band.label}
            </span>
          )}
        </div>
        {!location && <p className="live-layers__status">Pick a place to get a reading.</p>}
        {location && air.isLoading && <p className="live-layers__status">Loading…</p>}
        {location && air.isError && <p className="live-layers__status">Unavailable: the air quality provider didn&apos;t respond.</p>}
        {air.data && (
          <>
            <dl className="live-layers__aqi-grid">
              <div>
                <dt>PM2.5</dt>
                <dd>{air.data.pm25 != null ? `${air.data.pm25.toFixed(1)} µg/m³` : "-"}</dd>
              </div>
              <div>
                <dt>PM10</dt>
                <dd>{air.data.pm10 != null ? `${air.data.pm10.toFixed(1)} µg/m³` : "-"}</dd>
              </div>
              <div>
                <dt>NO₂</dt>
                <dd>{air.data.no2 != null ? `${air.data.no2.toFixed(1)} µg/m³` : "-"}</dd>
              </div>
              <div>
                <dt>Ozone</dt>
                <dd>{air.data.ozone != null ? `${air.data.ozone.toFixed(1)} µg/m³` : "-"}</dd>
              </div>
            </dl>
            <p className="live-layers__source">
              European AQI scale. Source: {air.data.source}. Modelled on a coarse grid, so it describes the area rather than this
              exact street.
            </p>
          </>
        )}
      </div>

      {/* Saying plainly what is not here is part of the feature. A toggle for
          traffic or flights that produced nothing would cost more trust than
          their absence does. */}
      <p className="live-layers__note">
        Wildfire, live traffic, flight and vessel layers aren&apos;t included: none has a free, keyless public source this app can
        rely on. They&apos;re left out rather than shown as switches that do nothing.
      </p>
    </div>
  );
}
