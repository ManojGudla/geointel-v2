/**
 * The AI map search page's questions and answers.
 *
 * They used to live inside LandingPage.tsx, which meant only the browser
 * could read them: the build step that writes /ai-map-search's static HTML
 * cannot import a React file, so anything that does not run JavaScript saw a
 * page with no FAQ at all, and the FAQPage structured data existed only after
 * the app loaded. One list here feeds the visible section, the static HTML
 * and the structured data, so the three cannot drift apart.
 *
 * Real questions people ask before trusting a tool like this, answered
 * honestly, including the places the answer is "no".
 *
 * Only relative imports: the build step loads this from vite.config.ts.
 */
export const LANDING_FAQ_HEADING = "The questions worth asking before you trust it.";

export const LANDING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is it actually free, or free-for-now?",
    a: "Free. There is no account, no trial clock and no paid tier today. It runs on free public data, which is what makes giving it away sustainable rather than a growth tactic.",
  },
  {
    q: "What do you collect about me?",
    a: "Nothing loads until you answer the banner. Say no and the site behaves exactly the same. No analytics, no error tracking, no third-party tags. You do not have to take that on trust: say no, then watch the network tab.",
  },
  {
    q: "How accurate are the answers?",
    a: "As accurate as the source it came from, which is exactly why the source is printed next to it. OpenStreetMap is mapped by volunteers and it is genuinely uneven between regions: dense in some cities, thin in others. Where a source has no figure, the app says so rather than estimating one.",
  },
  {
    q: "Can I use this for work?",
    a: "Yes. The answers come from open data, so check each source's own licence before you redistribute anything. OpenStreetMap is ODbL, and the imagery carries Esri's and NASA's terms.",
  },
  {
    q: "Why not just use Google Maps?",
    a: "Different job. Google Maps is navigation-first and will not tell you how many clinics sit inside a 2 km circle, or which source and year a population figure came from. This is built for counting, measuring and citing.",
  },
  {
    q: "Does it work offline?",
    a: "No. Every answer is a live query against a live source, which is the trade for never serving you a stale number without saying so.",
  },
];
