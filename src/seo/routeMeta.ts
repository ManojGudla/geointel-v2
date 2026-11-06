/**
 * Title, description and canonical URL for every page that has its own URL.
 *
 * ONE source for two consumers:
 *  - the pages themselves (usePageMeta in CityPage, ComparePage, LandingPage),
 *    which set these in the browser after the app loads, and
 *  - the build step (plugins/vite-plugin-prerender.ts), which writes them into
 *    a real HTML file per URL, so the page is correct BEFORE any JavaScript
 *    runs.
 *
 * Why the second one exists: Vercel served the same index.html for every URL,
 * and that file declares the homepage as canonical. So /maps/hyderabad, every
 * /compare/ page and /ai-map-search all told any crawler, in their raw HTML,
 * "the real version of this page is the homepage", with the homepage's title
 * and description - and only corrected it after the JavaScript ran. Google
 * renders JavaScript eventually, but a canonical that changes between the raw
 * and rendered HTML is a conflicting signal, and crawlers and link previews
 * that do not run JavaScript (LinkedIn, WhatsApp, Bing often, AI crawlers)
 * never saw anything but the homepage.
 *
 * Only relative imports here: the build step loads this file from
 * vite.config.ts, where the "@/" alias does not exist.
 */
import { CITIES, type City } from "../data/cities";
import { canonicalPairSlug, parsePairSlug, FEATURED_PAIRS, type Pair } from "../features/compare/comparePairs";

export const SITE_ORIGIN = "https://www.manowj.com";

export interface RouteMeta {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  url: string;
}

export function cityMeta(city: City): RouteMeta {
  return {
    // Written to match how people actually search: the place first, then what
    // they can do. "maNOWj" is deliberately last - nobody is searching for a
    // brand they have never heard of.
    title: `${city.name} map, population and geographic data | maNOWj GeoIntel`,
    description: `${city.summary} Population, air quality, hospitals, schools and satellite imagery for ${city.name}, ${city.state}.`,
    url: `${SITE_ORIGIN}/maps/${city.slug}`,
  };
}

export function compareMeta(pair: Pair): RouteMeta {
  const { a, b } = pair;
  return {
    title: `${a.name} vs ${b.name}: population, air quality and geography | maNOWj GeoIntel`,
    description: `Compare ${a.name} and ${b.name} on population, area, density, air quality and what is nearby. Every figure shows its source and date.`,
    // Both orderings render, and both point at the one alphabetical URL.
    url: `${SITE_ORIGIN}/compare/${pair.canonicalSlug}`,
  };
}

/* Kept under about 155 characters: Google truncates a description roughly there. */
export const LANDING_META: RouteMeta = {
  title: "AI Map Search that shows its sources | maNOWj GeoIntel",
  description:
    "Ask any place on Earth a real question: how many hospitals within 5 km, what is here, what the air is like. Every answer shows its source and date.",
  url: `${SITE_ORIGIN}/ai-map-search`,
};

/* ------------------------------------------------------------------ build */

