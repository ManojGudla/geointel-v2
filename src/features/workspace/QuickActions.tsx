import { useLocationStore } from "@/stores/locationStore";
import { useRouteStore } from "@/stores/routeStore";
import { useIntelTabStore } from "@/stores/intelTabStore";
import { useMeasureStore } from "@/stores/measureStore";
import { useShellStore } from "@/stores/shellStore";
import { useShow3D } from "@/features/map/useShow3D";
import { useMapStore } from "@/stores/mapStore";
import { useGisEvidence } from "@/features/gis/useGisEvidence";
import { totalEvidenceCount } from "@/features/gis/evidenceTotal";
import { useNavigationStore } from "@/features/routing/navigation/navStore";
import { selectMapPoint } from "@/features/location/selectPoint";
import { nextStep } from "./nextStep";
import "./QuickActions.css";

/**
 * One-tap shortcuts under the search box, for the handful of things people
 * do straight after finding a place.
 *
 * Two bugs are fixed here, both of which made these read as broken:
 *
 * 1. They used to only set an internal tab. If the panel holding that tab
 *    was closed - which it was, most of the time - pressing "Nearby"
 *    changed nothing visible. Every one of them now opens the surface it
 *    names as well as selecting within it.
 *
 * 2. Directions, What's here and Nearby need a chosen place, and before one was
 *    chosen they were rendered `disabled` at half opacity with no
 *    explanation. That is the worst of both worlds: they look broken, and
 *    pressing them does nothing to tell you otherwise. They are now live
 *    buttons in a "needs a place" state - pressing one puts the cursor in
 *    the search box, which is the actual next step, and the row says so in
 *    one line underneath.
 *
 * The middle button used to read "Analyse", which collided with the rail's
 * own "Analyse" section - same word, two destinations. This one opens the
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
  const basemap = useMapStore((s) => s.basemap);

  // Measurement state
  const measureMode = useMeasureStore((s) => s.mode);
  const measurePoints = useMeasureStore((s) => s.points);

  // Navigation state
  const navState = useNavigationStore((s) => s.state);

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
    basemap,
    measureMode,
    measurePoints,
    navState,
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
      case "measure":
        // The running total lives in the Measure group of the tools panel.
        openSection("tools");
        break;
      case "navigate":
        // Directions, where turn-by-turn lives. This used to open the Travel
        // section, which is the flights-and-hotels planner.
        openDirections();
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
   * DID move the caret into the search box - but a focus ring on a box the
   * user was not looking at is invisible in practice. Watching someone use
   * it, the button reads as broken: they press, nothing appears to happen,
   * and they conclude the site does not work.
   *
   * So the box is now briefly outlined as well. Same behaviour, made
   * visible - the point is to connect the press to the thing it wants you to
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

  /**
   * Answers the question the button asks, about the place you are looking at.
   *
   * "What's here" and "Nearby" used to do nothing at all until a place had
   * been selected: the press was swallowed and the search box was outlined
   * for 1.4 seconds. Reported by more than a hundred users as the app not
   * working, and reasonably so - you land on a map showing your city, press
   * the most obvious button on the screen, and nothing happens.
   *
   * There was never a good reason for it. Both questions are about a point,
   * and there has been a perfectly good point on screen the whole time: the
   * centre of the current view, which is the thing the visitor is literally
   * looking at. So pressing the button now selects that centre and answers
   * for it, exactly as clicking the map would, down the same selectMapPoint
   * path so the marker, the Explore panel and every downstream query behave
   * identically however the place was chosen.
   *
   * The location is labelled "Map centre" rather than "Map click", because
   * the app's whole promise is that it says where its answers come from.
   */
  const runHere = (action: () => void) => () => {
    if (needsPlace) {
      const [lon, lat] = useMapStore.getState().center;
      // Not awaited: selectMapPoint writes a coordinate-only location
      // synchronously and upgrades it when the reverse geocode lands, so the
      // panel opens in this frame rather than after a network round trip.
      void selectMapPoint(lat, lon, undefined, "Map centre");
    }
    action();
  };

  /**
   * Directions is the one that still needs you to choose, and keeps the
   * prompt. Routing to the middle of whatever you happen to be looking at is
   * not a destination anybody meant to ask for, so guessing there would
   * replace a dead button with a confusing answer.
   */
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
          title={needsPlace ? "Pick a place first. This will take you to the search box" : "Get directions to this place"}
        >
          🧭 Directions
        </button>
        {/* No longer wearing the needs-place styling: these two answer for
            the centre of the view when nothing is chosen, so there is no
            such state to signal. */}
        <button
          type="button"
          onClick={runHere(() => showPlaceTab("evidence"))}
          title={needsPlace ? "See what is mapped at the centre of this view, with its sources" : "See what is mapped around this place, with its sources"}
        >
          📊 What's here
        </button>
        <button
          type="button"
          onClick={runHere(() => showPlaceTab("nearby"))}
          title={needsPlace ? "Find places around the centre of this view" : "Find places nearby"}
        >
          📍 Nearby
        </button>
        {/* Measure needs no place - you can measure anywhere on the map - so
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
        {/* Neither does 3D - it is a property of the view, not of a place. */}
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

      {/* Was "to use the first three", which is no longer true and was never
          a useful sentence: it told you what you could not do rather than
          what you could. Only Directions needs a destination now, and the
          line says the thing worth knowing - that the other buttons will
          answer for whatever you have centred. */}
      {needsPlace && (
        <p className="quick-actions__hint">
          What's here and Nearby answer for the centre of the map. Search a place or click the map to choose a
          different point, and to get directions.
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
