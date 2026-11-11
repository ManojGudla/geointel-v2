/**
 * Just the URLs of the written pages, with none of their text.
 *
 * The app shell has to know these to tell a real page from a 404, and it is
 * in the entry bundle every visitor downloads. The pages' content
 * (infoPages.ts) is several kilobytes of prose that only someone opening one
 * of these pages needs, so it stays out of the shell and loads with the page.
 * tests/unit/infoPages.test.ts keeps the two lists identical.
 */
export const INFO_PATHS: readonly string[] = [
  "/area-report",
  "/tools/radius-search",
  "/tools/measure-area",
  "/tools/satellite-history",
  "/solutions/real-estate",
  "/solutions/retail-site-selection",
  "/solutions/urban-planning",
];
