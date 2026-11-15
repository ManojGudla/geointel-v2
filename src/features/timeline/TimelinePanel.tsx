import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTimelineStore } from "@/stores/timelineStore";
import { useMapStore } from "@/stores/mapStore";
import { GIBS_LAYERS, timelineStops } from "./gibs";
import { fetchWaybackVersions } from "./wayback";
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
 * decade - genuinely striking, and genuinely free. It does not show new
 * buildings or new streets, and the panel says so rather than letting
 * someone conclude it from a blurry image. See gibs.ts.
 *
 * The zoom warning matters for the same reason: the layer keeps rendering
 * when you zoom past its resolution, just as an increasingly soft image, and
 * without a word of explanation that reads as poor quality rather than as
 * the limit of what the data holds.
 */
export function TimelinePanel() {
  const { enabled, source, date, layerId, opacity, toggle, setSource, setDate, setLayer, setOpacity } = useTimelineStore();
  const zoom = useMapStore((s) => s.zoom);
  const requestCamera = useMapStore((s) => s.requestCamera);

  const [index, setIndex] = useState(() => Math.max(0, STOPS.indexOf(date)));

  useEffect(() => {
    const stop = STOPS[index];
    if (stop) setDate(stop);
  }, [index, setDate]);

  const layer = GIBS_LAYERS.find((l) => l.id === layerId) ?? GIBS_LAYERS[0]!;
  const tooClose = zoom > USEFUL_MAX_ZOOM;
  const sharp = source === "sharp";

  return (
    <div className="timeline">
      <label className="timeline__toggle">
        <input type="checkbox" checked={enabled} onChange={toggle} />
        <span>
          <strong>🕰️ Historical imagery</strong>
          <span className="timeline__status">{enabled ? (sharp ? "Sharp photos, past versions" : `NASA, ${date}`) : "Off"}</span>
        </span>
      </label>

      {enabled && (
        <div className="timeline__layers timeline__source" role="group" aria-label="Which imagery">
          <button type="button" className={sharp ? "active" : ""} aria-pressed={sharp} onClick={() => setSource("sharp")}>
            Sharp, since 2014
          </button>
          <button type="button" className={!sharp ? "active" : ""} aria-pressed={!sharp} onClick={() => setSource("nasa")}>
            NASA daily, since 2012
          </button>
        </div>
      )}

      {enabled && sharp && <SharpHistory opacity={opacity} setOpacity={setOpacity} />}

      {enabled && !sharp && (
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
                You&apos;re zoomed in past what this imagery holds. It&apos;s 250 m per pixel, so at this zoom you&apos;re looking at
                an enlargement, not more detail.
              </p>
              <button type="button" onClick={() => requestCamera({ zoom: USEFUL_MAX_ZOOM - 1 })}>
                Zoom out to full detail
              </button>
            </div>
          )}

          <p className="timeline__note">
            NASA GIBS / MODIS Terra, 250 m per pixel, daily since 2000. Good for reservoirs, coastlines, vegetation, burn scars and
            large-scale urban growth across years. It cannot show individual buildings or streets. That needs commercial
            high-resolution archive imagery, which has no free source.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Past versions of the satellite map, sharp enough to see buildings (Esri
 * World Imagery Wayback). The slider steps through the versions Esri has
 * published; each is labelled with its publication date, and the note says
 * plainly that this is not the date every photo in it was taken.
 */
function SharpHistory({ opacity, setOpacity }: { opacity: number; setOpacity: (o: number) => void }) {
  const release = useTimelineStore((s) => s.release);
  const setRelease = useTimelineStore((s) => s.setRelease);
  const versions = useQuery({ queryKey: ["wayback-versions"], queryFn: ({ signal }) => fetchWaybackVersions(signal), staleTime: 12 * 60 * 60 * 1000 });
  const list = versions.data ?? [];

  // Newest first, the first time the list arrives: switching the layer on
  // should show today's map, and moving back is the interesting direction.
  useEffect(() => {
    if (list.length && (release === null || !list.some((v) => v.release === release))) setRelease(list[list.length - 1]!.release);
  }, [list, release, setRelease]);

  if (versions.isLoading) return <p className="timeline__blurb">Loading the list of past versions…</p>;
  if (versions.isError || list.length === 0) {
    return (
      <div className="timeline__warning">
        <p>The list of past satellite map versions couldn&apos;t be loaded right now.</p>
        <button type="button" onClick={() => void versions.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const index = Math.max(0, list.findIndex((v) => v.release === release));
  const current = list[index]!;

  return (
    <>
      <div className="timeline__slider">
        <input
          type="range"
          min={0}
          max={list.length - 1}
          step={1}
          value={index}
          onChange={(e) => setRelease(list[Number(e.target.value)]!.release)}
          aria-label="Map version"
          aria-valuetext={`Version of ${current.date}`}
        />
        <div className="timeline__scale" aria-hidden="true">
          <span>{list[0]!.date.slice(0, 7)}</span>
          <strong>{current.date}</strong>
          <span>{list[list.length - 1]!.date.slice(0, 7)}</span>
        </div>
      </div>

      <label className="timeline__opacity">
        <span>
          Blend with current map <strong>{Math.round(opacity * 100)}%</strong>
        </span>
        <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
      </label>

      <p className="timeline__note">
        Esri World Imagery as it was published on {current.date}, {list.length} versions since {list[0]!.date.slice(0, 4)}. The
        photos in a version were taken on or before that date, at different times in different places, so two versions can
        show the same photo where nothing new was flown. Detail is good enough for buildings and streets in most cities.
      </p>
    </>
  );
}
