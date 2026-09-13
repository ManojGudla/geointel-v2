import { Suspense, lazy, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTheme } from "@/hooks/useTheme";
import { Workspace } from "@/features/workspace/Workspace";
/**
 * Code-split, deliberately.
 *
 * None of these is on screen when the app opens: the games hub, the privacy
 * page and the printable report are behind a click, and /admin and /status
 * are separate URLs most visitors never see. Shipping them in the first
 * bundle made every visitor download the games engine and the admin dashboard
 * before the map could draw — which is the opposite of what someone on a
 * phone on mobile data needs. Suspense fallbacks are `null` because each of
 * these renders nothing until it's opened anyway.
 */
/*
  These six were eager, and all six render `null` until someone opens them.

  Every one is a modal behind a click — feedback, help, settings, the feature
  list, the join form, about. Their code, their CSS and their share of
  framer-motion were all downloaded, parsed and executed by every visitor
  before the map could draw, to render nothing. On a phone on mobile data that
  is the whole of a first impression spent on screens the visitor has not asked
  for and most will never open.

  The Suspense fallback is `null` for the same reason it is on the others
  below: a closed modal already renders nothing, so there is nothing to show
  while it loads.
*/
const FeedbackForm = lazy(() => import("@/features/feedback/FeedbackForm").then((m) => ({ default: m.FeedbackForm })));
const HelpGuide = lazy(() => import("@/features/help/HelpGuide").then((m) => ({ default: m.HelpGuide })));
const SettingsPanel = lazy(() => import("@/features/settings/SettingsPanel").then((m) => ({ default: m.SettingsPanel })));
const FeatureStatusPage = lazy(() =>
  import("@/features/status/FeatureStatusPage").then((m) => ({ default: m.FeatureStatusPage }))
);
const JoinTeamForm = lazy(() => import("@/features/team/JoinTeamForm").then((m) => ({ default: m.JoinTeamForm })));
const AboutPanel = lazy(() => import("@/features/about/AboutPanel").then((m) => ({ default: m.AboutPanel })));

