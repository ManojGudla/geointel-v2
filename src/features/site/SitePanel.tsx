import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { useLocationStore } from "@/stores/locationStore";
import { fetchSite, type SiteFeature, type SiteFeatureKind } from "@/services/site";
import { portalGroups } from "./portals";
import "./SitePanel.css";
import { track } from "@/services/analytics";

/**
 * Site and development.
 *
 * Two halves, and the split between them is the honest part of this feature.
 *
 * Above the line: what is actually here, queried live from OpenStreetMap.
 * Named roads, roads being built, building sites, construction areas, and land
 * recorded as awaiting development. All real, all attributable, all as current
 * as the last person to map this street.
 *
 * Below the line: where to go for the things no free dataset holds. Approved
 * site plans, building permits, cadastral parcels, plot-level zoning. Those
 * sit with land revenue departments and development authorities, and in India
 * every one of those portals wants a district, a tehsil and a village rather
 * than a coordinate. So this half is a directory of working links, labelled as
 * a handoff, not dressed up as a lookup.
 *
 * The temptation with a feature like this is to blur the two halves and let
 * people assume the app knows more than it does. Somebody deciding whether to
 * buy a plot is exactly the wrong person to mislead, so the headings say which
 * half is which and the copy under the links says plainly that they open at
 * the portal's front door.
 */

const FEATURE_META: Record<SiteFeatureKind, { icon: string; label: string; tone: string }> = {
  "road-works": { icon: "🚧", label: "Road under construction", tone: "build" },
  "road-proposed": { icon: "📐", label: "Road proposed", tone: "plan" },
  "building-site": { icon: "🏗️", label: "Building under construction", tone: "build" },
  "construction-area": { icon: "🧱", label: "Construction site", tone: "build" },
  brownfield: { icon: "🏚️", label: "Brownfield (previously developed)", tone: "plan" },
  greenfield: { icon: "🌱", label: "Greenfield (scheduled for development)", tone: "plan" },
};

/** OSM road classes, in the words a person would use. */
const ROAD_LABEL: Record<string, string> = {
  motorway: "Motorway",
  trunk: "Trunk road",
  primary: "Primary road",
  secondary: "Secondary road",
  tertiary: "Tertiary road",
  unclassified: "Minor road",
  residential: "Residential street",
  living_street: "Living street",
  pedestrian: "Pedestrian street",
  road: "Road",
};

const RADII = [
  { meters: 300, label: "300 m" },
  { meters: 600, label: "600 m" },
  { meters: 1200, label: "1.2 km" },
];

