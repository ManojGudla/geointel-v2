# Performance Audit

## What was measured

- **Lighthouse 12, mobile preset** (simulated slow 4G, 4× CPU slowdown), run on 6 November 2026 against the production build (`vite build`) served by `vite preview`.
  - Map tiles and third-party APIs could not load in that environment. So these figures are **slightly optimistic for tile loading and accurate for JavaScript cost**.
  - The console-error findings came from those blocked requests, not from the app.
- **Bundle sizes** from the production build, and a source-map breakdown of the largest chunks.
- **Not measured:** real-user Core Web Vitals (CrUX / Search Console). The PageSpeed Insights API was unreachable. Check Search Console → Core Web Vitals for field data.

## Lab results (mobile)

| Metric | Result | Target | Status |
|---|---:|---:|---|
| Performance score | 57 | 90+ | Poor |
| First Contentful Paint | 2.3 s | ≤ 1.8 s | Needs work |
| **Largest Contentful Paint** | **4.4 s** | ≤ 2.5 s | Poor |
| **Total Blocking Time** (lab proxy for INP) | **1,490 ms** | ≤ 200 ms | Poor |
| Cumulative Layout Shift | 0 | ≤ 0.1 | Good |
| Time to Interactive | 5.0 s | n/a | Poor |
| Main-thread work | 5.3 s | n/a | Poor |
| Accessibility / Best practices / SEO | 96 / 96 / 100 | n/a | Good |

**The LCP element is the free-to-use pop-up text** (`.free-notice__welcome-text`). The largest thing on screen for a first-time visitor is the notice, not the product, and it can only paint after the main JavaScript has run.

## Where the time goes

| Chunk | Minified | Gzipped | Loaded |
|---|---:|---:|---|
| `maplibre-gl` | 802 KB | 218 KB | On every app visit (the map) |
| `index` (entry) | 557 KB | 178 KB | On every visit |
| Sentry (`@sentry/react` with Replay and Feedback) | 493 KB | 163 KB | After analytics consent, **even without a DSN** |
| `PlayHub` (games) | 149 KB | n/a | Lazy (only in Play) |
| CSS (`index`) | 132 KB | 19 KB | Every visit |

Entry-chunk composition, by source size from the source map: `framer-motion` 394 KB, `react-dom` 131 KB, TanStack Query 68 KB, then app features (AI 62 KB, routing 50 KB, analysis 39 KB, location 35 KB …).

Main-thread breakdown: script evaluation 1.6 s, "other" (largely MapLibre/WebGL setup) 3.2 s. The longest tasks: the entry chunk at 391 ms and 251 ms, and the MapLibre chunk at 181 ms.

## Recommendations, in order of expected impact

| # | Change | Files | Expected effect | Priority |
|---|---|---|---|---|
| 1 | Don't make the pop-up the first thing to paint. Show it once (first visit), or as a non-blocking bottom banner after the map is interactive. | `src/features/notice/FreeToUseNotice.tsx`, `freeNoticeStore.ts` | LCP becomes the search box or the map; removes a blocking dialog from every visit | P1 (you asked for every visit, so this is your call) |
| 2 | Sentry: check `VITE_SENTRY_DSN` before importing; use `@sentry/browser` without Replay/Feedback; remove `@sentry/tracing` | `src/features/analytics/consent.ts`, `package.json` | 163 KB gzipped less after consent; less main-thread work | P1 |
| 3 | Take `framer-motion` out of the entry chunk: lazy-load the animated panels, or use CSS transitions for simple fades | the 12 files that import it (`grep -rl framer-motion src`) | Up to roughly 100 KB less gzipped on first load (estimate) | P1 |
| 4 | Paint the search box before the map: render the shell first, then `import("maplibre-gl")` in an idle callback | `src/features/map/MapView.tsx`, `src/App.tsx` | Faster FCP and LCP on phones; the map arrives a beat later | P1 |
| 5 | Upgrade `maplibre-gl` 4.7 to 6.x (also fixes the security advisory) | `package.json`, map code | v5 and v6 include rendering and bundle improvements. Measure before and after; don't assume. | P1 |
| 6 | Preconnect only to hosts used on first paint (tile host, `/api` is same-origin) | `index.html` | Small | P2 |
| 7 | Purge unused CSS (Lighthouse: about 16 KB) | `src/styles/*` | Small | P2 |
| 8 | API latency: log p50/p95 per route (Vercel logs, or a `Server-Timing` header) before optimising; Overpass and free AI models are the slow parts | `api/_lib/http.ts` | Lets you see what to fix | P1 |

Already good: CLS is 0; hashed assets are cached immutably and the service worker never caches HTML first (`public/sw.js`); the API uses edge caching (`withEdgeCache`) on read routes; games are lazy-loaded.

## How to measure progress
1. Search Console → Core Web Vitals (field data, mobile) every week.
2. Run Lighthouse mobile on `/` and `/maps/hyderabad` after each performance change, three runs each, and record the median.
3. Budget: entry JS ≤ 120 KB gzipped, TBT ≤ 300 ms (lab), LCP ≤ 2.5 s (field, 75th percentile).