const AreaReport = lazy(() => import("@/features/report/AreaReport").then((m) => ({ default: m.AreaReport })));
const PlayHub = lazy(() => import("@/features/play/PlayHub").then((m) => ({ default: m.PlayHub })));
const PrivacyPanel = lazy(() => import("@/features/privacy/PrivacyPanel").then((m) => ({ default: m.PrivacyPanel })));
const AdminDashboard = lazy(() => import("@/features/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const SystemStatusPage = lazy(() => import("@/features/status/SystemStatusPage").then((m) => ({ default: m.SystemStatusPage })));
/* The marketing page at /ai-map-search. Split out for the same reason as the
   rest of this list, and more so: nobody who opens the app itself should pay
   for a landing page they will never see, and nobody landing on the marketing
   page should download the whole workspace to read it. */
const LandingPage = lazy(() => import("@/features/landing/LandingPage").then((m) => ({ default: m.LandingPage })));
/* The city pages. Split out for the same reason as the landing page: somebody
   who opens the app itself should never pay to download a page they will not
   see, and somebody arriving on a city page from a search result should not
   download the whole workspace to read it. */
const CityPage = lazy(() => import("@/features/city/CityPage").then((m) => ({ default: m.CityPage })));
import { MaintenancePage } from "@/features/maintenance/MaintenancePage";
import { useMaintenanceStore } from "@/stores/maintenanceStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useMaintenancePolling } from "@/hooks/useMaintenancePolling";
import { useSharedLocationFromUrl } from "@/hooks/useSharedLocationFromUrl";
import { useLocationPanelSync } from "@/hooks/useLocationPanelSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ConsentBanner } from "@/features/analytics/ConsentBanner";
import { NotFoundPage } from "@/features/notfound/NotFoundPage";
import { CITY_BY_SLUG, CITY_PATHS } from "@/data/cities";

/**
 * App.tsx is layout orchestration only: header, workspace composition, and
 * the per-panel error boundaries. All business logic (search, GIS, property
 * analysis, weather, routing...) lives in src/features/* and src/stores/*.
 */
export default function App() {
  useTheme();
  useMaintenancePolling();
  useSharedLocationFromUrl();
  useLocationPanelSync();
  useKeyboardShortcuts();
  const maintenance = useMaintenanceStore((s) => s.state);
  const lastChecked = useMaintenanceStore((s) => s.lastChecked);

  // No router in this app (see plugins/vite-plugin-api.ts's comment on why
  // that's a deliberate choice elsewhere) — /admin is a plain pathname
  // check, read once since this SPA never navigates between paths itself.
  const [pathname] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/");

  /**
   * Every path this application actually serves.
   *
   * Declared as a set rather than implied by the chain of `if`s below, because
   * the chain had no final `else`: an unmatched path fell through all of it and
   * rendered the map workspace with HTTP 200. That made /pricing, /maps/london
   * and /asdfgh all look like real pages to a crawler, each answering 200 with
   * byte-identical HTML — infinite duplicate content from a single bad inbound
   * link. Adding a branch to the bottom of the chain would have fixed today's
   * version and silently broken again the next time somebody added a route and
   * forgot; a set that every branch is checked against cannot drift apart from
   * the branches.
   */
  const KNOWN_PATHS = new Set(["/", "/ai-map-search", "/status", "/admin", "/privacy", ...CITY_PATHS]);
  const isKnownPath = KNOWN_PATHS.has(pathname);

  // The consent banner and the landing page footer both link to /privacy,
  // but there was never a route behind it: the SPA rewrite served index.html
  // and the app rendered the plain map, so anyone following "see our Privacy
  // page" landed on a map with no privacy page in sight. The panel is a
  // modal rather than a route, so the honest fix is to open it on arrival.
  //
  // In an effect, not inline in the render. Writing to a store during render
  // is a side effect in the middle of a pure function: React renders this
  // component twice in StrictMode and re-renders it whenever the maintenance
  // poll lands, so the inline version fired repeatedly and could ask a
  // mounted PrivacyPanel to update while App was still rendering. Once, after
  // mount, is what was actually meant.
  useEffect(() => {
    if (pathname === "/privacy") usePrivacyStore.getState().open();
  }, [pathname]);

  // The landing page. Also deliberately outside the maintenance gate: it is
  // a description of the product, it calls no data endpoint, and a visitor
  // arriving from a search result during a maintenance window should still
  // be able to read what this is rather than hit a wall.
  if (pathname === "/ai-map-search") {
    return (
      <ErrorBoundary label="Landing page" variant="page">
        <Suspense fallback={<div className="app-loading">Loading…</div>}>
          <LandingPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  /*
    Outside the maintenance gate, like the landing page: these pages are read
    by people arriving from a search engine, they degrade to text when the data
    APIs are down, and answering a maintenance screen to a visitor who found us
    through a search result wastes the only first impression we get.
  */
  if (pathname.startsWith("/maps/")) {
    const city = CITY_BY_SLUG.get(pathname.slice("/maps/".length));
    if (city) {
      return (
        <ErrorBoundary label={`${city.name} page`} variant="page">
          <Suspense fallback={<div className="app-loading">Loading…</div>}>
            <CityPage city={city} />
          </Suspense>
        </ErrorBoundary>
      );
    }
  }

  /*
    Ahead of the maintenance gate on purpose: a page that does not exist does
    not start existing during a maintenance window, and answering a nonsense
    URL with the maintenance page would be a second wrong answer on top of the
    first.
  */
  if (!isKnownPath) {
    return <NotFoundPage pathname={pathname} />;
  }

  // Deliberately NOT behind the maintenance gate below: when the app is in
  // maintenance the status page is exactly what someone needs to reach.
  if (pathname === "/status") {
    return (
      <ErrorBoundary label="System status" variant="panel">
        <Suspense fallback={<div className="app-loading">Loading…</div>}>
          <SystemStatusPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (pathname === "/admin") {
    return (
      <ErrorBoundary label="Admin dashboard" variant="panel">
        <Suspense fallback={<div className="app-loading">Loading…</div>}>
          <AdminDashboard />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Real backend enforcement lives in api/_lib/maintenance.ts's
  // withMaintenanceGuard, applied to every data endpoint — this is the
  // matching frontend gate so normal visitors see the honest maintenance
  // page instead of a workspace full of failed panels. Until the first poll
  // resolves, `maintenance` is null and the normal app renders — a brief,
  // honest gap (not a fake "definitely live" claim) rather than a loading
  // screen on every single page view.
  if (maintenance?.enabled) {
    return <MaintenancePage state={maintenance} lastChecked={lastChecked} />;
  }

  return (
    <div className="app-shell">
      <a href="#geointel-workspace" className="skip-link">
        Skip to workspace
      </a>

      <ErrorBoundary label="Header" variant="panel">
        <Header />
      </ErrorBoundary>

      <main id="geointel-workspace" className="app-shell__main">
        <ErrorBoundary label="GeoIntel workspace" variant="panel">
          <Workspace />
        </ErrorBoundary>
      </main>

      <ErrorBoundary label="Feedback" variant="panel">
        <Suspense fallback={null}>
          <FeedbackForm />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Help guide" variant="panel">
        <Suspense fallback={null}>
          <HelpGuide />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Settings" variant="panel">
        <Suspense fallback={null}>
          <SettingsPanel />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Feature status" variant="panel">
        <Suspense fallback={null}>
          <FeatureStatusPage />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Join our team" variant="panel">
        <Suspense fallback={null}>
          <JoinTeamForm />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="About" variant="panel">
        <Suspense fallback={null}>
          <AboutPanel />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Area report" variant="panel">
        <Suspense fallback={null}>
          <AreaReport />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="maNOWj PLAY" variant="panel">
        <Suspense fallback={null}>
          <PlayHub />
          <ConsentBanner />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary label="Privacy and security" variant="panel">
        <Suspense fallback={null}>
          <PrivacyPanel />
        </Suspense>
      </ErrorBoundary>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} maNOWj GeoIntel. All rights reserved.</span>
      </footer>
    </div>
  );
}
