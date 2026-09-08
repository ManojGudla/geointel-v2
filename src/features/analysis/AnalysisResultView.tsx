import { useEffect, useRef } from "react";
import { useAnalysisStore } from "@/stores/analysisStore";
import { formatDistance } from "@/features/measure/measureMath";
import "./SpatialAnalysisPanel.css";

/**
 * Renders whatever analysis is currently live.
 *
 * Shared by the Tools panel's controls and the AI command bar rather than
 * duplicated, because the two are answering the same question by different
 * routes — if they rendered results separately they would eventually drift,
 * and a user who asked the same thing twice would get two presentations of
 * one answer.
 */
export function AnalysisResultView() {
  const result = useAnalysisStore((s) => s.result);
  const ref = useRef<HTMLDivElement>(null);

  // With the controls above it, a result on a short panel can land entirely
  // below the fold — the analysis runs, the map updates, and the numbers
  // appear somewhere the user has to go looking for. Bring them into view.
  useEffect(() => {
    if (result) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  if (!result) return null;

  return (
    <div className="analysis__result" ref={ref}>
      <h4 className="analysis__result-title">{result.title}</h4>

      {result.suitability && (
        <div className={`analysis__score analysis__score--${result.suitability.band.toLowerCase()}`}>
          <strong>{result.suitability.score}</strong>
          <span>/ 100 · {result.suitability.band}</span>
        </div>
      )}

      {/* What this analysis changed on the map. Shown because an analysis
          that silently switches layers on leaves the user unsure whether
          what they're seeing is their own selection or the tool's. */}
      {result.layersUsed && result.layersUsed.length > 0 && (
        <p className="analysis__layers-used">
          <strong>Layers switched on:</strong> {result.layersUsed.join(", ")}
        </p>
      )}

      <dl className="analysis__stats">
        {result.stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {result.suitability && (
        <ul className="analysis__factors">
          {result.suitability.factors.map((factor) => (
            <li key={factor.id}>
              <div className="analysis__factor-head">
                <span>{factor.label}</span>
                <strong>{factor.score}</strong>
              </div>
              <div className="analysis__bar" aria-hidden="true">
                <span style={{ width: `${factor.score}%` }} />
              </div>
              {/* The basis line is not optional decoration: it's what lets
                  someone check the number instead of trusting it. */}
              <p className="analysis__factor-basis">
                {factor.basis} · weight {factor.weight}%
              </p>
            </li>
          ))}
        </ul>
      )}

      {result.points.length > 0 && result.kind !== "suitability" && (
        <ol className="analysis__list">
          {result.points.slice(0, 25).map((point) => (
            <li key={point.id}>
              <span>{point.label}</span>
              <strong>{formatDistance(point.distanceMeters)}</strong>
            </li>
          ))}
        </ol>
      )}

      <p className="analysis__note">{result.note}</p>
    </div>
  );
}
