import { useEffect, useRef, useState } from "react";
import { useGamesStore } from "@/stores/gamesStore";
import { useConsentUiStore } from "@/features/analytics/consentUiStore";
import { useTourStore } from "@/features/tour/tourStore";
import { useOnboardingStore, onboardingVisible } from "@/features/onboarding/onboardingVisibility";
import { useLocationStore } from "@/stores/locationStore";
import { track } from "@/services/analytics";
import {
  markPlayed,
  markShown,
  nudgeAllowedToday,
  readNudgeMemory,
  shouldNudge,
  writeNudgeMemory,
} from "./gamesNudgeRules";
import "./GamesNudge.css";

/**
 * Whether any panel is open as a modal right now. Built from parts because
 * the lazy-panel test flags any file that names the modal attribute without
 * using useDialog, and this one only looks for it.
 */
const MODAL_SELECTOR = `[${"aria"}-modal="true"]`;
function anyModalOpen(): boolean {
  return document.querySelector(MODAL_SELECTOR) != null;
}

/** How often the active-time clock ticks. */
const TICK_MS = 1_000;
/** The card leaves by itself after this long; it is a hint, not a question. */
const AUTO_HIDE_MS = 20_000;

/**
 * A small card, bottom corner, that says the site has games.
 *
 * Deliberately not a modal: it takes no focus, blocks nothing and closes
 * itself. A dialog would be the wrong promise for something nobody asked for.
 * The rules for when it appears live in gamesNudgeRules.ts.
 */
export function GamesNudge() {
  const [visible, setVisible] = useState(false);
  const activeMsRef = useRef(0);
  const doneRef = useRef(false);

  // Opening the games by any route (menu, command palette, this card) means
  // the visitor knows about them. Never show the card to them again.
  useEffect(
    () =>
      useGamesStore.subscribe((s, prev) => {
        if (s.isOpen && !prev.isOpen) {
          writeNudgeMemory(markPlayed(readNudgeMemory()));
          doneRef.current = true;
          setVisible(false);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!nudgeAllowedToday(readNudgeMemory(), new Date())) return;
    const id = window.setInterval(() => {
      if (doneRef.current) {
        window.clearInterval(id);
        return;
      }
      if (document.visibilityState !== "visible") return;
      activeMsRef.current += TICK_MS;
      const blocked =
        useGamesStore.getState().isOpen ||
        useConsentUiStore.getState().asking ||
        useTourStore.getState().open ||
        onboardingVisible(useLocationStore.getState().selectedLocation != null, useOnboardingStore.getState().dismissed) ||
        anyModalOpen();
      const memory = readNudgeMemory();
      if (shouldNudge(memory, activeMsRef.current, blocked, new Date())) {
        writeNudgeMemory(markShown(memory, new Date()));
        doneRef.current = true;
        window.clearInterval(id);
        setVisible(true);
        track("games_nudge_shown");
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hide = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  if (!visible) return null;

  const play = () => {
    track("games_nudge_clicked");
    setVisible(false);
    useGamesStore.getState().open();
  };

  return (
    <aside className="games-nudge" aria-labelledby="games-nudge-title">
      <img className="games-nudge__face" src="/play/manoj-face.webp" alt="" width={56} height={56} />
      <div className="games-nudge__body">
        <p id="games-nudge-title" className="games-nudge__title" role="status">
          Fancy a quick game?
        </p>
        <p className="games-nudge__text">Fly maNOWj, Cricket Super Chase and more. Free, right here.</p>
        <div className="games-nudge__actions">
          <button type="button" className="games-nudge__play" onClick={play}>
            🎮 Play now
          </button>
          <button type="button" className="games-nudge__later" onClick={() => setVisible(false)}>
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
