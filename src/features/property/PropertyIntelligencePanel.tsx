import { TrustBadge } from "@/components/TrustBadge";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { useLocationStore } from "@/stores/locationStore";
import { analyzeProperty } from "./propertyAnalyzer";
import { usePropertySite } from "./usePropertySite";
import type { PropertyAnalysis } from "@/types/gis";
import "./PropertyIntelligencePanel.css";

/**
 * What kind of property is at the selected point.
 *
 * Two lookups: the building at the EXACT point (/api/property), which
 * decides the answer, and the area around it (/api/gis), which is shown as
 * context. See propertyAnalyzer.ts for the order of evidence.
 */
export function PropertyIntelligencePanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const site = usePropertySite();
  const area = useGisEvidence();

  if (!location) {
    return (
      <div className="property-panel">
        <h2>Property Intelligence</h2>
        <p className="property-panel__status">Select a location to see what kind of property is there.</p>
      </div>
    );
  }

  if (site.isPending) {
    return (
      <div className="property-panel">
        <h2>Property Intelligence</h2>
        <p className="property-panel__status" role="status">
          <span className="async-panel__spinner" aria-hidden="true" /> Checking the building at this exact point…
        </p>
      </div>
    );
  }

  // The building lookup failed: read the area, said as such, with a way to try again.
  const siteFailed = site.isError;
  if (siteFailed && !area.data) {
    return (
      <div className="property-panel">
        <h2>Property Intelligence</h2>
        <p className="property-panel__status" role="alert">
          The building at this point could not be checked just now{area.isError ? ", and neither could the area around it" : ""}.
        </p>
        <button type="button" className="property-panel__retry" onClick={() => void site.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const analysis = analyzeProperty(area.data ?? null, site.data ?? null);
  return (
    <div className="property-panel">
      <h2>Property Intelligence</h2>
      {siteFailed && (
        <p className="property-panel__notice" role="status">
          The building at this exact point could not be checked, so this reads the area around it.{" "}
          <button type="button" className="property-panel__link-button" onClick={() => void site.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!siteFailed && site.data?.incomplete && (
        <p className="property-panel__notice" role="status">
          The map server's answer was cut short, so something mapped here may be missing.{" "}
          <button type="button" className="property-panel__link-button" onClick={() => void site.refetch()}>
            Try again
          </button>
        </p>
      )}
      <PropertyResult analysis={analysis} dataAsOf={site.data?.dataAsOf ?? null} point={{ lat: location.lat, lon: location.lon }} />
    </div>
  );
}

function heightText(analysis: PropertyAnalysis): string {
  const b = analysis.building;
  if (!b || b.heightMeters === null) return "Not mapped";
  return b.heightSource === "mapped" ? `${b.heightMeters} m (as mapped)` : `About ${b.heightMeters} m (${b.levels} floors × 3.2 m)`;
}

/** OpenStreetMap's editor, opened on this building: "https://www.openstreetmap.org/way/1" -> ".../edit?way=1". */
export function osmEditUrl(osmUrl: string): string | null {
  const m = /^https:\/\/www\.openstreetmap\.org\/(way|relation)\/(\d+)$/.exec(osmUrl);
  return m ? `https://www.openstreetmap.org/edit?${m[1]}=${m[2]}` : null;
}

/**
 * Street-level photos of the point, to check by eye what the map cannot say.
 * Mapillary, because its photos are openly licensed and may be used to add
 * what they show to OpenStreetMap, which the link below this one invites.
 */
export const mapillaryUrl = (p: { lat: number; lon: number }) =>
  `https://www.mapillary.com/app/?lat=${p.lat.toFixed(6)}&lng=${p.lon.toFixed(6)}&z=18`;

export function PropertyResult({
  analysis,
  dataAsOf,
  point,
}: {
  analysis: PropertyAnalysis;
  dataAsOf: string | null;
  /** The chosen point, for the street-photo link. */
  point?: { lat: number; lon: number } | null;
}) {
  const b = analysis.building;
  /*
    When nothing on the map says what this building is for (Unknown, or only
    inferred from the land or its name), whoever knows can say so where it
    counts: on OpenStreetMap, for everyone. Once added, the next lookup reads
    it from the building itself, as Verified.
  */
  const editUrl = b && analysis.trust !== "verified" ? osmEditUrl(b.osmUrl) : null;
  // The building card says these two; the list keeps everything else.
  const lines = b ? analysis.evidence.filter((line) => !/^(Building|Height):/.test(line) && line !== analysis.surroundings) : analysis.evidence;

  return (
    <>
      <div className="property-panel__headline">
        <span className="property-panel__classification">{analysis.classification.toUpperCase()}</span>
        <TrustBadge trust={analysis.trust} />
      </div>

      {/*
        No bar and no number when nothing was classified. This used to draw
        an empty bar labelled "Confidence 0%", which reads as a measurement
        when nothing was measured.
      */}
      {analysis.trust === "unavailable" ? (
        <p className="property-panel__confidence-none">Confidence unavailable: nothing mapped here says what this property is used for.</p>
      ) : (
        <div className="property-panel__confidence">
          <div className="property-panel__confidence-bar" aria-hidden="true">
            <div className="property-panel__confidence-fill" style={{ width: `${analysis.confidence}%` }} />
          </div>
          <span>Confidence {analysis.confidence}%</span>
        </div>
      )}

      <p className="property-panel__reasoning">{analysis.reasoning}</p>

      {b && (
        <dl className="property-panel__facts" aria-label="The building at this point">
          <div>
            <dt>Building</dt>
            <dd>
              {b.name ? `${b.name}, ` : ""}
              {b.kind}
              {!b.containsPoint && ` (${b.distanceMeters} m from the point)`}
            </dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{heightText(analysis)}</dd>
          </div>
          <div>
            <dt>Floors</dt>
            <dd>{b.levels !== null ? b.levels : "Not mapped"}</dd>
          </div>
          {b.footprintM2 > 0 && (
            <div>
              <dt>Footprint</dt>
              <dd>{b.footprintM2.toLocaleString()} m²</dd>
            </div>
          )}
          {b.address && (
            <div>
              <dt>Address on the map</dt>
              <dd>{b.address}</dd>
            </div>
          )}
        </dl>
      )}

      {lines.length > 0 && (
        <ul className="property-panel__evidence">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {((analysis.links && analysis.links.length > 0) || point) && (
        <div className="property-panel__check">
          <span>Check it yourself:</span>
          <ul>
            {analysis.links?.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} ↗
                </a>
              </li>
            ))}
            {point && (
              <li>
                <a href={mapillaryUrl(point)} target="_blank" rel="noopener noreferrer">
                  Street photos of this spot on Mapillary ↗
                </a>
              </li>
            )}
          </ul>
        </div>
      )}

      {editUrl && (
        <p className="property-panel__edit">
          Know what this building is used for?{" "}
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            Add it on OpenStreetMap ↗
          </a>{" "}
          (a free account). The next lookup reads it from the building itself, usually within the hour.
        </p>
      )}

      {analysis.surroundings && <p className="property-panel__surroundings">{analysis.surroundings}</p>}

      <details className="property-panel__why">
        <summary>How is this worked out?</summary>
        <p>
          The answer comes from the building at the exact point you chose: the one whose outline on OpenStreetMap
          contains the point, or whose wall is within 10 m of it. The rest of the area never changes it.
        </p>
        <p>
          Strongest first: the building's own type (for example an office building or an apartment building) and any
          business tagged on it, 90%; businesses mapped inside it, 80%; the land or campus it stands on, 60 to 70%, or
          50% when that land is drawn as one large zone over a whole neighbourhood; a telling word in its name, 45%.
          Homes with shops or offices mapped inside are Mixed Use. A tap next to a wall rather than inside it counts 15
          points less. Where there is no building, the land itself is read: a park or a sports ground is Open Space,
          farmland is Agricultural. When nothing on the map is about the building at all, it looks further: what the
          neighbourhood suggests (35% at most), then the land use mapped within 800 m (25 to 30%), and lists the nearest
          mapped places.
        </p>
        <p>
          If even that finds nothing, the building is shown as Residential by default, because most buildings are homes:
          30% for a house-sized footprint, less for bigger ones, and always labelled as a default rather than a finding.
          Verified means OpenStreetMap says it about this building. Inferred means it was worked out from the land, the
          name, the area or that default.
        </p>
      </details>

      <ul className="property-panel__limits" aria-label="Limitations">
        {analysis.limitations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <p className="property-panel__sources">
        Sources: {analysis.sources.join(", ")}.
        {dataAsOf ? ` Map data as of ${new Date(dataAsOf).toLocaleDateString([], { dateStyle: "medium" })}.` : ""} Checked{" "}
        {new Date(analysis.retrievedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.
      </p>
    </>
  );
}
