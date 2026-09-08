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

              <div className="property-panel__confidence">
                <div className="property-panel__confidence-bar">
                  <div className="property-panel__confidence-fill" style={{ width: `${analysis.confidence}%` }} />
                </div>
                <span>Confidence {analysis.confidence}%</span>
              </div>

              <p className="property-panel__reasoning">{analysis.reasoning}</p>

              <ul className="property-panel__evidence">
                {analysis.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <p className="property-panel__sources">Sources: {analysis.sources.join(", ")}</p>
            </>
          );
        }}
      </AsyncPanel>
    </div>
  );
}
