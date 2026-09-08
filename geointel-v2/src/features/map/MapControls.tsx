import { useMapStore, type Basemap } from "@/stores/mapStore";
import "./MapControls.css";

const BASEMAPS: Array<{ id: Basemap; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "satellite", label: "Satellite" },
  { id: "dark", label: "Dark" },
  { id: "terrain", label: "Terrain" },
];

export function MapControls() {
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  const is3D = useMapStore((s) => s.is3D);
  const toggle3D = useMapStore((s) => s.toggle3D);

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
            {b.label}
          </button>
        ))}
      </div>

      <button type="button" className="map-controls__3d" onClick={toggle3D} aria-pressed={is3D} title="Toggle 2D / 3D perspective">
        {is3D ? "🧊 3D" : "▦ 2D"}
      </button>
    </div>
  );
}
