import { useMemo, useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useAirQuality } from "@/features/live/useLiveLayers";
import { useShellStore } from "@/stores/shellStore";
import { computeLocationIntelligence, scoreContributions } from "./locationIntelligence";
import "./LocationIntelligencePanel.css";

/**
 * The signature panel: one headline number for a place, and — one click
 * away — exactly what produced it.
 *
 * The "Why?" view is deliberately not hidden behind a tooltip or an info
 * icon. A score with no visible derivation is a number the user has to take
 * on faith, and this product's whole claim is that it doesn't ask for
 * faith. Every dimension shows its raw counts whether it scored well,
 * scored badly, or couldn't be scored at all.
 */
export function LocationIntelligencePanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const evidence = useGisEvidence();
  const air = useAirQuality();
  const openSection = useShellStore((s) => s.openSection);
  const [showWhy, setShowWhy] = useState(false);

  const intelligence = useMemo(
    () => (evidence.data ? computeLocationIntelligence({ evidence: evidence.data, europeanAqi: air.data?.europeanAqi ?? null }) : null),
    [evidence.data, air.data]
  );

  if (!location) return null;

  if (evidence.isLoading) {
    return (
      <section className="li">
        <h3 className="li__heading">Location Intelligence</h3>
        <p className="li__loading">Reading mapped features around this point…</p>
      </section>
    );
  }

  if (evidence.isError || !intelligence) {
    return (
      <section className="li">
        <h3 className="li__heading">Location Intelligence</h3>
        <p className="li__problem">
          We couldn&apos;t read the mapped features around this point, so there&apos;s nothing to score yet.
        </p>
        <button type="button" className="li__retry" onClick={() => void evidence.refetch()}>
          Try again
        </button>
      </section>
    );
  }

  const contributions = scoreContributions(intelligence);

  return (
    <section className="li">
      <div className="li__head">
        <h3 className="li__heading">Location Intelligence</h3>
        <span className={`li__confidence li__confidence--${intelligence.confidence.toLowerCase()}`} title={intelligence.confidenceReason}>
          {intelligence.confidence} confidence
        </span>
      </div>

      {intelligence.overall === null ? (
        <p className="li__insufficient">
          Not enough is mapped within {radiusMeters} m to produce an overall score. {intelligence.confidenceReason}
        </p>
      ) : (
        <div className={`li__score li__score--${intelligence.band?.toLowerCase()}`}>
          <strong>{intelligence.overall}</strong>
          <span>
            / 100
            <em>{intelligence.band}</em>
          </span>
        </div>
      )}

      <ul className="li__dimensions">
        {intelligence.dimensions.map((dimension) => (
          <li key={dimension.id} className={`li__dim li__dim--${dimension.state}`}>
            <div className="li__dim-head">
              <span className="li__dim-label" title={dimension.hint}>
                {dimension.label}
              </span>
              {/* Never colour alone: the state is spelled out in words too. */}
              <span className="li__dim-value">
                {dimension.state === "scored" ? dimension.score : dimension.state === "needs-choice" ? "Pick a use" : "No data"}
              </span>
            </div>
            {dimension.state === "scored" && (
              <div className="li__bar" aria-hidden="true">
                <span style={{ width: `${dimension.score}%` }} />
              </div>
            )}
            <p className="li__dim-basis">{dimension.basis}</p>
            {dimension.state === "needs-choice" && (
              <button type="button" className="li__dim-action" onClick={() => openSection("tools")}>
                Open suitability analysis
              </button>
            )}
          </li>
        ))}
      </ul>

      {intelligence.overall !== null && contributions.length > 0 && (
        <>
          <button type="button" className="li__why" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
            {showWhy ? "Hide the breakdown" : `Why ${intelligence.overall}?`}
          </button>

          {showWhy && (
            <div className="li__why-panel">
              <p className="li__why-lead">
                Each dimension pushes the score above or below the midpoint, weighted by how much it matters. Only the{" "}
                {intelligence.scoredCount} dimensions with real data are counted.
              </p>
              <ul className="li__contributions">
                {contributions.map((c) => (
                  <li key={c.label}>
                    <div className="li__contribution-head">
                      <span>{c.label}</span>
                      <strong className={c.points >= 0 ? "li__plus" : "li__minus"}>
                        {c.points >= 0 ? "+" : ""}
                        {c.points}
                      </strong>
                    </div>
                    <p>{c.basis}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="li__sources">
        Sources: {intelligence.sources.join(", ")} · measured within {radiusMeters} m · {intelligence.confidenceReason}
      </p>
    </section>
  );
}
