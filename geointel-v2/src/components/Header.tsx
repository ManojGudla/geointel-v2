import { useEffect, useState } from "react";
import { useUiStore, type ThemeMode } from "@/stores/uiStore";

/**
 * Pings a lightweight, always-mounted API route so "GIS Online" reflects
 * the actual backend, not a hardcoded green dot. api/health.ts (Phase 1)
 * just confirms the dev/production API layer itself is reachable; richer
 * per-provider status can be layered on in a later phase.
 */
function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return online;
}

const THEME_CYCLE: ThemeMode[] = ["system", "light", "dark"];

export function Header() {
  const online = useBackendStatus();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
    setTheme(next);
  };

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo">maNOWj GeoIntel</span>
        <span className="app-header__tagline">Geospatial Intelligence Platform</span>
      </div>

      <div className="app-header__actions">
        <button type="button" className="app-header__theme" onClick={cycleTheme} aria-label={`Theme: ${theme}. Click to change.`}>
          {theme === "system" ? "🖥️" : theme === "light" ? "☀️" : "🌙"} {theme}
        </button>
        <span
          className={`app-header__status app-header__status--${online === null ? "checking" : online ? "online" : "offline"}`}
          role="status"
        >
          <span className="app-header__status-dot" aria-hidden="true" />
          {online === null ? "Checking…" : online ? "GIS Online" : "GIS Offline"}
        </span>
      </div>
    </header>
  );
}
