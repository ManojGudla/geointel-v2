import { useGisUiStore } from "@/stores/gisUiStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useLiveLayerStore } from "@/stores/liveLayerStore";
import { useMapStore } from "@/stores/mapStore";
import "./ClearLayers.css";

/**
 * One press to get back to a plain map.
 *
 * Switching things off meant finding each one: data layers in one list,
 * historical imagery further down, live feeds below that, 3D at the top. A
 * visitor who had turned on imagery from 2026 at street zoom saw a smear of
 * 250 m pixels over the whole map, went looking for the switch and reported
 * the map as broken. This lists what is on and turns all of it off together.
 * The basemap and the selected place are left alone; files the person
 * imported are theirs and stay too.
 */
export function useActiveOverlays() {
  const gisOn = useGisUiStore((s) => Object.values(s.visibility).filter(Boolean).length);
  const history = useTimelineStore((s) => s.enabled);
  const live = useLiveLayerStore((s) => Object.values(s.enabled).filter(Boolean).length);
  const is3D = useMapStore((s) => s.is3D);
  const parts: string[] = [];
  if (gisOn) parts.push(`${gisOn} data layer${gisOn === 1 ? "" : "s"}`);
  if (history) parts.push("historical imagery");
  if (live) parts.push(`${live} live feed${live === 1 ? "" : "s"}`);
  if (is3D) parts.push("3D");
  return parts;
}

export function turnEverythingOff() {
  useGisUiStore.getState().hideAll();
  if (useTimelineStore.getState().enabled) useTimelineStore.getState().toggle();
  const live = useLiveLayerStore.getState();
  for (const [id, on] of Object.entries(live.enabled)) if (on) live.toggle(id as keyof typeof live.enabled);
  const map = useMapStore.getState();
  if (map.is3D) map.set3D(false);
}

export function ClearLayers() {
  const active = useActiveOverlays();
  if (active.length === 0) {
    return <p className="clear-layers clear-layers--plain">Plain map: nothing extra is switched on.</p>;
  }
  return (
    <div className="clear-layers">
      <p className="clear-layers__what">On now: {active.join(", ")}.</p>
      <button type="button" className="clear-layers__button" onClick={turnEverythingOff}>
        Turn everything off
      </button>
    </div>
  );
}
