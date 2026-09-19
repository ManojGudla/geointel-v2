import { useEffect, useRef, useState } from "react";
import { useUiStore, type ThemeMode } from "@/stores/uiStore";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { useFeedbackStore } from "@/stores/feedbackStore";
import { useHelpStore } from "@/stores/helpStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFeatureStatusStore } from "@/stores/featureStatusStore";
import { useTeamStore } from "@/stores/teamStore";
import { useAboutStore } from "@/stores/aboutStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useGamesStore } from "@/stores/gamesStore";
import { SecretGate } from "@/features/secret/SecretGate";
import { isTriggered, recordTap } from "@/features/secret/secretGesture";

const THEME_ICON: Record<ThemeMode, string> = { system: "🖥️", light: "☀️", dark: "🌙" };

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

/**
 * "change these location and place where it will suit" — the header used to
 * lay out ⌘K/Help/Settings/Features/Feedback/Theme as six equal-weight
 * buttons in a flat row, which read as busy and undifferentiated no matter
 * how they were grouped or styled. The pattern most 2026 SaaS headers
 * actually use is: keep only the handful of things people reach for
 * constantly at top level (search, theme), and tuck everything else behind
 * one compact overflow menu. That's what this does — Help/Settings/
 * Features/Feedback move into a "More" menu; ⌘K and the theme toggle stay
 * visible since those get used far more often.
 */