export interface PrerenderRoute {
  /** URL path, e.g. "/maps/hyderabad". */
  path: string;
  meta: RouteMeta;
  /** "noindex, nofollow" for pages that should never be in search results. */
  robots?: string;
  /** Static HTML for the #prerender block, read by anything that does not run JavaScript. */
  body: string;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cityLinks(except: string[]): string {
  const items = CITIES.filter((c) => !except.includes(c.slug))
    .map((c) => `<li><a href="/maps/${c.slug}">${esc(c.name)} map</a></li>`)
    .join("");
  return `<h2>More cities</h2><ul>${items}</ul>`;
}

function cityBody(city: City): string {
  const featured = FEATURED_PAIRS.filter(([x, y]) => x === city.slug || y === city.slug).map(([x, y]) => {
    const pair = parsePairSlug(`${x}-vs-${y}`)!;
    return `<li><a href="/compare/${pair.canonicalSlug}">${esc(pair.a.name)} vs ${esc(pair.b.name)}</a></li>`;
  });
  return [
    `<h1>${esc(city.name)} map and geographic data</h1>`,
    `<p>${esc(city.summary)}</p>`,
    `<h2>Geography</h2><p>${esc(city.geography)}</p>`,
    `<h2>Landmarks on the map</h2><ul>${city.landmarks.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
    `<h2>Questions you can ask about ${esc(city.name)}</h2><ul>${city.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`,
    featured.length ? `<h2>Compare ${esc(city.name)}</h2><ul>${featured.join("")}</ul>` : "",
    `<p><a href="/">Open ${esc(city.name)} in maNOWj GeoIntel</a></p>`,
    cityLinks([city.slug]),
  ].join("\n");
}

function compareBody(pair: Pair): string {
  const { a, b } = pair;
  return [
    `<h1>${esc(a.name)} vs ${esc(b.name)}</h1>`,
    `<p>Compare ${esc(a.name)} (${esc(a.state)}) and ${esc(b.name)} (${esc(b.state)}) on population, area, density, air quality and what is nearby. Every figure shows its source and date.</p>`,
    `<h2>${esc(a.name)}</h2><p>${esc(a.geography)}</p><p><a href="/maps/${a.slug}">${esc(a.name)} map</a></p>`,
    `<h2>${esc(b.name)}</h2><p>${esc(b.geography)}</p><p><a href="/maps/${b.slug}">${esc(b.name)} map</a></p>`,
    cityLinks([a.slug, b.slug]),
  ].join("\n");
}

/** Every URL that gets its own HTML file at build time. */
export function prerenderRoutes(): PrerenderRoute[] {
  const routes: PrerenderRoute[] = [];

  routes.push({
    path: "/ai-map-search",
    meta: LANDING_META,
    body: [
      `<h1>AI map search that shows its sources</h1>`,
      `<p>${esc(LANDING_META.description)}</p>`,
      `<p><a href="/">Open the map</a></p>`,
      cityLinks([]),
    ].join("\n"),
  });

  for (const city of CITIES) {
    routes.push({ path: `/maps/${city.slug}`, meta: cityMeta(city), body: cityBody(city) });
  }

  // Every ordering of every pair renders in the app, so every one gets a file
  // (with the canonical pointing at the alphabetical one); only the featured
  // pairs are in the sitemap.
  for (const a of CITIES) {
    for (const b of CITIES) {
      if (a.slug === b.slug) continue;
      const pair = parsePairSlug(`${a.slug}-vs-${b.slug}`)!;
      routes.push({ path: `/compare/${a.slug}-vs-${b.slug}`, meta: compareMeta(pair), body: compareBody(pair) });
    }
  }

  routes.push({
    path: "/privacy",
    meta: {
      title: "Privacy | maNOWj GeoIntel",
      description: "What maNOWj GeoIntel collects, what it does not, and how analytics and error reporting work only after you agree.",
      url: `${SITE_ORIGIN}/privacy`,
    },
    body: `<h1>Privacy</h1><p>What maNOWj GeoIntel collects, what it does not, and how analytics and error reporting work only after you agree.</p><p><a href="/">Open the map</a></p>`,
  });

  routes.push({
    path: "/status",
    meta: {
      title: "System status | maNOWj GeoIntel",
      description: "Live status of the data services behind maNOWj GeoIntel: map data, address search, weather, routing and AI.",
      url: `${SITE_ORIGIN}/status`,
    },
    body: `<h1>System status</h1><p>Live status of the data services behind maNOWj GeoIntel.</p><p><a href="/">Open the map</a></p>`,
  });

  routes.push({
    path: "/admin",
    meta: { title: "Admin | maNOWj GeoIntel", description: "Administration.", url: `${SITE_ORIGIN}/admin` },
    robots: "noindex, nofollow",
    body: `<h1>Admin</h1>`,
  });

  return routes;
}

export { canonicalPairSlug };
