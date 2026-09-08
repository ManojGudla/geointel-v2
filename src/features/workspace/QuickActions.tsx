import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useMeasureStore } from "@/stores/measureStore";
import { useShellStore } from "@/stores/shellStore";
import { useShow3D } from "@/features/map/useShow3D";
import { useMapStore } from "@/stores/mapStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { totalEvidenceCount } from "@/features/gis/evidenceTotal";
import { nextStep } from "./nextStep";
import "./QuickActions.css";

/**
 * One-tap shortcuts under the search box, for the handful of things people
 * do straight after finding a place.
 *
 * Two bugs are fixed here, both of which made these read as broken:
 *
 * 1. They used to only set an internal tab. If the panel holding that tab
 *    was closed — which it was, most of the time — pressing "Nearby"
 *    changed nothing visible. Every one of them now opens the surface it
 *    names as well as selecting within it.
 *
 * 2. Directions, What's here and Nearby need a chosen place, and before one was
 *    chosen they were rendered `disabled` at half opacity with no
 *    explanation. That is the worst of both worlds: they look broken, and
 *    pressing them does nothing to tell you otherwise. They are now live
 *    buttons in a "needs a place" state — pressing one puts the cursor in
 *    the search box, which is the actual next step, and the row says so in
 *    one line underneath.
 *
 * The middle button used to read "Analyse", which collided with the rail's
 * own "Analyse" section — same word, two destinations. This one opens the
 * evidence for the selected place; the rail's opens the measurement and
 * spatial-analysis tools. Naming this one for what it shows removes the
 * collision without moving either feature.
 */
export function QuickActions() {
  const location = useLocationStore((s) => s.selectedLocation);
  const openDirections = useRouteStore((s) => s.openPanel);
  const setIntelTab = useIntelTabStore((s) => s.setTab);
  const setMeasureMode = useMeasureStore((s) => s.setMode);
  const openSection = useShellStore((s) => s.openSection);
  const { is3D, toggle: toggle3DWithBuildings } = useShow3D();
  const radiusMeters = useLocationStore((s) => s.radiusMeters);
  const setRadiusMeters = useLocationStore((s) => s.setRadiusMeters);
  const zoom = useMapStore((s) => s.zoom);

  /**
   * Free: the same query the Explore panel already runs, with the same key,
   * so React Query serves it from cache rather than fetching a second time.
   * No extra request is made to show the suggestion below.
   */
  const evidence = useGisEvidence();
  const step = nextStep({
    hasLocation: !!location,
    evidenceCount: evidence.data ? totalEvidenceCount(evidence.data.counts) : null,
    radiusMeters,
    is3D,
    zoom,
  });

  const runStep = () => {
    if (!step) return;
    switch (step.action) {
      case "show3D":
        toggle3DWithBuildings();
        break;
      case "analyse":
        openSection("tools");
        break;
      case "widenRadius":
        setRadiusMeters(1000);
        break;
      case "imagery":
        openSection("layers");
        break;
      case "ask":
        openSection("ai");
        break;
    }
  };

  const showPlaceTab = (tab: "evidence" | "nearby") => {
    setIntelTab(tab);
    openSection("place");
  };

  /**
   * Sends the user to the one thing that unlocks these actions.
   *
   * The focus call alone was not enough, and that is worth spelling out
   * because it looked finished. Pressing Directions with no place selected
   * DID move the caret into the search box — but a focus ring on a box the
   * user was not looking at is invisible in practice. Watching someone use
   * it, the button reads as broken: they press, nothing appears to happen,
   * and they conclude the site does not work.
   *
   * So the box is now briefly outlined as well. Same behaviour, made
   * visible — the point is to connect the press to the thing it wants you to
   * do next, not to explain it in text nobody reads.
   */
  const promptForPlace = () => {
    const input = document.querySelector<HTMLInputElement>(".search-bar__input");
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: "nearest" });
    // Restarted rather than merely added, so a second press re-plays the cue
    // instead of doing nothing because the class is already there.
    input.classList.remove("search-bar__input--nudge");
    void input.offsetWidth;
    input.classList.add("search-bar__input--nudge");
    window.setTimeout(() => input.classList.remove("search-bar__input--nudge"), 1400);
  };

  const needsPlace = !location;

  const run = (action: () => void) => () => {
    if (needsPlace) {
      promptForPlace();
      return;
    }
    action();
  };

  return (
    <div className="quick-actions">
      <div className="quick-actions__row">
        <button
          type="button"
          className={needsPlace ? "quick-actions__needs-place" : undefined}
          onClick={run(() => openDirections(location ?? undefined))}
          title={needsPlace ? "Pick a place first — this will take you to the search box" : "Get directions to this place"}
        >
          🧭 Directions
        </button>
        <button
          type="button"
          className={needsPlace ? "quick-actions__needs-place" : undefined}
          onClick={run(() => showPlaceTab("evidence"))}
          title={needsPlace ? "Pick a place first — this will take you to the search box" : "See what is mapped around this place, with its sources"}
        >
          📊 What's here
        </button>
        <button
          type="button"
          className={needsPlace ? "quick-actions__needs-place" : undefined}
          onClick={run(() => showPlaceTab("nearby"))}
          title={needsPlace ? "Pick a place first — this will take you to the search box" : "Find places nearby"}
        >
          📍 Nearby
        </button>
        {/* Measure needs no place — you can measure anywhere on the map — so
            it is never in the "needs a place" state. */}
        <button
          type="button"
          onClick={() => {
            setMeasureMode("distance");
            openSection("tools");
          }}
          title="Measure a distance on the map"
        >
          📏 Measure
        </button>
        {/* Neither does 3D — it is a property of the view, not of a place. */}
        <button
          type="button"
          className={is3D ? "quick-actions__on" : undefined}
          onClick={toggle3DWithBuildings}
          aria-pressed={is3D}
          title={
            is3D
              ? "Turn 3D off and flatten the map"
              : "Tilt the map and extrude real building shapes, at their real heights"
          }
        >
          🏙️ {is3D ? "3D on" : "3D"}
        </button>
      </div>

      {needsPlace && (
        <p className="quick-actions__hint">
          Search for a place, or click anywhere on the map, to use the first three.
        </p>
      )}

      {/* One suggestion, tied to this place, with the button that does it.
          See nextStep.ts for why it is one sentence and not a list. */}
      {!needsPlace && step && (
        <p className="quick-actions__next">
          <span className="quick-actions__next-text">{step.text}</span>
          <button type="button" className="quick-actions__next-go" onClick={runStep}>
            {step.label}
          </button>
        </p>
      )}
    </div>
  );
}