export function Header() {
  const online = useBackendStatus();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const openPalette = useCommandPaletteStore((s) => s.open);
  const openFeedback = useFeedbackStore((s) => s.open);
  const openHelp = useHelpStore((s) => s.open);
  const openSettings = useSettingsStore((s) => s.open);
  const openFeatureStatus = useFeatureStatusStore((s) => s.open);
  const openJoinTeam = useTeamStore((s) => s.open);
  const openAbout = useAboutStore((s) => s.open);
  const openPrivacy = usePrivacyStore((s) => s.open);
  const openGames = useGamesStore((s) => s.open);

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const runFromMenu = (action: () => void) => {
    action();
    setMoreOpen(false);
  };

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
    setTheme(next);
  };

  /*
    Taps live in a ref, not in state, for two reasons. Re-rendering the whole
    header on every tap of a gesture that usually goes nowhere is waste; and
    setting `gateOpen` from inside a state updater would be a side effect in a
    function React is entitled to call more than once.
  */
  const [gateOpen, setGateOpen] = useState(false);
  const markTaps = useRef<number[]>([]);

  const onMarkTap = () => {
    markTaps.current = recordTap(markTaps.current, Date.now());
    if (isTriggered(markTaps.current)) {
      markTaps.current = [];
      setGateOpen(true);
    }
  };

  return (
    <>
    <header className="app-header">
      <div className="app-header__brand">
        {/*
          The mark carries the hidden owner entrance — three taps inside about
          a second. A single tap does nothing at all, so the page behaves
          exactly as before for everyone who does not know the gesture. See
          features/secret/secretGesture.ts for why it is not a single click,
          and for the difference between hiding the door and locking it.
        */}
        <button
          type="button"
          className="app-header__mark"
          onClick={onMarkTap}
          aria-label="maNOWj GeoIntel"
        >
          <span aria-hidden="true">🌐</span>
        </button>
        {/* Two spellings of the name, one shown at a time by CSS. On a phone
            the header has to fit in a single row beside the controls, and
            the full lockup plus tagline was taking four stacked rows —
            roughly a quarter of the screen height, taken from the map. */}
        <div className="app-header__wordmark">
          <span className="app-header__logo app-header__logo--full">maNOWj GeoIntel</span>
          <span className="app-header__logo app-header__logo--short">GeoIntel</span>
          <span className="app-header__tagline">Maps, data and sources for any place</span>
        </div>
      </div>

      <div className="app-header__actions">
        {/* Utility row: only the two things people reach for constantly —
            the command palette and the theme toggle — stay at top level.
            Ghost styling keeps these quiet so they don't compete with the
            one real call-to-action. */}
        <div className="app-header__group app-header__group--utility">
          <button
            type="button"
            className="app-header__icon-btn app-header__icon-btn--ghost app-header__search-btn"
            onClick={openPalette}
            /*
              aria-label as well as title, and this is not belt-and-braces.

              App.css hides .app-header__btn-label below 900px, so on every
              phone this is an emoji inside a box. `title` is a tooltip: most
              screen readers do not announce it reliably, and it never appears
              on touch at all. Without an aria-label the button's accessible
              name on a phone is the magnifying-glass emoji, or nothing.
            */
            aria-label="Search and commands"
            title="Search & commands (Ctrl/Cmd+K)"
          >
            <span aria-hidden="true">🔍</span>
            <span className="app-header__btn-label">Search</span>
            <span className="app-header__kbd-hint" aria-hidden="true">
              ⌘K
            </span>
          </button>
          <button
            type="button"
            className="app-header__icon-btn app-header__icon-btn--ghost"
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Activate to change it.`}
            title={`Theme: ${theme}. Click to change.`}
          >
            <span aria-hidden="true">{THEME_ICON[theme]}</span>
            <span className="app-header__btn-label">{theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark"}</span>
          </button>

          {/*
            "How it works" is top level, and it is the exception to the rule
            above rather than a hole in it.

            Everything else here was tucked behind "More" to stop six
            equal-weight buttons reading as clutter, and that was the right
            call for six things nobody urgently needs. It was the wrong call
            for this one. The reported problem with this product, repeatedly,
            is that people open it and cannot work out what it does or where
            anything is — and the answer to precisely that question was the
            second item inside a menu behind a "⋯" glyph. Someone who does not
            know how an app works does not go hunting in its overflow menu;
            they leave.

            The label says "How it works" rather than "Help" because Help is
            where you go when something is broken, and nothing is broken —
            they just have not been told what this is yet. Below 900px App.css
            drops the label and it becomes a "?" on its own, which is still
            visible, which is the entire point.
          */}
          <button
            type="button"
            className="app-header__icon-btn app-header__icon-btn--ghost"
            onClick={openHelp}
            aria-label="How it works: a guide to this application"
            title="How it works"
          >
            <span aria-hidden="true">❓</span>
            <span className="app-header__btn-label">How it works</span>
          </button>

          {/* Settings / Features / Feedback live behind one compact overflow
              menu instead of three more top-level buttons. */}
          <div className="app-header__more" ref={moreRef}>
            <button
              type="button"
              className="app-header__icon-btn app-header__icon-btn--ghost"
              onClick={() => setMoreOpen((v) => !v)}
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="More"
            >
              <span aria-hidden="true">⋯</span>
              <span className="app-header__btn-label">More</span>
            </button>
            {moreOpen && (
              <div className="app-header__more-menu" role="menu">
                {/* Phone-only: the Join CTA can't hold its own row at this
                    width, so it folds in here rather than pushing the header
                    onto a second line. */}
                <button type="button" role="menuitem" className="app-header__menu-item--mobile" onClick={() => runFromMenu(openJoinTeam)}>
                  <span aria-hidden="true">🤝</span> Join Our Team
                </button>
                {/* Help is no longer duplicated here — it is a visible
                    control in the row above, for the reason given there. */}
                <button type="button" role="menuitem" onClick={() => runFromMenu(openFeatureStatus)}>
                  <span aria-hidden="true">📋</span> Features
                </button>
                <button type="button" role="menuitem" onClick={() => runFromMenu(openSettings)}>
                  <span aria-hidden="true">⚙️</span> Settings
                </button>
                <button type="button" role="menuitem" onClick={() => runFromMenu(openFeedback)}>
                  <span aria-hidden="true">💬</span> Feedback
                </button>
                <button type="button" role="menuitem" onClick={() => runFromMenu(openPrivacy)}>
                  <span aria-hidden="true">🔒</span> Privacy &amp; security
                </button>
                <button type="button" role="menuitem" onClick={() => runFromMenu(openAbout)}>
                  <span aria-hidden="true">ℹ️</span> About
                </button>
                {/* Deliberately here and not on the workspace rail: the rail
                    is the analyst's tool set, and a game sitting between
                    Analyze and Intelligence would say the wrong thing about
                    what this product is. */}
                <button type="button" role="menuitem" onClick={() => runFromMenu(openGames)}>
                  <span aria-hidden="true">🎮</span> maNOWj PLAY
                </button>
              </div>
            )}
          </div>
        </div>

        {/* The one real call-to-action in the header — visually distinct
            (filled, brand-colored) so it reads as the primary action rather
            than one more item in a row of identical pills. */}
        <button
          type="button"
          className="app-header__icon-btn app-header__icon-btn--primary app-header__cta"
          onClick={openJoinTeam}
          aria-label="Join our team"
          title="Join our team"
        >
          <span aria-hidden="true">🤝</span> Join Our Team
        </button>

        {/* A live status readout, not an action — role="status" plus its
            own pill styling (tinted by the current state) keeps it from
            reading as just another clickable button in the row. */}
        <span
          className={`app-header__status app-header__status--${online === null ? "checking" : online ? "online" : "offline"}`}
          role="status"
        >
          <span className="app-header__status-dot" aria-hidden="true" />
          <span className="app-header__btn-label">{online === null ? "Checking…" : online ? "GIS Online" : "GIS Offline"}</span>
        </span>
      </div>
    </header>

    {/* A sibling of the header, not a child: the scrim is position:fixed, and
        a fixed element inside an ancestor that ever gains a transform or a
        filter is positioned against that ancestor instead of the viewport. */}
    <SecretGate open={gateOpen} onClose={() => setGateOpen(false)} />
    </>
  );
}
