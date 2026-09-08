import { useState, type CSSProperties } from "react";
import { LAYER_DEFS, LAYER_GROUPS } from "./layerBuckets";
import { useGisUiStore } from "@/stores/gisUiStore";
import type { GISLayerId } from "@/types/gis";
import "./GISLayerManager.css";

const LAYER_BY_ID = new Map(LAYER_DEFS.map((l) => [l.id, l]));

/**
 * Map data layers, grouped rather than listed flat.
 *
 * Every layer that existed before is still here and still individually
 * switchable — grouping is presentation, not a reduction in capability. What
 * changed is that the panel no longer opens as eighteen undifferentiated
 * checkboxes: each group says what it is for, shows how many of its layers
 * are on, and starts collapsed unless something in it is active.
 *
 * Layers the backend cannot populate yet stay visible but disabled, with the
 * reason on the row. Hiding them would be tidier and would quietly overstate
 * what the product does.
 */
export function GISLayerManager() {
  const visibility = useGisUiStore((s) => s.visibility);
  const opacity = useGisUiStore((s) => s.opacity);
  const toggleLayer = useGisUiStore((s) => s.toggleLayer);
  const setOpacity = useGisUiStore((s) => s.setOpacity);
  const resetLayers = useGisUiStore((s) => s.resetLayers);

  const activeCount = (ids: GISLayerId[]) => ids.filter((id) => visibility[id]).length;

  // A group opens by default when something inside it is switched on, so the
  // panel always shows what is currently affecting the map.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_GROUPS.map((g) => [g.id, g.layers.some((id) => id === "shops" || id === "buildings")]))
  );

  const totalActive = LAYER_DEFS.filter((l) => visibility[l.id]).length;

  return (
    <div className="layer-manager">
      <div className="layer-manager__head">
        <h3>Map data</h3>
        <div className="layer-manager__head-right">
          <span className="layer-manager__count">{totalActive} on</span>
          <button type="button" className="layer-manager__reset" onClick={resetLayers} title="Return to the layers shown by default">
            Reset
          </button>
        </div>
      </div>

      {LAYER_GROUPS.map((group) => {
        const active = activeCount(group.layers);
        const isOpen = openGroups[group.id] ?? false;

        return (
          <section key={group.id} className="layer-group">
            <button
              type="button"
              className="layer-group__toggle"
              aria-expanded={isOpen}
              onClick={() => setOpenGroups((s) => ({ ...s, [group.id]: !isOpen }))}
            >
              <span className="layer-group__chevron" aria-hidden="true">
                {isOpen ? "▾" : "▸"}
              </span>
              <span className="layer-group__title">
                <strong>{group.label}</strong>
                <span>{group.hint}</span>
              </span>
              {/* Stated in words, not as a coloured dot — the count has to be
                  readable without relying on colour. */}
              <span className="layer-group__count">{active > 0 ? `${active} on` : "off"}</span>
            </button>

            {isOpen && (
              <ul className="layer-manager__list">
                {group.layers.map((id) => {
                  const layer = LAYER_BY_ID.get(id);
                  if (!layer) return null;
                  return (
                    <li key={id} className={layer.available ? "" : "layer-manager__item--disabled"}>
                      <label>
                        <input
                          type="checkbox"
                          className="layer-manager__checkbox"
                          style={{ "--layer-color": layer.color } as CSSProperties}
                          checked={!!visibility[id]}
                          disabled={!layer.available}
                          onChange={() => toggleLayer(id)}
                        />
                        {layer.label}
                      </label>
                      <span className="layer-manager__meta" title={layer.description}>
                        {layer.available ? "OSM" : "Not yet"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <label className="layer-manager__opacity">
        <span title="How solid the layer marks are drawn on the map. Lower values let the map beneath show through.">Layer transparency</span>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          aria-label="Layer transparency"
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
      </label>

      <p className="layer-manager__source">Source: OpenStreetMap via the Overpass API, within the search area set above.</p>
    </div>
  );
}
