import { useState } from "react";
import { AsyncPanel } from "@/components/AsyncPanel";
import { TrustBadge } from "@/components/TrustBadge";
import { useGisEvidence } from "./useGisEvidence";
import { totalEvidenceCount } from "./evidenceTotal";
import type { GISEvidence } from "@/types/gis";
import "./GISEvidencePanel.css";

const SCORE_LABELS: Record<keyof GISEvidence["scores"], string> = {
  commercial: "Commercial",
  residential: "Residential",
  institutional: "Institutional",
  industrial: "Industrial",
  landmark: "Landmark",
  transport: "Transport",
};

export function GISEvidencePanel() {
  const query = useGisEvidence();
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div className="gis-evidence-panel">
      <div className="gis-evidence-panel__head">
        <h2>GIS Evidence</h2>
      </div>

      <AsyncPanel
        query={query}
        label="GIS evidence"
        idleMessage="Select a location to load GIS evidence."
        isEmpty={(e) => totalEvidenceCount(e.counts) === 0}
        emptyMessage="No mapped features found within this radius. Try a larger radius or a more built-up location."
      >
        {(evidence) => (
          <>
            <div className="gis-evidence-panel__trust">
              <TrustBadge trust={evidence.trust} />
              <span>within {evidence.radiusMeters}m</span>
            </div>

            <div className="gis-evidence-panel__scores">
              {(Object.entries(evidence.scores) as Array<[keyof GISEvidence["scores"], number]>).map(([key, value]) => (
                <div key={key} className="gis-evidence-panel__score">
                  <span>{SCORE_LABELS[key]}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <dl className="gis-evidence-panel__counts">
              <div>
                <dt>Buildings</dt>
                <dd>{evidence.counts.buildings}</dd>
              </div>
              <div>
                <dt>Shops</dt>
                <dd>{evidence.counts.shops}</dd>
              </div>
              <div>
                <dt>Offices</dt>
                <dd>{evidence.counts.offices}</dd>
              </div>
              <div>
                <dt>Residential</dt>
                <dd>{evidence.counts.residential}</dd>
              </div>
              <div>
                <dt>Industrial</dt>
                <dd>{evidence.counts.industrial}</dd>
              </div>
              <div>
                <dt>Institutional</dt>
                <dd>{evidence.counts.institutional}</dd>
              </div>
              <div>
                <dt>Tourism/Landmarks</dt>
                <dd>{evidence.counts.tourism}</dd>
              </div>
              <div>
                <dt>Transit</dt>
                <dd>{evidence.counts.transport}</dd>
              </div>
            </dl>

            <button type="button" className="gis-evidence-panel__why-toggle" onClick={() => setShowWhy((v) => !v)}>
              {showWhy ? "Hide" : "Why this result?"}
            </button>

            {showWhy && (
              <div className="gis-evidence-panel__why">
                <p>
                  Scores are computed from real, currently-mapped OpenStreetMap features within {evidence.radiusMeters}m — shops and
                  offices weight toward commercial, residential buildings and landuse toward residential, schools/hospitals/civic
                  buildings toward institutional, tourism features (attractions, monuments, museums, hotels) toward landmark, and
                  railway/bus/transit features toward transport.
                </p>
                <p>
                  <strong>Confidence:</strong> {evidence.trust === "verified" ? "based on live provider data" : "limited by sparse mapping in this area"}
                </p>
                <p>
                  <strong>Source:</strong> {evidence.source}, fetched {new Date(evidence.fetchedAt).toLocaleTimeString()}
                </p>
                <p className="gis-evidence-panel__limitation">
                  Limitation: OpenStreetMap coverage varies by area — sparse mapping can under-count real features.
                </p>
              </div>
            )}
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
