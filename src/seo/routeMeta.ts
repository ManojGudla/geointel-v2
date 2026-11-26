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
import { INFO_PAGES, INFO_PAGE_BY_PATH, type InfoPage } from "./infoPages";
import { LANDING_FAQ, LANDING_FAQ_HEADING } from "./landingContent";

export const SITE_ORIGIN = "https://www.manowj.com";

/** The app's own entry in the homepage's structured data (index.html), which other pages point at by id. */
const APP_REF = { "@type": "SoftwareApplication", "@id": `${SITE_ORIGIN}/#app`, name: "maNOWj GeoIntel", url: `${SITE_ORIGIN}/` };

/** schema.org FAQPage built from the same items the page shows. */
function faqNode(url: string, items: Array<{ q: string; a: string }>): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    mainEntity: items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

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
    // brand they have never heard of. "| maNOWj" rather than "| maNOWj
    // GeoIntel" keeps every city inside the roughly 60 characters a result
    // shows; with the longer brand, eight of the twelve went past it.
    title: `${city.name} map, population and geographic data | maNOWj`,
    /*
      The summary alone. A second sentence used to follow it ("Population,
      air quality, hospitals, schools and satellite imagery for ..."), taking
      every description to 244-263 characters, but the summary already fills
      the 155-160 a result shows, so that sentence was never seen by anyone.
    */
    description: city.summary,
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

/**
 * Structured data for a city page. The page adds it in the browser (useJsonLd)
 * and the build step writes the same object into the page's static HTML, so a
 * crawler that runs no JavaScript sees a page about this city rather than the
 * homepage's "this is a web application" block repeated on every URL.
 */
export function citySchema(city: City): Record<string, unknown> {
  const url = `${SITE_ORIGIN}/maps/${city.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${city.name} map and geographic data`,
    description: city.summary,
    url,
    about: {
      "@type": "City",
      name: city.name,
      address: { "@type": "PostalAddress", addressRegion: city.state, addressCountry: "IN" },
      geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lon },
    },
    isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: `${SITE_ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "maNOWj GeoIntel", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: city.name, item: url },
      ],
    },
  };
}

export function compareSchema(pair: Pair): Record<string, unknown> {
  const { a, b } = pair;
  const url = `${SITE_ORIGIN}/compare/${pair.canonicalSlug}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${a.name} vs ${b.name}`,
    description: `A geographic comparison of ${a.name}, ${a.state} and ${b.name}, ${b.state}.`,
    url,
    about: [
      { "@type": "City", name: a.name, geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lon } },
      { "@type": "City", name: b.name, geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lon } },
    ],
    isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: `${SITE_ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "maNOWj GeoIntel", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: `${a.name} vs ${b.name}`, item: url },
      ],
    },
  };
}

export function infoMeta(page: InfoPage): RouteMeta {
  return { title: page.title, description: page.description, url: `${SITE_ORIGIN}${page.path}` };
}

/**
 * A written page's structured data: the page itself, the steps it shows as a
 * HowTo, and its questions as an FAQPage, all in one @graph.
 *
 * Each part is built from the same fields the page renders (the first
 * section with steps, and page.faq), never written separately, so the markup
 * can only claim what a visitor can read. Saying more in structured data than
 * the page shows is against Google's rules, and generating both from one
 * source is what makes that impossible rather than unlikely.
 *
 * An honest note on what this buys. Google stopped showing HowTo rich results
 * in September 2023 and FAQ rich results on 7 May 2026, so neither will make
 * a result look different there. They are still correct, valid descriptions
 * of the page that any other search engine or AI tool can read, and the
 * visible questions are worth having for people regardless.
 */
export function infoSchema(page: InfoPage): Record<string, unknown> {
  const url = `${SITE_ORIGIN}${page.path}`;
  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: page.h1,
      description: page.description,
      url,
      inLanguage: "en-IN",
      isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: `${SITE_ORIGIN}/` },
      about: APP_REF,
      author: { "@type": "Person", name: "Manoj Kumar Gudla" },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "maNOWj GeoIntel", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: page.nav, item: url },
        ],
      },
    },
  ];

  const howTo = page.sections.find((section) => section.steps && section.steps.length > 0);
  if (howTo?.steps) {
    graph.push({
      "@type": "HowTo",
      "@id": `${url}#howto`,
      name: howTo.heading,
      description: page.lead,
      inLanguage: "en-IN",
      step: howTo.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    });
  }

  if (page.faq && page.faq.items.length > 0) graph.push(faqNode(url, page.faq.items));

  return { "@context": "https://schema.org", "@graph": graph };
}

