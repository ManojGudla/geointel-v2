import { create } from "zustand";

/**
 * Which workspace section is showing, and whether its panel is open.
 *
 * Why this exists: the previous layout scattered features across six
 * unrelated places — a header menu, a quick-action row, a tabbed left panel,
 * a right rail, a floating launcher, and an agent strip below the fold that
 * most people never scrolled to. Two separate scrollbars sat fourteen pixels
 * apart at the right edge, so nobody could tell which one moved what.
 * People who weren't shown the app in person couldn't find the features, and
 * that's a navigation problem, not a missing-feature problem.
 *
 * Everything now hangs off one labelled rail with one panel, so there is
 * exactly one place to look and exactly one thing that scrolls.
 */
export type ShellSection = "place" | "layers" | "tools" | "ai" | "travel";

/**
 * Wide screens start with the panel OPEN. Phones and small laptops start closed.
 *
 * The old rule was "closed everywhere", on the argument that the map is the
 * product and nothing in the panel is worth 380 pixels of it. That argument
 * holds on a phone, where 380 pixels IS the map. It does not hold on a 1440
 * pixel desktop, where the same 380 pixels is a quarter of the screen and
 * the other 1060 is still more map than most people ever look at.
 *
 * What it cost was the thing people actually reported: on Windows and Mac
 * they could not find the features. With the panel shut, everything this app
 * does is represented by five eleven-pixel words in a 78 pixel column
 * against a full-screen map, and a rail that narrow reads as decoration
 * rather than navigation. Nobody clicks it, so nobody finds anything behind
 * it. Every serious mapping platform — ArcGIS, the state digital twins, the
 * analysis suites — opens with its panel showing, and they all do it for
 * this reason.
 *
 * It opens on "layers" (Map data & style) rather than "place", because that
 * is the one section with something to say before anything is selected:
 * basemaps, 3D, data layers, imagery. Opening on an empty Explore panel
 * would prove the old argument right.
 */
const DESKTOP_MIN_WIDTH = 1200;

function isWideScreen(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;
}

function startsOpen(): boolean {
  return isWideScreen();
}

function startingSection(): ShellSection {
  return isWideScreen() ? "layers" : "place";
}

interface ShellState {
  section: ShellSection;
  open: boolean;
  /** Opens a section, or closes the panel if that section is already showing. */
  toggleSection: (section: ShellSection) => void;
  /** Opens a section unconditionally — for deep links from elsewhere in the app. */
  openSection: (section: ShellSection) => void;
  closePanel: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  section: startingSection(),
  open: startsOpen(),
  toggleSection: (section) =>
    set((state) => (state.open && state.section === section ? { open: false } : { section, open: true })),
  openSection: (section) => set({ section, open: true }),
  closePanel: () => set({ open: false }),
}));

/**
 * Opens the Explore panel the first time a location is selected, wherever
 * that selection came from — search, a map click, an example chip, a shared
 * link. Selecting a place and having nothing visibly happen is the single
 * most disorienting thing this app could do, and wiring it here rather than
 * into each of those call sites means a new way of selecting a place can't
 * forget to do it.
 *
 * Only forces the panel open on the transition from "nothing selected" to
 * "something selected". Re-selecting while the user has deliberately closed
 * the panel leaves it closed.
 */
export function watchLocationForPanel(subscribe: (listener: (hasLocation: boolean) => void) => () => void): () => void {
  let previous = false;
  return subscribe((hasLocation) => {
    if (hasLocation && !previous) {
      /**
       * Switches to Explore whether or not the panel was already open.
       *
       * This used to only act when the panel was CLOSED, which was right
       * when the panel started closed everywhere. Now that wide screens
       * start open on Map data, that guard would mean searching a place on a
       * desktop left the panel sitting on basemap switches — the user asks
       * "what is at this address", the app answers with a list of map
       * styles. The transition still only fires once per selection, so a
       * panel the user deliberately closed stays closed.
       */
      useShellStore.setState({ section: "place", open: true });
    }
    previous = hasLocation;
  });
}
