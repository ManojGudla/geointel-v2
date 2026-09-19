import { useMapStore } from "@/stores/mapStore";
import { useShow3D } from "./useShow3D";
import { useBuildings3D, MIN_ZOOM_FOR_3D_BUILDINGS } from "./useBuildings3D";
import "./Buildings3DStatus.css";

/**
 * Says out loud what 3D buildings are doing.
 *
 * Reported as "the building elevation is not loading". The extrusion layer
 * was working; what was missing was any way to tell WHY nothing appeared.
 * Building footprints are only fetched at zoom 16 and closer (the query
 * returns full polygon geometry, which is far heavier than the point queries
 * elsewhere in the app, and extrusions are meaningless when zoomed out
 * anyway) — so pressing 3D from a city-wide view tilted the camera and
 * loaded nothing, with no explanation. Indistinguishable from broken.
 *
 * Coverage is the other half: OSM building outlines are excellent in some
 * places and absent in others, so "no buildings here" is a real, honest
 * answer that the app previously had no way of giving.
 */
export function Buildings3DStatus() {
  const is3D = useMapStore((s) => s.is3D);
  const zoom = useMapStore((s) => s.zoom);
  const bbox = useMapStore((s) => s.viewportBbox);
  // Same shared behaviour as the toolbar and the basemap panel: this prompt
  // appears precisely when nothing is showing, so it of all three must land
  // the user somewhere buildings actually load.
  const { toggle: toggle3D } = useShow3D();
  const requestCamera = useMapStore((s) => s.requestCamera);

  // Same arguments as MapView's own call, so React Query serves both from a
  // single request rather than fetching this heavy query twice.
  const query = useBuildings3D(bbox, zoom, is3D);

  const tooFarOut = zoom < MIN_ZOOM_FOR_3D_BUILDINGS;
  const count = query.data?.length ?? 0;

  let tone: "off" | "wait" | "error" | "empty" | "ok" = "ok";
  let message = "";
  let action: { label: string; run: () => void } | null = null;

  if (!is3D) {
    tone = "off";
    message = "3D buildings are off. Turn on 3D to see building shapes with real heights.";
    action = { label: "Turn on 3D", run: toggle3D };
  } else if (tooFarOut) {
    tone = "wait";
    message = `Zoom in to load buildings. Shapes load at zoom ${MIN_ZOOM_FOR_3D_BUILDINGS} and closer. You're at zoom ${zoom.toFixed(1)}.`;
    action = { label: "Zoom to buildings", run: () => requestCamera({ zoom: MIN_ZOOM_FOR_3D_BUILDINGS + 0.5, pitch: 55 }) };
  } else if (query.isFetching) {
    tone = "wait";
    message = "Loading building outlines for this view…";
  } else if (query.isError) {
    tone = "error";
    message = "Building outlines couldn't be loaded. The OpenStreetMap query service didn't respond.";
    action = { label: "Try again", run: () => void query.refetch() };
  } else if (count === 0) {
    tone = "empty";
    message = "No building outlines are mapped in this area of OpenStreetMap. Coverage varies by city.";
  } else {
    tone = "ok";
    message = `${count.toLocaleString()} buildings. Heights come from OpenStreetMap where tagged, and are estimated by building type where they aren't.`;
  }

  return (
    <div className={`buildings-status buildings-status--${tone}`}>
      <p className="buildings-status__text">{message}</p>
      {action && (
        <button type="button" className="buildings-status__action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