export const infoSchemaId = (page: InfoPage) => `info-${page.path.replace(/^\//, "").replace(/\//g, "-")}`;

/** The id useJsonLd and the build step both use, so the browser adopts the static block instead of adding a second. */
export const citySchemaId = (city: City) => `city-${city.slug}`;
export const compareSchemaId = (pair: Pair) => `compare-${pair.canonicalSlug}`;

/*
  Kept under about 155 characters: Google truncates a description roughly
  there. The title is the wording asked for with a colon for the long dash
  (the site's copy uses none) and "| maNOWj" for "| maNOWj GeoIntel", which
  would have taken it to 65 characters, past the roughly 60 a result shows.
*/
export const LANDING_META: RouteMeta = {
  title: "AI Map Search: Ask Questions About Any Location | maNOWj",
  description:
    "Ask any location a real question on a map: how many hospitals are within 5 km, what is here, what the air is like. Every answer shows its source and date.",
  url: `${SITE_ORIGIN}/ai-map-search`,
};

/** The AI map search page's own structured data: the page, and its visible questions. */
export function landingSchema(): Record<string, unknown> {
  const url = LANDING_META.url;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: "AI map search with sources",
        description: LANDING_META.description,
        url,
        inLanguage: "en-IN",
        isPartOf: { "@type": "WebSite", name: "maNOWj GeoIntel", url: `${SITE_ORIGIN}/` },
        about: APP_REF,
        author: { "@type": "Person", name: "Manoj Kumar Gudla" },
      },
      faqNode(url, LANDING_FAQ),
    ],
  };
}

export const LANDING_SCHEMA_ID = "landing";

/* ------------------------------------------------------------------ build */

