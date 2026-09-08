import { LAYER_DEFS } from "./layerBuckets";
import { useGisUiStore } from "@/stores/gisUiStore";
import "./GISLayerManager.css";

export function GISLayerManager() {
  const visibility = useGisUiStore((s) => s.visibility);
  const opacity = useGisUiStore((s) => s.opacity);
  const toggleLayer = useGisUiStore((s) => s.toggleLayer);
  const setOpacity = useGisUiStore((s) => s.setOpacity);

  return (
    <div className="layer-manager">
      <h3>GIS Layers</h3>
      <ul className="layer-manager__list">
        {LAYER_DEFS.map((layer) => (
          <li key={layer.id} className={layer.available ? "" : "layer-manager__item--disabled"}>
            <label>
              <input
                type="checkbox"
                checked={!!visibility[layer.id]}
                disabled={!layer.available}
                onChange={() => toggleLayer(layer.id)}
              />
              <span className="layer-manager__swatch" style={{ background: layer.color }} aria-hidden="true" />
              {layer.label}
            </label>
            <span className="layer-manager__meta" title={layer.description}>
              {layer.available ? "OSM" : "Soon"}
            </span>
          </li>
        ))}
      </ul>

      <label className="layer-manager__opacity">
        Layer opacity
        <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
      </label>

      <p className="layer-manager__source">Source: OpenStreetMap / Overpass API</p>
    </div>
  );
}
