import { useIntelTabStore, type IntelTab } from "@/stores/intelTabStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LocationIdentityPanel } from "@/features/location/LocationIdentityPanel";
import { LocationIntelligencePanel } from "@/features/intelligence/LocationIntelligencePanel";
import { PropertyIntelligencePanel } from "@/features/property/PropertyIntelligencePanel";
import { PopulationPanel } from "@/features/population/PopulationPanel";
import { GISEvidencePanel } from "@/features/gis/GISEvidencePanel";
import { WeatherPanel } from "@/features/weather/WeatherPanel";
import { NewsPanel } from "@/features/news/NewsPanel";
import { NearbyPanel } from "@/features/nearby/NearbyPanel";
import { SitePanel } from "@/features/site/SitePanel";
import { OfficialsPanel } from "@/features/officials/OfficialsPanel";
import "./IntelligencePanel.css";

// No "AI Agents" tab here - the same six agent cards already render as an
// always-visible strip directly below the map (AgentStrip.tsx), so a
// second copy in this panel was pure duplication eating the one place on
// screen with the least room to spare.
// Travel is no longer a tab here - it has its own entry on the workspace
// rail, because a headline feature buried behind the fifth tab of another
// panel is a feature nobody finds.
// "Site & plans" sits second rather than last. It answers the question people
// arrive with most often after "where is this" - what is on this land, what is
// being built on it, and who holds the records - and a tab at the far right of
// a five-tab row is a tab nobody presses.
const TABS: Array<{ id: IntelTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "site", label: "Site & plans" },
  { id: "evidence", label: "Evidence" },
  { id: "live", label: "Weather & News" },
  { id: "nearby", label: "Nearby" },
];

/**
 * The left "Intelligence Workspace" panel from the spec - tabbed so the
 * growing set of panels (location identity, property intelligence, GIS
 * evidence, weather, news, nearby) stays navigable instead of one endless
 * scroll, per the "clear navigation, high information density" direction.
 */
export function IntelligencePanel() {
  const tab = useIntelTabStore((s) => s.tab);
  const setTab = useIntelTabStore((s) => s.setTab);

  return (
    <div className="intel-panel">
      <div className="intel-panel__tabs" role="tablist" aria-label="Intelligence workspace">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="intel-panel__content">
        {tab === "overview" && (
          <>
            {/* The headline answer to "what is this place?" goes first -
                before the raw identity fields, which are reference rather
                than insight. */}
            <ErrorBoundary label="Location intelligence score" variant="panel">
              <LocationIntelligencePanel />
            </ErrorBoundary>
            <ErrorBoundary label="Location identity" variant="panel">
              <LocationIdentityPanel />
            </ErrorBoundary>
            {/* Population sits above Property Intelligence because it was
                effectively invisible below it: the Overview tab is a scroll,
                and "how many people live here" is one of the first questions
                anyone asks of a place. Its own author couldn't find it on the
                live site, which settled the argument. */}
            <ErrorBoundary label="Population" variant="panel">
              <PopulationPanel />
            </ErrorBoundary>
            <ErrorBoundary label="Property intelligence" variant="panel">
              <PropertyIntelligencePanel />
            </ErrorBoundary>
            {/* Collapsed by default (native <details>) so it adds one line
                to the Overview tab, not a new tab competing for the same
                tight space the AI Agents tab was just removed to free up. */}
            <ErrorBoundary label="Official & authority intelligence" variant="panel">
              <OfficialsPanel />
            </ErrorBoundary>
          </>
        )}
        {tab === "site" && (
          <ErrorBoundary label="Site and development" variant="panel">
            <SitePanel />
          </ErrorBoundary>
        )}
        {tab === "evidence" && (
          <ErrorBoundary label="GIS evidence" variant="panel">
            <GISEvidencePanel />
          </ErrorBoundary>
        )}
        {tab === "live" && (
          <>
            <ErrorBoundary label="Weather" variant="panel">
              <WeatherPanel />
            </ErrorBoundary>
            <ErrorBoundary label="News" variant="panel">
              <NewsPanel />
            </ErrorBoundary>
          </>
        )}
        {tab === "nearby" && (
          <ErrorBoundary label="Nearby" variant="panel">
            <NearbyPanel />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