export interface PrerenderRoute {
  /** URL path, e.g. "/maps/hyderabad". */
  path: string;
  meta: RouteMeta;
  /** "noindex, nofollow" for pages that should never be in search results. */
  robots?: string;
  /** Static HTML for the #prerender block, read by anything that does not run JavaScript. */
  body: string;
  /** This page's own structured data. Replaces the homepage's block in the static HTML. */
  jsonLd?: { id: string; data: Record<string, unknown> };
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

/**
 * The app's own link for a city, in the format of encodeViewState
 * (src/features/share/viewState.ts) with the same default zoom CityPage uses.
 * Written out here because this file is also compiled for the build step,
 * which has neither the browser nor the "@/" paths that module imports; the
 * test in cityStaticLinks.test.ts holds the two to the same output.
 */
export function cityAppPath(city: Pick<City, "lat" | "lon" | "zoom">, question?: string): string {
  return appViewPath({ lat: city.lat, lon: city.lon, zoom: city.zoom, question });
}

/**
 * Any app link, in encodeViewState's exact format and parameter order, with
 * CityPage's default zoom of 12 left out. cityStaticLinks.test.ts checks the
 * two produce the same string.
 */
export function appViewPath(view: {
  lat: number;
  lon: number;
  zoom?: number;
  basemap?: "satellite" | "dark" | "terrain";
  radiusMeters?: number;
  section?: "layers" | "tools" | "ai" | "travel";
  tab?: "site" | "evidence" | "live" | "nearby";
  question?: string;
}): string {
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  const params = new URLSearchParams();
  params.set("lat", String(round(view.lat, 5)));
  params.set("lon", String(round(view.lon, 5)));
  if (view.zoom !== undefined && round(view.zoom, 1) !== 12) params.set("z", String(round(view.zoom, 1)));
  if (view.basemap) params.set("map", view.basemap);
  if (view.radiusMeters !== undefined) params.set("r", String(Math.round(view.radiusMeters)));
  if (view.section) params.set("s", view.section);
  if (view.tab) params.set("t", view.tab);
  if (view.question) params.set("q", view.question.slice(0, 200));
  return `/?${params.toString()}`;
}

/**
 * The tools, opened at this city's centre and already running.
 *
 * Shared by the static HTML and CityPage, like everything else here. Each one
 * is a link the app can act on: the question is a map command the app answers
 * itself (no AI involved), and the rest are panels it opens on arrival.
 */
export function cityToolLinks(city: City): Array<{ label: string; href: string; guide: string }> {
  const at = { lat: city.lat, lon: city.lon };
  return [
    {
      label: `Neighbourhood report for central ${city.name}`,
      href: appViewPath({ ...at, zoom: 15, radiusMeters: 1000, tab: "evidence" }),
      guide: "/area-report",
    },
    {
      label: `Hospitals within 5 km of central ${city.name}`,
      href: appViewPath({ ...at, zoom: 13, question: "hospitals within 5 km" }),
      guide: "/tools/radius-search",
    },
    {
      label: `${city.name} on satellite, with past versions of the imagery`,
      href: appViewPath({ ...at, zoom: city.zoom, basemap: "satellite", section: "layers" }),
      guide: "/tools/satellite-history",
    },
    {
      label: `Measure distances and land area in ${city.name}`,
      href: appViewPath({ ...at, zoom: city.zoom, section: "tools" }),
      guide: "/tools/measure-area",
    },
  ];
}

/** "17.3850° N, 78.4867° E": how the static page and CityPage both write a city's centre. */
export function formatCityCentre(city: Pick<City, "lat" | "lon">): string {
  const lat = `${Math.abs(city.lat).toFixed(4)}° ${city.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(city.lon).toFixed(4)}° ${city.lon >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}

function cityBody(city: City): string {
  const featured = FEATURED_PAIRS.filter(([x, y]) => x === city.slug || y === city.slug).map(([x, y]) => {
    const pair = parsePairSlug(`${x}-vs-${y}`)!;
    return `<li><a href="/compare/${pair.canonicalSlug}">${esc(pair.a.name)} vs ${esc(pair.b.name)}</a></li>`;
  });
  /* The same links the page itself uses once it loads (CityPage's
     openInApp). The static copy used to send "Open Hyderabad" to the bare
     homepage, so a visitor or crawler following it landed on the default map
     with no city selected, and the example questions were plain text. */
  const appLink = (question?: string) => esc(cityAppPath(city, question));
  return [
    `<h1>${esc(city.name)} map and geographic data</h1>`,
    `<p>${esc(city.summary)}</p>`,
    /* Only what is fixed and checkable goes in static HTML. Population, area,
       air quality and ground height change or come from a live source, so
       the page looks them up when it loads (CityPage) instead of baking a
       number in here to go quietly out of date. */
    `<h2>${esc(city.name)} at a glance</h2><ul>` +
      `<li>City centre: ${esc(formatCityCentre(city))} (WGS 84)</li>` +
      `<li>State: ${esc(city.state)}, India</li>` +
      `<li>Population, area, air quality, ground height and counts of hospitals, schools and other places are looked up live when this page opens, each with its source and date.</li>` +
      `</ul>`,
    `<h2>Tools to use in ${esc(city.name)}</h2><ul>${cityToolLinks(city)
      .map((tool) => `<li><a href="${esc(tool.href)}">${esc(tool.label)}</a></li>`)
      .join("")}</ul>`,
    `<h2>Geography</h2><p>${esc(city.geography)}</p>`,
    `<h2>Landmarks on the map</h2><ul>${city.landmarks.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`,
    `<h2>Questions you can ask about ${esc(city.name)}</h2><ul>${city.questions.map((q) => `<li><a href="${appLink(q)}">${esc(q)}</a></li>`).join("")}</ul>`,
    featured.length ? `<h2>Compare ${esc(city.name)}</h2><ul>${featured.join("")}</ul>` : "",
    `<p><a href="${appLink()}">Open ${esc(city.name)} on the map</a></p>`,
    infoLinks(""),
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

function infoLinks(except: string): string {
  const items = INFO_PAGES.filter((p) => p.path !== except)
    .map((p) => `<li><a href="${p.path}">${esc(p.nav)}</a></li>`)
    .join("");
  return `<h2>Tools and guides</h2><ul>${items}</ul>`;
}

/** Questions as headings with their answers under them: readable without JavaScript, and what FAQPage marks up. */
function faqHtml(heading: string, items: Array<{ q: string; a: string }>): string {
  return `<h2>${esc(heading)}</h2>${items.map(({ q, a }) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}`;
}

function infoBody(page: InfoPage): string {
  const section = (s: InfoPage["sections"][number]) =>
    [
      `<h2>${esc(s.heading)}</h2>`,
      ...(s.paragraphs ?? []).map((text) => `<p>${esc(text)}</p>`),
      s.steps ? `<ol>${s.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>` : "",
      s.bullets ? `<ul>${s.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "",
    ].join("");
  return [
    `<h1>${esc(page.h1)}</h1>`,
    `<p>${esc(page.lead)}</p>`,
    `<p><a href="/">Open the map</a>. Free, no sign-up.</p>`,
    `<h2>Try it on a real place</h2><ul>${page.examples.map((e) => `<li><a href="${esc(e.href)}">${esc(e.label)}</a></li>`).join("")}</ul>`,
    ...page.sections.map(section),
    page.faq ? faqHtml(page.faq.heading, page.faq.items) : "",
    `<h2>What it cannot tell you</h2><ul>${page.limits.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`,
    infoLinks(page.path),
    cityLinks([]),
  ].join("\n");
}

/** Every URL that gets its own HTML file at build time. */
export function prerenderRoutes(): PrerenderRoute[] {
  const routes: PrerenderRoute[] = [];

  routes.push({
    path: "/ai-map-search",
    meta: LANDING_META,
    body: [
      // The same heading LandingPage shows, without its line break.
      `<h1>AI map search with sources</h1>`,
      `<p>${esc(LANDING_META.description)}</p>`,
      `<h2>What you can ask</h2>`,
      `<ul><li>How many hospitals are within 5 km of this point?</li><li>What is here, and what is within 800 m?</li><li>Where is the nearest metro station, pharmacy or ATM?</li><li>Is this a good place for a restaurant, a shop or a clinic?</li><li>What is the weather and the air quality here right now?</li></ul>`,
      `<h2>How the answers are made</h2>`,
      `<p>Counts, distances and nearest places are worked out directly from OpenStreetMap data, not guessed by a language model. The AI writes its summary only from the facts already loaded for the place you chose, and every answer lists the sources and dates it used. Where a source has no figure, the app says so.</p>`,
      faqHtml(LANDING_FAQ_HEADING, LANDING_FAQ),
      `<p><a href="/">Open the map</a>. Free, no sign-up.</p>`,
      infoLinks(""),
      cityLinks([]),
    ].join("\n"),
    jsonLd: { id: LANDING_SCHEMA_ID, data: landingSchema() },
  });

  for (const page of INFO_PAGES) {
    routes.push({
      path: page.path,
      meta: infoMeta(page),
      body: infoBody(page),
      jsonLd: { id: infoSchemaId(page), data: infoSchema(page) },
    });
  }

  for (const city of CITIES) {
    routes.push({
      path: `/maps/${city.slug}`,
      meta: cityMeta(city),
      body: cityBody(city),
      jsonLd: { id: citySchemaId(city), data: citySchema(city) },
    });
  }

  // Every ordering of every pair renders in the app, so every one gets a file
  // (with the canonical pointing at the alphabetical one); only the featured
  // pairs are in the sitemap.
  for (const a of CITIES) {
    for (const b of CITIES) {
      if (a.slug === b.slug) continue;
      const pair = parsePairSlug(`${a.slug}-vs-${b.slug}`)!;
      routes.push({
        path: `/compare/${a.slug}-vs-${b.slug}`,
        meta: compareMeta(pair),
        body: compareBody(pair),
        jsonLd: { id: compareSchemaId(pair), data: compareSchema(pair) },
      });
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

export { canonicalPairSlug, INFO_PAGE_BY_PATH, LANDING_FAQ, LANDING_FAQ_HEADING };
