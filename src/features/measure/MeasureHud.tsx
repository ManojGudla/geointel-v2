import { useMeasure } from "./useMeasure";
import "./MeasureHud.css";

/**
 * Live measurement readout pinned over the map.
 *
 * The controls themselves live in the Tools panel, which is where someone
 * goes looking for them. But while you are actually measuring, your eyes are
 * on the map and the panel may well be closed — so the running figure, the
 * point count and the two actions you need mid-measurement (undo, finish)
 * follow you here. It renders only while a measurement mode is active, so it
 * costs nothing the rest of the time.
 */
export function MeasureHud() {
  const { mode, points, undoPoint, clear, setMode, distanceLabel, areaLabel } = useMeasure();
  if (mode === "off") return null;

  const needsMorePoints = mode === "area" && points.length < 3;

  return (
    <div className="measure-hud" role="status" aria-live="polite">
      <div className="measure-hud__value">
        <span className="measure-hud__label">{mode === "distance" ? "Distance" : "Area"}</span>
        <strong>{mode === "distance" ? distanceLabel : areaLabel}</strong>
      </div>

      <p className="measure-hud__hint">
        {points.length === 0
          ? "Click the map to place your first point."
          : needsMorePoints
            ? `${points.length} of 3 points — one more closes the shape.`
            : `${points.length} point${points.length === 1 ? "" : "s"}. Click to add more.`}
      </p>

      <div className="measure-hud__actions">
        <button type="button" onClick={undoPoint} disabled={points.length === 0}>
          ↺ Undo
        </button>
        <button type="button" onClick={clear} disabled={points.length === 0}>
          Clear
        </button>
        <button type="button" className="measure-hud__done" onClick={() => setMode("off")}>
          ✓ Done
        </button>
      </div>
    </div>
  );
}
