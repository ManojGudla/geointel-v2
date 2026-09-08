import { useMapStore } from "@/stores/mapStore";
import { useShellStore } from "@/stores/shellStore";
import { MIN_ZOOM_FOR_3D_BUILDINGS } from "./useBuildings3D";

/**
 * The one behaviour behind every "3D" control in the app.
 *
 * There are three of them — the map toolbar, the basemap panel, and the
 * prompt inside the buildings readout — and until this existed they did two
 * different things. The panel's switch only tilted the camera, which from a
 * city-wide view produced a slanted map and nothing else, because building
 * footprints are only fetched at zoom 16 and closer. The polygon query is
 * far heavier than the point queries elsewhere in the app and extruding a
 * whole city at zoom 12 would be a download nobody asked for, so that floor
 * is right. What was wrong was pressing a button labelled 3D and getting a
 * result indistinguishable from broken.
 *
 * So turning 3D on does both halves of what the label promises: the mode
 * goes on and the camera goes to a height where the buildings exist. If the
 * view is already closer than that, the zoom is left alone rather than
 * pulled back.
 *
 * Two details worth keeping:
 *
 * - The pitch is named in the camera request even though the map's own is3D
 *   effect also eases to 55°. Left unset, the request carries the CURRENT
 *   pitch — zero, at the moment 3D goes on — and the two animations fight.
 * - Turning 3D off issues no camera request at all. The is3D effect flattens
 *   the pitch on its own, and a competing request would only re-introduce
 *   the same race in the other direction.
 */
export function useShow3D(): { is3D: boolean; toggle: () => void } {
  const is3D = useMapStore((s) => s.is3D);
  const set3D = useMapStore((s) => s.set3D);
  const zoom = useMapStore((s) => s.zoom);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const openSection = useShellStore((s) => s.openSection);

  const toggle = () => {
    if (is3D) {
      set3D(false);
      return;
    }
    set3D(true);
    requestCamera({ zoom: Math.max(zoom, MIN_ZOOM_FOR_3D_BUILDINGS + 0.5), pitch: 55 });
    // Opens Map data, where the buildings readout says how many loaded, or
    // why none did — OSM coverage varies by city and "nothing appeared, with
    // no explanation" is the failure this whole thing exists to end. Already
    // open on that section (the desktop default) and this changes nothing.
    openSection("layers");
  };

  return { is3D, toggle };
}
