import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { useLocationStore } from "@/stores/locationStore";
import {
  fetchSite,
  fetchConstructionNearby,
  WIDE_SEARCH_METERS,
  type SiteFeature,
  type SiteFeatureKind,
} from "@/services/site";
import { useMapStore } from "@/stores/mapStore";
import { useUiStore } from "@/stores/uiStore";
import { distanceMeters, formatDistance } from "@/features/map/geo";
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

type Point = { lat: number; lon: number };

/** "Oct 2026" from an OpenStreetMap edit time; null if it is missing or unreadable. */
export function formatUpdated(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Nearest first. Records with no position (rare) go last, in the order they came. */
export function nearestFirst(features: SiteFeature[], from: Point): Array<SiteFeature & { distance: number | null }> {
  return features
    .map((f) => ({ ...f, distance: f.lat !== undefined && f.lon !== undefined ? distanceMeters(from, { lat: f.lat, lon: f.lon }) : null }))
    .sort((x, y) => (x.distance ?? Infinity) - (y.distance ?? Infinity));
}

/**
 * One construction or development record.
 *
 * Two things to tap, and they are different on purpose. The row itself moves
 * the map to the site, because "where exactly is that" is the first question.
 * "Source" opens the record on OpenStreetMap, where its full tags, history and
 * editors are, because the second question is "says who".
 */
function FeatureRow({ f, distance }: { f: SiteFeature; distance: number | null }) {
  const meta = FEATURE_META[f.kind];
  const units = useUiStore((s) => s.units);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const updated = formatUpdated(f.updatedAt);
  const hasPosition = f.lat !== undefined && f.lon !== undefined;

  const show = () => {
    if (!hasPosition) return;
    requestCamera({ center: [f.lon!, f.lat!], zoom: 17 });
    track("place_opened", { source: "site-record", kind: f.kind });
  };

  const body = (
    <>
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
        <span className="site__feature-meta">
          {distance !== null ? `${formatDistance(distance, units)} away` : "Position not recorded"}
          {updated ? ` · updated on the map ${updated}` : ""}
        </span>
      </span>
    </>
  );

  return (
    <li className={`site__feature site__feature--${meta.tone}`}>
      {hasPosition ? (
        <button type="button" className="site__feature-go" onClick={show} title="Show this site on the map">
          {body}
        </button>
      ) : (
        <span className="site__feature-go site__feature-go--static">{body}</span>
      )}
      <a
        className="site__feature-link"
        href={`https://www.openstreetmap.org/${f.osm}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Source record for ${f.name ?? meta.label} on OpenStreetMap`}
      >
        Source ↗
      </a>
    </li>
  );
}

/**
 * Shown when nothing is being built inside the chosen radius.
 *
 * An empty list is the least useful answer this panel can give, and for the
 * people who use it most (checking a site's surroundings) it used to be the
 * usual one. So instead of stopping, it looks again over 5 km, for
 * construction only, and says what it is doing while it does it. Three
 * outcomes, each said plainly: nearer sites to try, nothing mapped at all, or
 * the wider search itself failed.
 */
function WiderSearch({ at, searchedMeters }: { at: Point; searchedMeters: number }) {
  const wide = useQuery({
    queryKey: ["site-wide", at.lat, at.lon],
    queryFn: ({ signal }) => fetchConstructionNearby(at.lat, at.lon, signal),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const km = WIDE_SEARCH_METERS / 1000;

  if (wide.isPending) {
    return (
      <p className="site__wider" role="status">
        <span className="site__wider-spinner" aria-hidden="true" />
        No construction or site record is mapped within {searchedMeters} m of this place. Searching a wider area ({km} km) for
        the nearest ones…
      </p>
    );
  }

  if (wide.isError) {
    return (
      <div className="site__wider" role="status">
        <p>
          No construction or site record is mapped within {searchedMeters} m. The wider search could not reach OpenStreetMap
          just now.
        </p>
        <button type="button" className="site__more" onClick={() => void wide.refetch()}>
          Try the wider search again
        </button>
      </div>
    );
  }

  const nearby = nearestFirst(wide.data.features, at).slice(0, 12);
  if (nearby.length === 0) {
    return (
      <p className="site__wider" role="status">
        No construction or development is mapped within {km} km of this place. That can mean nothing is being built, or that
        nobody has mapped it yet. The official portals below are the place to check an approved plan.
      </p>
    );
  }

  return (
    <>
      <p className="site__wider" role="status">
        Nothing is mapped within {searchedMeters} m of this place. Try these nearby sites, nearest first:
      </p>
      <ul className="site__features">
        {nearby.map((f) => (
          <FeatureRow key={f.osm} f={f} distance={f.distance} />
        ))}
      </ul>
    </>
  );
}

/** "today, 2:32 pm" or "9 Nov, 2:32 pm" in the visitor's own time. */
function fetchedLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? `today at ${time}` : `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at ${time}`;
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
          <h3 className="site__title">Construction and development nearby</h3>
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
          // Never "empty": with nothing in the radius the panel searches wider
          // instead of stopping (see WiderSearch).
          isEmpty={() => false}
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

                {data.features.length > 0 ? (
                  <ul className="site__features">
                    {nearestFirst(data.features, location!).map((f) => (
                      <FeatureRow key={f.osm} f={f} distance={f.distance} />
                    ))}
                  </ul>
                ) : (
                  <WiderSearch at={{ lat: location!.lat, lon: location!.lon }} searchedMeters={data.radiusMeters} />
                )}

                {data.roads.length > 0 && (
                  <details className="site__roads-box">
                    <summary>Road names here ({data.roads.length})</summary>
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
                  </details>
                )}
                <p className="site__source">
                  From{" "}
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                    OpenStreetMap contributors
                  </a>
                  , within {data.radiusMeters} m of this point
                  {fetchedLabel(data.fetchedAt) ? `, fetched ${fetchedLabel(data.fetchedAt)}` : ""}. It shows what volunteers
                  have mapped, with the date each record was last updated. It is not an official construction status: use the
                  approval portals below for that.
                </p>
              </>
            );
          }}
        </AsyncPanel>
      </section>

      {groups.length > 0 && (
        <section className="site__block">
          <h3 className="site__title">Site plans, approvals and land records</h3>
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
