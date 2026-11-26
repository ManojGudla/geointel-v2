# SEO pass, November 2026

Done on branch `property-directions-seo` from the brief "Act as a Senior Full-Stack & Technical SEO Engineer" (26 November 2026). Earlier findings are in SEO_AUDIT.md.

**Data limits.** No access to Google Search Console or any ranking or keyword-volume tool, so nothing here states how the site ranks or what Google currently shows under its results. Everything below was checked in the code, the production build and a browser.

## 1. The files (step 1 of the brief)

The brief assumed Next.js (`app/`, `pages/`, `sitemap.ts`). This is a Vite and React single-page app, so the equivalents are:

| Job | File |
|---|---|
| Homepage title, description, canonical link, social cards, structured data, the text shown without JavaScript, the JavaScript notice | `index.html` |
| One HTML file per page at build time (155 pages and 404.html), each with its own title, description, canonical link, structured data and text | `plugins/vite-plugin-prerender.ts` |
| Titles, descriptions, canonical links, structured data and static text for every page with its own address | `src/seo/routeMeta.ts` |
| The area report, tool and solution pages' content (one source for the page and its static HTML) | `src/seo/infoPages.ts`, `src/seo/infoPaths.ts` |
| The AI map search page's questions and answers (new) | `src/seo/landingContent.ts` |
| Setting the title, description, canonical link and structured data in the browser | `src/hooks/usePageMeta.ts` |
| Routing (by path, no router library) | `src/App.tsx` |
| Pages | `src/features/info/InfoPage.tsx`, `src/features/city/CityPage.tsx`, `src/features/compare/ComparePage.tsx`, `src/features/landing/LandingPage.tsx`, `src/features/notfound/NotFoundPage.tsx` |
| Sitemap, robots and the file for AI crawlers | `public/sitemap.xml`, `public/robots.txt`, `public/llms.txt` |
| Hosting rules (rewrites, security headers) | `vercel.json` |
| Shareable map links | `src/features/share/viewState.ts`, `src/hooks/useSharedLocationFromUrl.ts` |
| maNOWj Daily | `src/features/play/daily.tsx`, `src/features/play/games/daily/` (game, engine, store, places); not listed in `src/features/play/registry.tsx`, on purpose |
| Tests that guard all of this | `tests/unit/crawlableContent`, `prerender`, `infoPages`, `infoPageRender`, `landingSeo`, `cityPages`, `cityStaticLinks`, `socialMeta`, `canonicalHost`, `cspInline`, `viewState` |

## 2. What was found (step 2)

