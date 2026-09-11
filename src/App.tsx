import { Suspense, lazy, useState } from "react";
import { Header } from "@/components/Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTheme } from "@/hooks/useTheme";
import { Workspace } from "@/features/workspace/Workspace";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import { HelpGuide } from "@/features/help/HelpGuide";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { FeatureStatusPage } from "@/features/status/FeatureStatusPage";
import { JoinTeamForm } from "@/features/team/JoinTeamForm";
import { AboutPanel } from "@/features/about/AboutPanel";
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
import { MaintenancePage } from "@/features/maintenance/MaintenancePage";
import { useMaintenanceStore } from "@/stores/maintenanceStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useMaintenancePolling } from "@/hooks/useMaintenancePolling";
import { useSharedLocationFromUrl } from "@/hooks/useSharedLocationFromUrl";
import { useLocationPanelSync } from "@/hooks/useLocationPanelSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ConsentBanner } from "@/features/analytics/ConsentBanner";

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

  // The consent banner and the landing page footer both link to /privacy,
  // but there was never a route behind it: the SPA rewrite served index.html
  // and the app rendered the plain map, so anyone following "see our Privacy
  // page" landed on a map with no privacy page in sight. The panel is a
  // modal rather than a route, so the honest fix is to open it on arrival.
  if (pathname === "/privacy") {
    usePrivacyStore.getState().open();
  }

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
        <FeedbackForm />
      </ErrorBoundary>

      <ErrorBoundary label="Help guide" variant="panel">
        <HelpGuide />
      </ErrorBoundary>

      <ErrorBoundary label="Settings" variant="panel">
        <SettingsPanel />
      </ErrorBoundary>

      <ErrorBoundary label="Feature status" variant="panel">
        <FeatureStatusPage />
      </ErrorBoundary>

      <ErrorBoundary label="Join our team" variant="panel">
        <JoinTeamForm />
      </ErrorBoundary>

      <ErrorBoundary label="About" variant="panel">
        <AboutPanel />
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
