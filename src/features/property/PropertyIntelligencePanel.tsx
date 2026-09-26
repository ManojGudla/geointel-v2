import { AsyncPanel } from "@/components/AsyncPanel";
import { TrustBadge } from "@/components/TrustBadge";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { analyzeProperty } from "./propertyAnalyzer";
import "./PropertyIntelligencePanel.css";

export function PropertyIntelligencePanel() {
  const query = useGisEvidence();

  return (
    <div className="property-panel">
      <h2>Property Intelligence</h2>
      <AsyncPanel query={query} label="Property intelligence" idleMessage="Select a location to see property intelligence.">
        {(evidence) => {
          const analysis = analyzeProperty(evidence);
          return (
            <>
              <div className="property-panel__headline">
                <span className="property-panel__classification">{analysis.classification.toUpperCase()}</span>
                <TrustBadge trust={analysis.trust} />
              </div>

              {/*
                No bar and no number when nothing was classified. This used to
                draw an empty bar labelled "Confidence 0%", which reads as a
                measurement when nothing was measured.
              */}
              {analysis.trust === "unavailable" ? (
                <p className="property-panel__confidence-none">Confidence unavailable: there is not enough mapped evidence to classify this spot.</p>
              ) : (
                <div className="property-panel__confidence">
                  <div className="property-panel__confidence-bar" aria-hidden="true">
                    <div className="property-panel__confidence-fill" style={{ width: `${analysis.confidence}%` }} />
                  </div>
                  <span>Confidence {analysis.confidence}%</span>
                </div>
              )}

              <p className="property-panel__reasoning">{analysis.reasoning}</p>

              <ul className="property-panel__evidence">
                {analysis.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <details className="property-panel__why">
                <summary>How is this worked out?</summary>
                <p>
                  Everything comes from OpenStreetMap features within {evidence.radiusMeters} m, read live from Overpass.
                  Features nearer the point count for more than distant ones.
                </p>
                <p>
                  If a building or business is mapped at the point itself, that is what the classification describes, and
                  confidence starts at 70%. It rises towards 95% the more the surrounding area agrees with it, and stays
                  nearer 70-80% where the area points another way.
                </p>
                <p>
                  If nothing is mapped at the point, the answer describes the surrounding area instead and confidence is
                  capped at 60%, however much evidence there is, because a guess from context is never as good as reading
                  the building's own label.
                </p>
              </details>

              <ul className="property-panel__limits" aria-label="Limitations">
                {analysis.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <p className="property-panel__sources">
                Sources: {analysis.sources.join(", ")}. Data retrieved{" "}
                {new Date(analysis.retrievedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.
              </p>
            </>
          );
        }}
      </AsyncPanel>
    </div>
  );
}
