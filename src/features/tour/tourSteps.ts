export interface TourStep {
  /** CSS selectors tried in order; the first one visible on this screen is highlighted. */
  targets: string[];
  /**
   * "children": light up just the buttons inside the target, not the whole
   * element. The nav rail runs the full height of the screen, so lighting
   * the rail itself left no room for the card anywhere above or below it.
   */
  fit?: "children";
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
    text: "Fuel, ATMs, hospitals, food, transit and more, around where you are right now.",
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
    fit: "children",
    title: "The main sections",
    text: "Explore a place, switch map layers and satellite view, analyse an area, use the AI agents, or plan a trip.",
  },
  {
    targets: [".nav-rail__item:nth-child(4)"],
    title: "AI agents",
    text: "Six AI agents explain any place you pick: the area, the property, getting there and a day plan. Every answer shows its sources.",
  },
  {
    targets: [".copilot-launcher"],
    title: "Ask maNOWj",
    text: "Ask about the place on the map in English, Telugu, Hindi or any mix. Answers come only from real data.",
  },
  {
    targets: [".app-header__tools-btn"],
    title: "All tools",
    text: "Every feature in one list. Tap it, then type what you want to do, like \"report\" or \"satellite\".",
  },
  {
    targets: [".app-header__more > button"],
    title: "More",
    text: "Games, settings, feedback, privacy, and this tour again whenever you want it.",
  },
];