function FeatureRow({ f }: { f: SiteFeature }) {
  const meta = FEATURE_META[f.kind];
  return (
    <li className={`site__feature site__feature--${meta.tone}`}>
      <span className="site__feature-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="site__feature-text">
        <span className="site__feature-name">{f.name ?? meta.label}</span>
        <span className="site__feature-meta">
          {f.name ? meta.label : null}
          {/* `construction=motorway` is the difference between "a road is
              being built" and "a motorway is being built". Worth surfacing. */}
          {f.becoming ? `${f.name ? " · " : ""}will be a ${f.becoming.replace(/_/g, " ")}` : null}
          {f.operator ? ` · ${f.operator}` : null}
          {f.endDate ? ` · due ${f.endDate}` : null}
        </span>
      </span>
      <a
        className="site__feature-link"
        href={`https://www.openstreetmap.org/${f.osm}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        OSM
      </a>
    </li>
  );
}

export function SitePanel() {
  const location = useLocationStore((s) => s.selectedLocation);
  const [radius, setRadius] = useState(600);
  const [showAllRoads, setShowAllRoads] = useState(false);

  const query = useQuery({
    queryKey: ["site", location?.lat, location?.lon, radius],
    queryFn: ({ signal }) => fetchSite(location!.lat, location!.lon, radius, signal),
    enabled: !!location,
    staleTime: 10 * 60 * 1000,
  });

  // The links half does not depend on the query at all, so it renders even
  // when Overpass is having a bad day. That matters: someone who came here for
  // the land records portal should not be blocked by an unrelated outage.
  const groups = location
    ? portalGroups(
        location.lat,
        location.lon,
        location.address?.countryCode,
        location.address?.state ?? location.address?.district
      )
    : [];

  return (
    <div className="site">
      <section className="site__block">
        <div className="site__head">
          <h3 className="site__title">What is here, and what is being built</h3>
          <div className="site__radius" role="group" aria-label="Search radius">
            {RADII.map((r) => (
              <button
                key={r.meters}
                type="button"
                className={radius === r.meters ? "is-active" : ""}
                onClick={() => setRadius(r.meters)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <AsyncPanel
          query={query}
          label="Site and development"
          isEmpty={(d) => d.roads.length === 0 && d.features.length === 0}
          emptyMessage="OpenStreetMap has no named roads or development records mapped within this radius. That usually means the area is lightly mapped rather than empty."
          idleMessage="Choose a place to see its roads and development status."
        >
          {(data) => {
            const roads = showAllRoads ? data.roads : data.roads.slice(0, 12);
            return (
              <>
                <div className="site__counts">
                  <span>
                    <strong>{data.counts.roads}</strong> named road{data.counts.roads === 1 ? "" : "s"}
                  </span>
                  <span>
                    <strong>{data.counts.underConstruction}</strong> under construction
                  </span>
                  <span>
                    <strong>{data.counts.awaitingDevelopment}</strong> awaiting development
                  </span>
                </div>

                {data.features.length > 0 && (
                  <>
                    <h4 className="site__subtitle">Construction and development</h4>
                    <ul className="site__features">
                      {data.features.map((f) => (
                        <FeatureRow key={f.osm} f={f} />
                      ))}
                    </ul>
                  </>
                )}

                {data.roads.length > 0 && (
                  <>
                    <h4 className="site__subtitle">Road names</h4>
                    <ul className="site__roads">
                      {roads.map((r) => (
                        <li key={`${r.name}-${r.kind}`} className="site__road">
                          <span className="site__road-name">{r.name}</span>
                          <span className="site__road-meta">
                            {ROAD_LABEL[r.kind] ?? "Road"}
                            {r.ref ? ` · ${r.ref}` : ""}
                            {r.lanes ? ` · ${r.lanes} lanes` : ""}
                            {r.surface ? ` · ${r.surface.replace(/_/g, " ")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {data.roads.length > 12 && (
                      <button type="button" className="site__more" onClick={() => setShowAllRoads((v) => !v)}>
                        {showAllRoads ? "Show fewer" : `Show all ${data.roads.length} roads`}
                      </button>
                    )}
                  </>
                )}

                <p className="site__source">
                  Roads and construction status from{" "}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                    OpenStreetMap contributors
                  </a>
                  , within {data.radiusMeters} m of this point.
                </p>
              </>
            );
          }}
        </AsyncPanel>
      </section>

      {groups.length > 0 && (
        <section className="site__block">
          <h3 className="site__title">Site plans and land records</h3>
          {/*
            The honesty paragraph, and it earns its place.

            Without it this section reads as "here are your site plans", and
            the first person to click through and land on a dropdown asking for
            their tehsil will conclude the app is broken. Saying what the links
            are up front costs three lines and turns a broken promise into a
            useful signpost.
          */}
          <p className="site__caution">
            Approved site plans, building permits and plot boundaries are not in any free map dataset. They sit with
            land revenue departments and development authorities. These links open the right portal for this place, but
            almost all of them ask you to pick a district, tehsil and village rather than accepting coordinates, so they
            open at the front door and not at this plot.
          </p>

          {groups.map((group) => (
            <div key={group.title} className="site__group">
              <h4 className="site__subtitle">{group.title}</h4>
              <p className="site__blurb">{group.blurb}</p>
              <ul className="site__portals">
                {group.portals.map((p) => (
                  <li key={p.url}>
                    <a
                      className="site__portal"
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => track("portal_opened", { portal: p.label, group: group.title })}
                    >
                      <span className="site__portal-label">
                        {p.label}
                        <span className="site__portal-out" aria-hidden="true">
                          ↗
                        </span>
                      </span>
                      <span className="site__portal-note">{p.note}</span>
                      {p.caveat && <span className="site__portal-caveat">{p.caveat}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="site__source">
            Government portals were checked in September 2026. Several of them refuse connections from outside India, so
            a link that fails abroad may work perfectly on an Indian connection.
          </p>
        </section>
      )}
    </div>
  );
}
