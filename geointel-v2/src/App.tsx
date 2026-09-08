import { Header } from "@/components/Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTheme } from "@/hooks/useTheme";
import { Workspace } from "@/features/workspace/Workspace";

/**
 * App.tsx is layout orchestration only: header, workspace composition, and
 * the per-panel error boundaries. All business logic (search, GIS, property
 * analysis, weather, routing...) lives in src/features/* and src/stores/*.
 */
export default function App() {
  useTheme();

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
    </div>
  );
}