| # | Item | Before | Now |
|---|---|---|---|
| 1 | Homepage title and description | "Check Any Address: Free Area Report & AI Map \| maNOWj"; description did not mention GIS explorer, radius search or satellite history | "maNOWj GeoIntel: Free AI Map, Area Report & GIS Explorer"; 155-character description with all five phrases and the builder's name |
| 2 | "The map itself needs JavaScript, so please enable it to use the app." | A plain paragraph in the static text, so a search engine could quote it under the result | In `<noscript>` inside a `data-nosnippet` span: never shown when JavaScript runs, never quoted by Google. A span because Google honours `data-nosnippet` on span, div and section only, and the static block may not contain a div |
| 3 | Canonical links | Already correct: every page's canonical is its own address with no query string, in the raw HTML and after load; `/?lat=..&lon=..` keeps `https://www.manowj.com/` | No change needed. Checked in the built files and in a browser |
| 4 | Tool page titles, headings and descriptions | Not written around search terms; the satellite page described only NASA's 250 m imagery, written before the sharp past versions (Esri Wayback, since 2014) were added | Titles as asked (see 2.1), with matching h1s, h2s and descriptions; the satellite page describes both sources, quotes the app's own labels (a test checks them against the time travel panel) and says Wayback dates are publication dates, not capture dates |
| 5 | Questions and answers | None on tool pages; the AI map search page had six, but only after the app loaded | 4 or 5 real questions on each tool page and the area report, and the AI map search page's six, all in the static HTML too |
| 6 | Structured data on tool pages | WebPage only | One `@graph` per page: WebPage, HowTo built from the steps shown, FAQPage built from the questions shown |
| 7 | Homepage structured data | WebApplication, category BusinessApplication | SoftwareApplication, category UtilitiesApplication, operating system "Web", price 0 INR |
| 8 | City pages | Static HTML had no coordinates and no tools section; descriptions 244 to 263 characters (results show about 160); titles up to 67 characters | Static HTML has the centre's coordinates and a "Tools to use in <city>" list; the page also shows ground height, live with its source; descriptions are the city's own summary; titles end "\| maNOWj" so all twelve fit in 60 |
| 9 | Sitemap | Complete (tests fail if a city or tool page is missing) but some dates were months old | Dates updated for the 19 pages whose content changed. Still a written file, see section 4 |
| 10 | llms.txt | Listed 8 of 12 cities and no tool pages while saying it listed every page | Lists every page; a test keeps it that way |
| 11 | Shareable map links | The app reads `lat`, `lon`, `z`, `map` once on arrival and clears them; the Share button writes the full view. `?lat=&lng=` links were ignored | `lng` and `layer` are also read. Live updating of the address bar is not done, see section 4 |
| 12 | Social previews | Every page with its own address has its own title, description and address in the raw HTML; all use `og-image-v3.jpg`. A shared map link (`/?lat=..`) shows the homepage card | Unchanged, see section 4 |
| 13 | maNOWj Daily | Not reachable anywhere in the app (removed at the owner's request), but still advertised in three places: the homepage's static text, the "Inside" list on /ai-map-search and llms.txt | Needs the owner's decision, see section 4 |

### 2.1 Titles

The brief's titles were used word for word except where the site's rules or a result's length forced a change:

- Long dashes became colons. The site's copy uses none, and a test enforces it on these pages.
- A result shows about 60 characters of a title (a test enforces 60). Four of the five asked for were 63 to 67 characters, so "| maNOWj GeoIntel" became "| maNOWj". For the radius page even that did not fit, so it has no brand: "Free Map Radius Tool: Count Hospitals, Schools & Amenities" (58). Google prints the site's name above every title anyway.

### 2.2 What the new structured data will and will not do

- Google stopped showing HowTo rich results on 13 September 2023 and FAQ rich results on 7 May 2026, for every site. The HowTo and FAQPage markup is correct and built from the visible text, so other search engines and AI tools can read it, but it will not change how a Google result looks.
- Google shows its software-app rich result only when the markup has a rating or a review. The site has no real ones, and inventing them would break Google's rules and be untrue, so the homepage has neither.

## 3. Checks (step 3)

- TypeScript: `npm run typecheck` clean. The repository has no linter configured (no ESLint config and no lint script), so "zero lint errors" cannot be checked; the strict typecheck is the nearest thing.
- Unit tests: 164 files, 1726 passed (the 2 that need a build ran too).
- Build: passes, 155 pages and 404.html written.
- End-to-end tests (Playwright, phone and desktop, against the production build): 10 of 10 passed.
- Browser check of the built pages: each page's title, canonical link and structured data block are its own, and the app mounts with no page errors; a `?lat=&lng=&layer=satellite` link opens the place on satellite.

## 4. Not done, and why

- **maNOWj Daily (`/daily`, Share Score).** The map games, Daily included, were removed at the owner's request, and `registry.tsx` warns against restoring them. Bringing it back with its own page, social card and share button is a product decision. Its result card already has a "Share your score" button (share sheet on phones, copy on computers) whose text is the score, a grid of one coloured square per round (no place names, so nothing is spoiled), the streak and a link to the homepage; restoring it would need a `/daily` page with its own social card and that link pointed at it. Until it is decided, the three mentions in item 13 describe a game nobody can open.
- **Writing the view into the address bar as you pan.** The app deliberately reads a link once and then clears it: a refresh would otherwise re-run a shared question, and an address bar that follows the map would carry a visitor's own position (from "My Location") into anything they copy. The Share button already makes a full link. If it is wanted, the safe form is a camera-only parameter that never selects a place.
- **Per-place social cards for shared map links.** WhatsApp, X and LinkedIn do not run JavaScript, so a card naming the shared place needs the server to write it into the HTML for that request (a Vercel function or middleware for `/`), and ideally a generated image. That changes how every visit to `/` is served, so it needs its own branch and testing on a preview.
- **Generating the sitemap at build time.** Tests already fail the build if any city or tool page is missing from it, which is what generating it would guarantee. A generated file would stamp every page with the build date, and Google ignores dates that are always "today".
- **Comparison page titles** run to 66-80 characters. Not in the brief; worth the same "| maNOWj" trim.
- **Soft 404s** (unknown addresses answer 200): still waiting for approval of the `vercel.json` change described in SEO_AUDIT.md.

## Sources

- [Changes to HowTo and FAQ rich results (Google, August and September 2023)](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [FAQ (FAQPage) structured data: deprecation notes (Google, May and June 2026)](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Software app (SoftwareApplication) structured data (Google)](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Meta tags and attributes that Google supports, including data-nosnippet (Google)](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Open-Meteo forecast API: the elevation field](https://open-meteo.com/en/docs) and [Elevation API: Copernicus DEM GLO-90](https://open-meteo.com/en/docs/elevation-api)
