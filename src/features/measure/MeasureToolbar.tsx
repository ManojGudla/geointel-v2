import { useMeasure } from "./useMeasure";
import "./MeasureToolbar.css";

/**
 * Distance and area measurement, in the Tools section of the workspace rail.
 *
 * Distance mode: each click adds a waypoint and the running length updates
 * live. Area mode: each click adds a vertex; once 3+ vertices exist the
 * polygon closes automatically and the running area updates live. "Undo"
 * drops the last point, "Clear" resets, and picking a mode (or the same mode
 * again) starts a fresh measurement. Click handling and the on-map preview
 * live in MapView.tsx / measureStore.ts — this is pure UI + readout, which
 * is why it can be rendered inside a panel rather than over the map.
 */
export function MeasureToolbar() {
  const { mode, points, setMode, undoPoint, clear, distanceLabel, areaLabel } = useMeasure();

  return (
    <div className="measure-toolbar">
      <div className="measure-toolbar__modes" role="group" aria-label="Measurement tool">
        <button
          type="button"
          className={mode === "distance" ? "active" : ""}
          aria-pressed={mode === "distance"}
          onClick={() => setMode(mode === "distance" ? "off" : "distance")}
          title="Measure distance: click points on the map"
        >
          <span aria-hidden="true">📏</span>
          Distance
        </button>
        <button
          type="button"
          className={mode === "area" ? "active" : ""}
          aria-pressed={mode === "area"}
          onClick={() => setMode(mode === "area" ? "off" : "area")}
          title="Measure area: click points to draw a shape"
        >
          <span aria-hidden="true">▱</span>
          Area
        </button>
      </div>

      {mode !== "off" && (
        <div className="measure-toolbar__readout">
          <span className="measure-toolbar__value">
            {mode === "distance" ? distanceLabel : areaLabel}
          </span>
          <span className="measure-toolbar__hint">
            {points.length === 0
              ? "Click the map to start"
              : mode === "distance"
                ? `${points.length} point${points.length === 1 ? "" : "s"}`
                : points.length < 3
                  ? `${points.length} point${points.length === 1 ? "" : "s"}, need 3+ to close`
                  : `${points.length} point${points.length === 1 ? "" : "s"}`}
          </span>
          <div className="measure-toolbar__actions">
            <button type="button" onClick={undoPoint} disabled={points.length === 0} title="Remove last point">
              ↺ Undo
            </button>
            <button type="button" onClick={clear} disabled={points.length === 0} title="Clear all points">
              Clear
            </button>
            <button type="button" onClick={() => setMode("off")} title="Exit measuring">
              ✕ Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
