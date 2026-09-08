import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SearchBar } from "@/features/search/SearchBar";
import { MapView } from "@/features/map/MapView";
import { MapControls } from "@/features/map/MapControls";
import { IntelligencePanel } from "./IntelligencePanel";
import { QuickActions } from "./QuickActions";
import { RadiusSelector } from "@/features/gis/RadiusSelector";
import { GISLayerManager } from "@/features/gis/GISLayerManager";
import { DirectionsPanel } from "@/features/routing/DirectionsPanel";
import "./Workspace.css";

/**
 * Map-first layout: search sits above everything, the map is the dominant
 * central element, and intelligence panels flank it — this is the final
 * shape (Phases 2-5 all slot into it), not a placeholder.
 */
export function Workspace() {
  return (
    <div className="workspace">
      <div className="workspace__search">
        <ErrorBoundary label="Search" variant="panel">
          <SearchBar />
        </ErrorBoundary>
        <ErrorBoundary label="Quick actions" variant="panel">
          <QuickActions />
        </ErrorBoundary>
      </div>

      <div className="workspace__body">
        <aside className="workspace__panel workspace__panel--left" aria-label="Location intelligence">
          <ErrorBoundary label="Intelligence workspace" variant="panel">
            <IntelligencePanel />
          </ErrorBoundary>
        </aside>

        <div className="workspace__map">
          <ErrorBoundary label="Map" variant="panel">
            <MapView />
            <MapControls />
            <DirectionsPanel />
          </ErrorBoundary>
        </div>

        <aside className="workspace__panel workspace__panel--right" aria-label="Map context">
          <ErrorBoundary label="Radius selector" variant="panel">
            <RadiusSelector />
          </ErrorBoundary>
          <ErrorBoundary label="GIS layer manager" variant="panel">
            <GISLayerManager />
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
