import { useEffect, useState } from "react";
import { useTimelineStore } from "@/stores/timelineStore";
import { useMapStore } from "@/stores/mapStore";
import { GIBS_LAYERS, timelineStops } from "./gibs";
import "./TimelinePanel.css";

const STOPS = timelineStops();
/** Beyond this the imagery is being upscaled well past its real 250 m detail. */
const USEFUL_MAX_ZOOM = 9;

function formatStop(date: string): string {
  const [year, month] = date.split("-");
  return `${year}-${month}`;
}

/**
 * A time slider over NASA's dated satellite archive.
 *
 * The honest framing is doing real work here. At 250 m per pixel this shows
 * water bodies, vegetation, coastline and large-scale urban growth across a
 * decade — genuinely striking, and genuinely free. It does not show new
 * buildings or new streets, and the panel says so rather than letting
 * someone conclude it from a blurry image. See gibs.ts.
 *
 * The zoom warning matters for the same reason: the layer keeps rendering
 * when you zoom past its resolution, just as an increasingly soft image, and
 * without a word of explanation that reads as poor quality rather than as
 * the limit of what the data holds.
 */
export function TimelinePanel() {
  const { enabled, date, layerId, opacity, toggle, setDate, setLayer, setOpacity } = useTimelineStore();
  const zoom = useMapStore((s) => s.zoom);
  const requestCamera = useMapStore((s) => s.requestCamera);

  const [index, setIndex] = useState(() => Math.max(0, STOPS.indexOf(date)));

  useEffect(() => {
    const stop = STOPS[index];
    if (stop) setDate(stop);
  }, [index, setDate]);

  const layer = GIBS_LAYERS.find((l) => l.id === layerId) ?? GIBS_LAYERS[0]!;
  const tooClose = zoom > USEFUL_MAX_ZOOM;

  return (
    <div className="timeline">
      <label className="timeline__toggle">
        <input type="checkbox" checked={enabled} onChange={toggle} />
        <span>
          <strong>🕰️ Historical imagery</strong>
          <span className="timeline__status">{enabled ? `Showing ${date}` : "Off"}</span>
        </span>
      </label>

      {enabled && (
        <>
          <div className="timeline__slider">
            <input
              type="range"
              min={0}
              max={STOPS.length - 1}
              step={1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label="Imagery date"
            />
            <div className="timeline__scale" aria-hidden="true">
              <span>{formatStop(STOPS[0]!)}</span>
              <strong>{date}</strong>
              <span>{formatStop(STOPS[STOPS.length - 1]!)}</span>
            </div>
          </div>

          <div className="timeline__layers" role="group" aria-label="Imagery type">
            {GIBS_LAYERS.map((l) => (
              <button key={l.id} type="button" className={l.id === layerId ? "active" : ""} onClick={() => setLayer(l.id)} aria-pressed={l.id === layerId}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="timeline__blurb">{layer.blurb}</p>

          <label className="timeline__opacity">
            <span>
              Blend with current map <strong>{Math.round(opacity * 100)}%</strong>
            </span>
            <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
          </label>

          {tooClose && (
            <div className="timeline__warning">
              <p>
                You&apos;re zoomed in past what this imagery holds — it&apos;s 250 m per pixel, so at this zoom you&apos;re looking at
                an enlargement, not more detail.
              </p>
              <button type="button" onClick={() => requestCamera({ zoom: USEFUL_MAX_ZOOM - 1 })}>
                Zoom out to full detail
              </button>
            </div>
          )}

          <p className="timeline__note">
            NASA GIBS / MODIS Terra, 250 m per pixel, daily since 2000. Good for reservoirs, coastlines, vegetation, burn scars and
            large-scale urban growth across years. It cannot show individual buildings or streets — that needs commercial
            high-resolution archive imagery, which has no free source.
          </p>
        </>
      )}
    </div>
  );
}
