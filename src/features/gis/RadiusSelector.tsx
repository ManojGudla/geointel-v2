import { useLocationStore } from "@/stores/locationStore";
import "./RadiusSelector.css";

/**
 * Each preset carries what it MEANS, not just how far it is.
 *
 * "250 m" tells a surveyor everything and a first-time visitor nothing -
 * they have no idea whether that is a street or a suburb, so they have no
 * basis for choosing. The distance stays (professionals need the number)
 * and the meaning sits beside it, which is the whole beginner/expert
 * strategy in one control: never remove the precise thing, always explain
 * it.
 */
const PRESETS: Array<{ meters: number; meaning: string }> = [
  { meters: 100, meaning: "This block" },
  { meters: 250, meaning: "Immediate surroundings" },
  { meters: 500, meaning: "Short walk" },
  { meters: 1000, meaning: "Local area" },
  { meters: 2000, meaning: "Neighbourhood" },
  { meters: 5000, meaning: "Wider area" },
];

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

function meaningFor(meters: number): string {
  // Nearest preset at or below the value, so a custom 1500 m reads as
  // "Local area" rather than as nothing at all.
  const match = [...PRESETS].reverse().find((p) => meters >= p.meters);
  return match?.meaning ?? "Very close in";
}

export function RadiusSelector() {
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const setRadiusMeters = useLocationStore((s) => s.setRadiusMeters);

  return (
    <div className="radius-selector">
      <span
        className="radius-selector__label"
        title="How far out from the selected point maNOWj searches and analyses. The dashed circle on the map is this distance."
      >
        Search &amp; analysis area
      </span>

      <p className="radius-selector__current">
        <strong>{formatRadius(radiusMeters)}</strong>
        <span>{meaningFor(radiusMeters)} · shown as the dashed circle on the map</span>
      </p>

      <div className="radius-selector__presets" role="group" aria-label="Search and analysis area">
        {PRESETS.map((preset) => (
          <button
            key={preset.meters}
            type="button"
            className={radiusMeters === preset.meters ? "active" : ""}
            aria-pressed={radiusMeters === preset.meters}
            onClick={() => setRadiusMeters(preset.meters)}
            title={preset.meaning}
          >
            <span className="radius-selector__distance">{formatRadius(preset.meters)}</span>
            <span className="radius-selector__meaning">{preset.meaning}</span>
          </button>
        ))}
      </div>

      <label className="radius-selector__custom">
        Exact distance
        <input
          type="number"
          min={10}
          max={5000}
          value={radiusMeters}
          aria-label="Exact search and analysis distance in metres"
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
