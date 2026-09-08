import { useLocationStore } from "@/stores/locationStore";
import "./RadiusSelector.css";

const PRESETS = [100, 250, 500, 1000, 2000, 5000];

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000}km` : `${meters}m`;
}

export function RadiusSelector() {
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const setRadiusMeters = useLocationStore((s) => s.setRadiusMeters);

  return (
    <div className="radius-selector">
      <span className="radius-selector__label">Analysis radius</span>
      <div className="radius-selector__presets" role="group" aria-label="Analysis radius">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className={radiusMeters === preset ? "active" : ""} onClick={() => setRadiusMeters(preset)}>
            {formatRadius(preset)}
          </button>
        ))}
      </div>
      <label className="radius-selector__custom">
        Custom
        <input
          type="number"
          min={10}
          max={5000}
          value={radiusMeters}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value > 0) setRadiusMeters(Math.min(5000, value));
          }}
        />
        m
      </label>
    </div>
  );
}
