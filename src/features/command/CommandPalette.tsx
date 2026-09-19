import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useMapStore } from "@/stores/mapStore";
import { useAiStore } from "@/stores/aiStore";
import { useFeedbackStore } from "@/stores/feedbackStore";
import { useHelpStore } from "@/stores/helpStore";
import { useMeasureStore } from "@/stores/measureStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFeatureStatusStore } from "@/stores/featureStatusStore";
import { useAboutStore } from "@/stores/aboutStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useShellStore } from "@/stores/shellStore";
import { useGamesStore } from "@/stores/gamesStore";
import { useReportStore } from "@/stores/reportStore";
import { FEATURED_PAIR_PATHS } from "@/features/compare/comparePairs";
import "./CommandPalette.css";

interface Command {
  id: string;
  label: string;
  icon: string;
  available: boolean;
  /**
   * True for a command that's fully built but temporarily can't run because
   * no location is selected yet (Directions/Analyze/Nearby/AI Agents all
   * need one) — distinct from a command that's genuinely not built yet
   * (Compare Locations, Generate Report). Both used to render identically
   * as "coming soon," which read as a bug report waiting to happen: someone
   * who'd just used Directions from the toolbar would see it labeled
   * "coming soon" here the moment they cleared their search. Clicking one
   * of these focuses the search bar instead of doing nothing, since that's
   * the actual next step to unblock it.
   */
  requiresLocation?: boolean;
  run: () => void;
}

/**
 * Ctrl/Cmd+K spotlight. Every enabled command drives a real store action,
 * the same ones QuickActions.tsx already uses, never a dead button.
 *
 * There are no "coming soon" entries left. Compare Locations and Generate
 * Report were both listed that way long after they shipped, so the palette
 * understated the product to anyone who opened it. Anything genuinely not
 * built belongs on the Feature Status page, not in a list of things you can
 * press. Items that ARE built but need a selected location first are
 * labeled "pick a location first" and focus the search box, which is the
 * real next step rather than a dead end.
 */
