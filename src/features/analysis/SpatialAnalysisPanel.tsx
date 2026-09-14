import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useAnalysisStore } from "@/stores/analysisStore";
import { useRunAnalysis } from "./useRunAnalysis";
import { factorLabel, SUITABILITY_PRESETS } from "./suitability";
import { CATEGORY_LABELS } from "./categories";
import { AnalysisResultView } from "./AnalysisResultView";
import { formatDistance } from "@/features/measure/measureMath";
import type { NearbyCategory } from "@/types/intel";
import "./SpatialAnalysisPanel.css";

type Operation = "buffer" | "within" | "nearest" | "suitability";

const OPERATIONS: Array<{ id: Operation; label: string; blurb: string }> = [
  { id: "buffer", label: "Buffer", blurb: "Draw a ring at a set distance and count what falls inside it." },
  { id: "within", label: "Within", blurb: "Find every place of one kind inside a distance." },
  { id: "nearest", label: "Nearest", blurb: "Find the closest one, with its distance and direction." },
  { id: "suitability", label: "Suitability", blurb: "Score this site for a use, from weighted mapped evidence." },
];

const CATEGORIES = CATEGORY_LABELS;

const DISTANCES = [500, 1000, 2000, 5000, 10000];

/**
 * The GIS operations that separate this from a place-search app: buffer,
 * within, nearest and weighted site suitability.
 *
 * All four run on data the app already fetches — /api/nearby for features
 * with distances, /api/gis for the evidence counts — so nothing here adds a
 * new backend endpoint or a new load on the volunteer-run Overpass mirrors
 * beyond queries that are already cached for six hours.
 */
export function SpatialAnalysisPanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const { result, status, error, clear } = useAnalysisStore();
  const run = useRunAnalysis();

  const [operation, setOperation] = useState<Operation>("within");
  const [category, setCategory] = useState<NearbyCategory>("hospitals");
  const [distance, setDistance] = useState(2000);
  const [presetId, setPresetId] = useState(SUITABILITY_PRESETS[0]!.id);
  const [weights, setWeights] = useState<Record<string, number>>(SUITABILITY_PRESETS[0]!.weights);

  const choosePreset = (id: string) => {
    const next = SUITABILITY_PRESETS.find((p) => p.id === id)!;
    setPresetId(id);
    setWeights(next.weights);
  };

  const submit = async () => {
    if (!location) return;
    // Errors are already recorded in the store by the shared runner, which
    // is what renders them below — nothing to do here but not crash.
    await run({
      operation,
      origin: { lat: location.lat, lon: location.lon },
      radiusMeters: operation === "nearest" ? 10_000 : distance,
      category,
      presetId,
      weights,
    }).catch(() => undefined);
  };

  /*
    An answer outranks the empty state, and the order these two were checked
    in was the whole bug.

    askTheMap() in SearchBar deliberately runs from the centre of the map when
    nothing is selected — that is exactly what makes "schools within 1 km"
    work on the very first screen, before anyone has picked a place — and it
    then sends the user here, because its own comment says "the answer renders
    in Analyze, so that is where the user is taken". But this guard ran first
    and returned "Select a location", so the answer that had just been
    computed and stored was replaced by an instruction to do the thing the
    user had just done.

    Reported as: "after clicking anything it moves to analyse, and in analyse
    there is only the measurement and area tool." That is precisely right —
    the answer was there the whole time, behind this early return.
  */
  const hasAnswer = result !== null || status === "running" || status === "error";

  if (!location && !hasAnswer) {
    // An empty state is a teaching opportunity, not a locked door. It names
    // the two ways forward and what becomes possible afterwards, so someone
    // who lands here knows what they're missing out on rather than only
    // that something is unavailable.
    return (
      <div className="analysis__empty">
        <h4>Select a location</h4>
        <p>Search for a place at the top of the map, or click anywhere on the map to drop a point.</p>
        <p className="analysis__empty-then">Once you have, you can:</p>
        <ul>
          <li>Measure distances and areas</li>
          <li>Find what&apos;s nearby, or the nearest of something</li>
          <li>Draw a ring and count what falls inside it</li>
          <li>Score the site for a shop, clinic, school or warehouse</li>
        </ul>
      </div>
    );
  }

  const active = OPERATIONS.find((o) => o.id === operation)!;

  return (
    <div className="analysis">
      {/*
        Where the number came from. An analysis run from the map centre is a
        real answer, but it is an answer about a different point than the one
        somebody might assume, so it says so rather than letting the reader
        guess. It also names the one thing that is unavailable until a place
        is picked, which is running a new one from these controls.
      */}
      {!location && (
        <p className="analysis__origin-note">
          Measured from the <strong>centre of the map</strong>, because no place is selected yet. Search a place above, or
          click anywhere on the map, to analyse a specific point.
        </p>
      )}

      <div className="analysis__ops" role="group" aria-label="Analysis type">
        {OPERATIONS.map((op) => (
          <button key={op.id} type="button" className={operation === op.id ? "active" : ""} onClick={() => setOperation(op.id)} aria-pressed={operation === op.id}>
            {op.label}
          </button>
        ))}
      </div>
      <p className="analysis__blurb">{active.blurb}</p>

      {(operation === "within" || operation === "nearest") && (
        <label className="analysis__field">
          <span>Find</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as NearbyCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {operation === "suitability" && (
        <label className="analysis__field">
          <span>Assess for</span>
          <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
            {SUITABILITY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {operation !== "nearest" && (
        <label className="analysis__field">
          <span>{operation === "suitability" ? "Assessment radius" : "Distance"}</span>
          <select value={distance} onChange={(e) => setDistance(Number(e.target.value))}>
            {DISTANCES.map((d) => (
              <option key={d} value={d}>
                {formatDistance(d)}
              </option>
            ))}
          </select>
        </label>
      )}

      {operation === "suitability" && (
        <div className="analysis__weights">
          <h4>Weights — drag to match your own priorities</h4>
          {Object.entries(weights).map(([id, weight]) => (
            <label key={id} className="analysis__weight">
              <span className="analysis__weight-head">
                <span>{factorLabel(id)}</span>
                <strong>{weight}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={weight}
                onChange={(e) => setWeights((w) => ({ ...w, [id]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
      )}

      <div className="analysis__actions">
        {/* Disabled without a location rather than hidden: submit() already
            returns early in that case, and a button that silently does
            nothing is worse than one that explains why it can't. */}
        <button
          type="button"
          className="analysis__run"
          onClick={() => void submit()}
          disabled={status === "running" || !location}
          title={location ? undefined : "Pick a place on the map first"}
        >
          {status === "running" ? "Running…" : "Run analysis"}
        </button>
        {result && (
          <button type="button" className="analysis__clear" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {status === "error" && <p className="analysis__error">{error}</p>}

      {result && <AnalysisResultView />}
    </div>
  );
}
