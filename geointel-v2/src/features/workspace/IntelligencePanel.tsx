import { useIntelTabStore, type IntelTab } from "@/stores/intelTabStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LocationIdentityPanel } from "@/features/location/LocationIdentityPanel";
import { PropertyIntelligencePanel } from "@/features/property/PropertyIntelligencePanel";
import { GISEvidencePanel } from "@/features/gis/GISEvidencePanel";
import { WeatherPanel } from "@/features/weather/WeatherPanel";
import { NewsPanel } from "@/features/news/NewsPanel";
import { NearbyPanel } from "@/features/nearby/NearbyPanel";
import "./IntelligencePanel.css";

const TABS: Array<{ id: IntelTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "live", label: "Weather & News" },
  { id: "nearby", label: "Nearby" },
];

/**
 * The left "Intelligence Workspace" panel from the spec — tabbed so the
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
            <ErrorBoundary label="Location identity" variant="panel">
              <LocationIdentityPanel />
            </ErrorBoundary>
            <ErrorBoundary label="Property intelligence" variant="panel">
              <PropertyIntelligencePanel />
            </ErrorBoundary>
          </>
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
