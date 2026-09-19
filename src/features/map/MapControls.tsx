import { useMapStore, type Basemap } from "@/stores/mapStore";
import { useShow3D } from "./useShow3D";
import { ImageryDate } from "./ImageryDate";
import "./MapControls.css";

const BASEMAPS: Array<{ id: Basemap; label: string; note: string }> = [
  { id: "standard", label: "Standard", note: "Streets & labels" },
  { id: "satellite", label: "Satellite", note: "Aerial imagery" },
  { id: "dark", label: "Dark", note: "Low-light map" },
  { id: "terrain", label: "Terrain", note: "Relief & contours" },
];

/**
 * Basemap and 2D/3D, in the Layers section of the workspace rail.
 *
 * These floated over the map's top-left corner until the search box took
 * that spot permanently, and on a phone the four basemap buttons overflowed
 * their row and collided with the Copilot launcher. More to the point, map
 * settings scattered between a floating control and a panel is exactly the
 * "where is anything" problem the rail exists to end — so basemap, 3D and
 * the layer switches now share one home, with room to say what each option
 * actually gives you.
 */
export function MapControls() {
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  // Shared with the map toolbar's 3D button, so the two cannot drift into
  // meaning different things. See useShow3D for why turning it on moves the
  // camera as well as the mode.
  const { is3D, toggle: toggle3D } = useShow3D();

  return (
    <div className="map-controls">
      <div className="map-controls__group" role="group" aria-label="Basemap">
        {BASEMAPS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={basemap === b.id ? "active" : ""}
            onClick={() => setBasemap(b.id)}
            aria-pressed={basemap === b.id}
          >
            <span className="map-controls__label">{b.label}</span>
            <span className="map-controls__note">{b.note}</span>
          </button>
        ))}
      </div>

      {/* Only renders on the satellite basemap. It answers the "why does this
          look old" question at the exact control that raises it. */}
      <ImageryDate />

      {/* The label says what pressing it DOES, including the part people were
          not expecting — it moves the camera in as well as tilting it, because
          building outlines only load close up. Saying "switch to 3D" and then
          silently flying somewhere would be its own small surprise. */}
      <button
        type="button"
        className="map-controls__3d"
        onClick={toggle3D}
        aria-pressed={is3D}
        title={is3D ? "Flatten the map back to 2D" : "Tilt the map and zoom in far enough for building shapes to load"}
      >
        {is3D ? "🏙️ 3D is on: switch back to 2D" : "🏙️ Show 3D buildings"}
      </button>
    </div>
  );
}
