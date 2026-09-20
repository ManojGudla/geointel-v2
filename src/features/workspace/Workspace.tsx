import { Suspense, lazy, useRef } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SearchBar } from "@/features/search/SearchBar";

/**
 * The map is loaded separately from the rest of the app.
 *
 * MapLibre GL JS is 788 KB of the roughly 1.3 MB main bundle, and while it
 * was imported here directly, NOTHING on the page could paint until all of it
 * had downloaded and parsed. Measured on PageSpeed against a mid-range phone
 * on throttled 4G, that was 4.3 seconds to first paint and 4.5 to largest -
 * the worst number this site has, and one every mobile visitor pays.
 *
 * Splitting it out lets the shell - rail, panel, search box - paint as soon as
 * the small bundle lands, and the map arrives a moment later into a
 * placeholder that already occupies its exact space. The total bytes are
 * unchanged; what changes is that the visitor sees the product instead of a
 * blank screen while they download.
 */
const MapView = lazy(() => import("@/features/map/MapView").then((m) => ({ default: m.MapView })));
import { WeatherEffectsLayer } from "@/features/weather/effects/WeatherEffectsLayer";
import { NavigationHud } from "@/features/routing/navigation/NavigationHud";
import { MeasureHud } from "@/features/measure/MeasureHud";
import { CoordinateReadout } from "@/features/map/CoordinateReadout";
import { BasemapSwitcher } from "@/features/map/BasemapSwitcher";
import { MapOnboarding } from "@/features/onboarding/MapOnboarding";
import { NavRail } from "@/features/shell/NavRail";
import { SidePanel } from "@/features/shell/SidePanel";
import { QuickActions } from "./QuickActions";
import { DirectionsPanel } from "@/features/routing/DirectionsPanel";
import { CopilotPanel } from "@/features/ai/CopilotPanel";
import { CopilotLauncher } from "@/features/ai/CopilotLauncher";
import { CommandPalette } from "@/features/command/CommandPalette";
import { useMeasureStore } from "@/stores/measureStore";
import { useShellStore } from "@/stores/shellStore";
import { useOnboardingVisible } from "@/features/onboarding/onboardingVisibility";
import "./Workspace.css";

/**
 * Map-first workspace: a labelled rail, one panel, and a map that fills
 * everything else.
 *
 * The previous layout put a fixed-height map row inside a scrolling page,
 * with a second scrolling rail at the same screen edge and the AI agents
 * parked below the fold. It tested badly for exactly the reason you'd
 * expect: people who hadn't been walked through it couldn't tell what
 * scrolled, and never saw the parts that needed scrolling to reach.
 *
 * Now nothing outside a panel scrolls. The shell is exactly viewport-height,
 * the map takes all the space no one else needs, and every feature is one
 * labelled click away on the rail. Search floats over the map because search
 * is the first thing anyone does and should never be behind a click.
 */
export function Workspace() {
  // Passed to MapView so its FullscreenControl fullscreens this whole stage,
  // not just the raw canvas - the controls below are absolutely positioned
  // siblings of the map, and the Fullscreen API only renders the requested
  // element's own subtree, so fullscreening the canvas alone made every one
  // of them vanish rather than merely hide.
  const stageRef = useRef<HTMLDivElement>(null);
  const measuring = useMeasureStore((s) => s.mode !== "off");
  // On a phone the getting-started card is bottom-anchored, and two floating
  // overlays - the Ask maNOWj launcher and the coordinate chip - were drawn
  // on top of it, covering its last suggestion and crowding "Dismiss" into
  // the corner. Reported as: new visitors could not find how to close it.
  // Same treatment as measuring below: the card owns the bottom edge while
  // it is up. See Workspace.css.
  const onboarding = useOnboardingVisible();
  // Below 900px the panel is a bottom sheet rising off the same edge the
  // coordinate chip and map-style pill sit on, so those two yield while it is
  // up - the same bargain measuring and onboarding already strike below.
  const panelOpen = useShellStore((s) => s.open);

  return (
    <div className="workspace">
      <div className="workspace__body">
        <NavRail />

        <div className="workspace__content">
          <ErrorBoundary label="Workspace panel" variant="panel">
            <SidePanel />
          </ErrorBoundary>

          {/* A phone screen has room for the measurement readout OR the
              basemap/coordinate chips along its bottom edge, not both - so
              measuring temporarily yields that space rather than stacking
              two overlapping overlays. See Workspace.css. */}
          <div
            className={`workspace__stage${measuring ? " workspace__stage--measuring" : ""}${
              onboarding ? " workspace__stage--onboarding" : ""
            }${panelOpen ? " workspace__stage--sheeted" : ""}`}
            ref={stageRef}
          >
            <ErrorBoundary label="Map" variant="panel">
              {/* The fallback fills the stage exactly, so the surrounding
                  controls land in their final positions on the first paint
                  and nothing shifts when the map arrives. An empty fallback
                  would collapse the stage and then push everything when the
                  canvas appeared, which is worse than the wait it replaces. */}
              <Suspense fallback={<div className="workspace__maploading">Loading the map…</div>}>
                <MapView fullscreenContainerRef={stageRef} />
              </Suspense>
            </ErrorBoundary>

            {/* Between the map canvas and every panel - see the z-index note
                in WeatherEffectsLayer.css. Renders nothing at all unless the
                user has switched it on AND real weather came back. */}
            <ErrorBoundary label="Weather effects" variant="silent">
              <WeatherEffectsLayer />
            </ErrorBoundary>

            <div className="workspace__search">
              <ErrorBoundary label="Search" variant="panel">
                <SearchBar />
              </ErrorBoundary>
              <ErrorBoundary label="Quick actions" variant="panel">
                <QuickActions />
              </ErrorBoundary>
            </div>

            <ErrorBoundary label="Measurement readout" variant="panel">
              <MeasureHud />
            </ErrorBoundary>

            {/* On the map, above the coordinate chip. See BasemapSwitcher.tsx
                for why this belongs here and not only in the Layers panel. */}
            <ErrorBoundary label="Map style" variant="panel">
              <BasemapSwitcher />
            </ErrorBoundary>

            <CoordinateReadout />

            <ErrorBoundary label="Getting started" variant="panel">
              <MapOnboarding />
            </ErrorBoundary>

            <DirectionsPanel />

            {/* Above the panels: while navigating, the instruction is the
                most important thing on screen. */}
            <ErrorBoundary label="Navigation" variant="panel">
              <NavigationHud />
            </ErrorBoundary>

            {/*
              The surprise teaser is deliberately not rendered.

              It told visitors "Something special is waiting for you.
              September 25" and there was no implementation of any surprise
              anywhere in the repository, so the date could only ever arrive
              and pass with nothing behind it. Worse, daysUntilSurprise()
              rolls to the following year once the date passes, so the card
              would return every September, for 31 days, indefinitely. On an
              application left to run unattended that is not one broken
              promise, it is an annual one.

              The feature is intact under src/features/surprise/ and its
              tests still pass. To bring it back when there is something real
              to reveal: import SurpriseTeaser and restore this element.
            */}

            <ErrorBoundary label="Ask maNOWj" variant="panel">
              <CopilotLauncher />
              <CopilotPanel />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <CommandPalette />
    </div>
  );
}
