import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useShellStore } from "@/stores/shellStore";
import { SECTION_BY_ID } from "./sections";
import { useIsSheetLayout, useSheet } from "./useSheet";
import { detentLabel } from "./sheet";
import { IntelligencePanel } from "@/features/workspace/IntelligencePanel";
import { RadiusSelector } from "@/features/gis/RadiusSelector";
import { GISLayerManager } from "@/features/gis/GISLayerManager";
import { Buildings3DStatus } from "@/features/map/Buildings3DStatus";
import { MapControls } from "@/features/map/MapControls";
import { LiveLayersPanel } from "@/features/live/LiveLayersPanel";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { MeasureToolbar } from "@/features/measure/MeasureToolbar";
import { SpatialAnalysisPanel } from "@/features/analysis/SpatialAnalysisPanel";
import { AgentStrip } from "@/features/ai/AgentStrip";
import { MapCommandBar } from "@/features/ai/MapCommandBar";
import { TravelPlanner } from "@/features/travel/TravelPlanner";
import { useAiStore } from "@/stores/aiStore";
import { useLocationStore } from "@/stores/locationStore";
import { useReportStore } from "@/stores/reportStore";
import { GettingStarted } from "@/features/onboarding/GettingStarted";
import "./SidePanel.css";

/**
 * The workspace panel: one container, one scrollbar, one section visible at
 * a time.
 *
 * The layout this replaces had the page scrolling behind a right rail that
 * also scrolled, their two scrollbars sitting a few pixels apart at the same
 * screen edge - so "which one moves what" had no answer, and content below
 * the page fold (the AI agents) was effectively invisible. Here the shell
 * itself never scrolls; only this panel's content does, and only ever one of
 * them at a time.
 */
export function SidePanel() {
  const section = useShellStore((s) => s.section);
  const open = useShellStore((s) => s.open);
  const closePanel = useShellStore((s) => s.closePanel);
  const openCopilot = useAiStore((s) => s.openCopilot);
  const location = useLocationStore((s) => s.selectedLocation);
  const openReport = useReportStore((s) => s.open);
  /*
    Below 900px this panel is a bottom sheet rather than a column, and the
    map stays visible above it. See sheet.ts for why that matters more here
    than it would in most applications.
  */
  const isSheet = useIsSheetLayout();
  const sheet = useSheet(isSheet, closePanel);

  if (!open) return null;
  const def = SECTION_BY_ID.get(section);

  return (
    <aside
      ref={sheet.sheetRef}
      className={`side-panel${isSheet ? " side-panel--sheet" : ""}${
        sheet.dragging ? " side-panel--dragging" : ""
      }`}
      aria-label={def?.title ?? "Workspace"}
      /* Desktop leaves this undefined so the stylesheet's fixed column wins. */
      style={sheet.fraction === null ? undefined : { height: `${(sheet.fraction * 100).toFixed(2)}%` }}
    >
      {/*
        The grip. Rendered at every width but only visible in sheet layout,
        where it is the control that resizes and closes the panel.

        It is a real <button>, so it is reachable and operable from a keyboard
        - arrow keys step the same three heights a finger drags between. A
        grip that answers only to a pointer is a control that exists for touch
        users and for nobody else.
      */}
      <button
        type="button"
        className="side-panel__grip"
        aria-label={`${detentLabel(sheet.detent)}. Drag or use the arrow keys to resize, tap to cycle.`}
        {...sheet.gripProps}
      >
        <span className="side-panel__grip-bar" aria-hidden="true" />
      </button>

      <header className="side-panel__head">
        <div>
          <h2 className="side-panel__title">{def?.title}</h2>
          {/* The hint stays visible rather than living in a tooltip: the
              people who need it are exactly the ones who won't hover. */}
          <p className="side-panel__hint">{def?.hint}</p>
        </div>
        <button type="button" className="side-panel__close" onClick={closePanel} aria-label="Close panel">
          ✕
        </button>
      </header>

      <div className="side-panel__body">
        {/* Before a place is chosen every tab in here is empty, so the panel
            shows how to get started instead of four blank tabs. */}
        {section === "place" && (
          <ErrorBoundary label="Location intelligence" variant="panel">
            {location ? <IntelligencePanel /> : <GettingStarted />}
          </ErrorBoundary>
        )}

        {section === "layers" && (
          <div className="side-panel__stack">
            <ErrorBoundary label="Basemap" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">Basemap &amp; view</h3>
                <MapControls />
              </section>
            </ErrorBoundary>
            <ErrorBoundary label="Analysis radius" variant="panel">
              <RadiusSelector />
            </ErrorBoundary>
            <ErrorBoundary label="3D buildings" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">3D buildings</h3>
                <Buildings3DStatus />
              </section>
            </ErrorBoundary>
            <ErrorBoundary label="GIS layers" variant="panel">
              <GISLayerManager />
            </ErrorBoundary>
            <ErrorBoundary label="Historical imagery" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">Time travel</h3>
                <TimelinePanel />
              </section>
            </ErrorBoundary>
            <ErrorBoundary label="Live layers" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">Live data</h3>
                <LiveLayersPanel />
              </section>
            </ErrorBoundary>
          </div>
        )}

        {section === "tools" && (
          <div className="side-panel__stack">
            <ErrorBoundary label="Measurement" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">Measure</h3>
                <MeasureToolbar />
              </section>
            </ErrorBoundary>
            <ErrorBoundary label="Spatial analysis" variant="panel">
              <section className="side-panel__group">
                <h3 className="side-panel__group-title">Spatial analysis</h3>
                <SpatialAnalysisPanel />
              </section>
            </ErrorBoundary>
          </div>
        )}

        {section === "ai" && (
          <div className="side-panel__stack">
            <ErrorBoundary label="Map commands" variant="panel">
              <section className="side-panel__group">
                {/* Retitled from "Ask the map". This panel holds two boxes you
                    can type a question into, and both were called "Ask
                    something" - which left no way to tell from the labels which
                    one to use. They do different jobs: this one FINDS things and
                    draws them on the map; the one below ANSWERS in words. The
                    titles now say which is which. */}
                <h3 className="side-panel__group-title">Find things on the map</h3>
                <MapCommandBar />
              </section>
            </ErrorBoundary>
            <section className="side-panel__group">
              <h3 className="side-panel__group-title">Ask a question in words</h3>
              <p className="side-panel__group-note">
                Ask me anything in plain language using the location, evidence and weather currently loaded.
              </p>
              <button type="button" className="side-panel__cta" onClick={openCopilot}>
                💬 Ask me
              </button>
            </section>
            <section className="side-panel__group">
              <h3 className="side-panel__group-title">Report</h3>
              <p className="side-panel__group-note">
                A printable analysis of this location, built from the evidence, property classification, conditions and any
                analysis you have run. Save it as a PDF from the print dialogue.
              </p>
              <button type="button" className="side-panel__cta" onClick={openReport} disabled={!location}>
                📄 Generate area report
              </button>
            </section>
            <ErrorBoundary label="AI agents" variant="panel">
              <AgentStrip />
            </ErrorBoundary>
          </div>
        )}

        {section === "travel" && (
          <ErrorBoundary label="Travel planner" variant="panel">
            <TravelPlanner />
          </ErrorBoundary>
        )}
      </div>
    </aside>
  );
}
