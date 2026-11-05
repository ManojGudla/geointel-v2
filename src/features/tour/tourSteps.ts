export interface TourStep {
  /** CSS selectors tried in order; the first one visible on this screen is highlighted. */
  targets: string[];
  title: string;
  text: string;
}

/**
 * The tour, in the order someone would actually use the app. Each line says
 * what the thing DOES for you, in plain words, not what it is called.
 * A step whose target isn't on screen (a phone hides some things) is skipped.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    targets: [".search-bar input"],
    title: "Search anything",
    text: "Type a place, an address, or a question like \"hospitals within 2 km\". Results show on the map.",
  },
  {
    targets: [".near-me"],
    title: "Near me, in one tap",
    text: "Petrol, ATMs, hospitals, food, metro and more, around where you are right now.",
  },
  {
    targets: [".locate__btn"],
    title: "Your live location",
    text: "The blue dot follows you, like Google or Apple Maps. Tap again to come back to it.",
  },
  {
    targets: [".quick-actions__row"],
    title: "Quick tools",
    text: "Directions, what's around a place, nearby places, measuring distance or area, and 3D buildings.",
  },
  {
    targets: [".nav-rail"],
    title: "Every tool lives here",
    text: "Explore a place, switch map layers and satellite view, analyse an area, ask questions, or plan a trip.",
  },
  {
    targets: [".copilot-launcher", ".nav-rail__item:nth-child(4)"],
    title: "Ask maNOWj",
    text: "Ask about the place on the map in English, Telugu, Hindi or any mix. Answers come only from real data.",
  },
  {
    targets: [".app-header__more > button"],
    title: "More",
    text: "Games, settings, feedback, privacy, and this tour again whenever you want it.",
  },
];