export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const location = useLocationStore((s) => s.selectedLocation);
  const openDirections = useRouteStore((s) => s.openPanel);
  const setIntelTab = useIntelTabStore((s) => s.setTab);
  const toggle3D = useMapStore((s) => s.toggle3D);
  const openCopilot = useAiStore((s) => s.openCopilot);
  const openFeedback = useFeedbackStore((s) => s.open);
  const openHelp = useHelpStore((s) => s.open);
  const setMeasureMode = useMeasureStore((s) => s.setMode);
  const openSettings = useSettingsStore((s) => s.open);
  const openFeatureStatus = useFeatureStatusStore((s) => s.open);
  const openAbout = useAboutStore((s) => s.open);
  const openPrivacy = usePrivacyStore((s) => s.open);
  const openSection = useShellStore((s) => s.openSection);
  const openGames = useGamesStore((s) => s.open);
  const openReport = useReportStore((s) => s.open);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "search",
        label: "Focus search",
        icon: "🔍",
        available: true,
        run: () => document.querySelector<HTMLInputElement>(".search-bar__input")?.focus(),
      },
      { id: "directions", label: "Start directions", icon: "🧭", available: !!location, requiresLocation: true, run: () => openDirections(location ?? undefined) },
      // Every command that reveals something must also OPEN the surface it
      // lives on. These used to set an internal tab only, so running them
      // while the panel was closed did nothing observable.
      {
        id: "analyze",
        label: "Analyze this location",
        icon: "📊",
        available: !!location,
        requiresLocation: true,
        run: () => {
          setIntelTab("evidence");
          openSection("place");
        },
      },
      {
        id: "nearby",
        label: "Find nearby places",
        icon: "📍",
        available: !!location,
        requiresLocation: true,
        run: () => {
          setIntelTab("nearby");
          openSection("place");
        },
      },
      { id: "agents", label: "Open AI agents", icon: "🤖", available: true, run: () => openSection("ai") },
      { id: "travel", label: "Open Travel Planner", icon: "✈️", available: true, run: () => openSection("travel") },
      { id: "layers", label: "Map layers & radius", icon: "🗂️", available: true, run: () => openSection("layers") },
      { id: "copilot", label: "Ask maNOWj", icon: "✨", available: true, run: () => openCopilot() },
      { id: "3d", label: "Toggle 3D view", icon: "🧊", available: true, run: () => toggle3D() },
      {
        id: "measure-distance",
        label: "Measure distance",
        icon: "📏",
        available: true,
        run: () => {
          setMeasureMode("distance");
          openSection("tools");
        },
      },
      {
        id: "measure-area",
        label: "Measure area",
        icon: "▱",
        available: true,
        run: () => {
          setMeasureMode("area");
          openSection("tools");
        },
      },
      { id: "feedback", label: "Give feedback", icon: "💬", available: true, run: () => openFeedback() },
      { id: "help", label: "Help & Guide", icon: "❓", available: true, run: () => openHelp() },
      { id: "settings", label: "Settings", icon: "⚙️", available: true, run: () => openSettings() },
      { id: "feature-status", label: "What's built vs. planned", icon: "📋", available: true, run: () => openFeatureStatus() },
      { id: "privacy", label: "Privacy & security", icon: "🔒", available: true, run: () => openPrivacy() },
      { id: "about", label: "About", icon: "ℹ️", available: true, run: () => openAbout() },
      { id: "games", label: "maNOWj PLAY: games", icon: "🎮", available: true, run: () => openGames() },
      /*
        Both of these were listed as unavailable with an empty handler and a
        "coming soon" label, and both had shipped. ComparePage is routed at
        /compare/<pair> and the report has a working button in the side
        panel. The palette was telling people the product was smaller than
        it is, which is the opposite of the mistake this file was written to
        avoid, and it survived because nothing rechecks a `false` once it is
        written down.
      */
      {
        id: "compare",
        label: "Compare two cities",
        icon: "⚖️",
        available: true,
        run: () => {
          window.location.href = FEATURED_PAIR_PATHS[0] ?? "/";
        },
      },
      {
        id: "report",
        label: "Generate area report",
        icon: "📄",
        // Same gate as the side panel's own button: the report describes a
        // place, so it needs one picked first.
        available: !!location,
        requiresLocation: true,
        run: () => openReport(),
      },
    ],
    [location, openDirections, setIntelTab, openSection, openCopilot, toggle3D, setMeasureMode, openFeedback, openHelp, openSettings, openFeatureStatus, openAbout, openPrivacy, openGames, openReport]
  );

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const motionEnabled = useMotionPreference();

  const run = (c: Command) => {
    if (!c.available) {
      if (c.requiresLocation) {
        // Not a dead end — the actual next step to unblock this command is
        // picking a location, so send the user straight there instead of
        // silently doing nothing (which is what reads as "broken").
        document.querySelector<HTMLInputElement>(".search-bar__input")?.focus();
        setQuery("");
        close();
      }
      return;
    }
    c.run();
    setQuery("");
    close();
  };

  const body = (
    <>
      <div className="command-palette__input">
        <span aria-hidden="true">🔍</span>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to do?"
          aria-label="Command search"
        />
      </div>
      <ul className="command-palette__list">
        {filtered.length === 0 && <li className="command-palette__empty">No matching commands.</li>}
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={!c.available && c.requiresLocation ? "command-palette__needs-location" : undefined}
              disabled={!c.available && !c.requiresLocation}
              onClick={() => run(c)}
            >
              <span aria-hidden="true">{c.icon}</span>
              {c.label}
              {/*
                One reason to be unavailable, and it is always actionable.
                This used to fall back to "coming soon" for anything else,
                which is how two shipped features spent months advertised as
                unbuilt. There is no "anything else" now: a command that
                cannot be run belongs on the Feature Status page rather than
                in a list of things you can press.
              */}
              {!c.available && <em>pick a location first</em>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="command-palette__overlay" onClick={close}>
        <div className="command-palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
          {body}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="command-palette__overlay" onClick={close} {...overlayFade}>
          <motion.div className="command-palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Kept for callers that want to open the palette imperatively (e.g. a
// header button) without importing the store directly.
export function openCommandPalette() {
  useCommandPaletteStore.getState().open();
}
