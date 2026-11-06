# Technical Issues

Each item is labelled **Verified** (seen in code or measured), **Needs testing** or **Recommendation**, with exact files, priority and a fix.

## Architecture as it actually is

The brief mentions Leaflet / React Leaflet. **This project does not use Leaflet.** It uses MapLibre GL JS (`maplibre-gl` 4.7.1), which renders vector and raster maps with WebGL. Everything below is about MapLibre.

| Layer | What is there |
|---|---|
| Frontend | Vite 5, React 18, TypeScript (strict, 0 errors), 270 source files. State in 35 Zustand stores (25 in `src/stores/`, the rest inside features), server data via TanStack Query. |
| Routing | No router library. `src/App.tsx` reads `window.location.pathname` once and picks a page: `/`, `/ai-map-search`, `/maps/<city>` (12 cities), `/compare/<a>-vs-<b>`, `/status`, `/admin`, `/privacy`; anything else renders `NotFoundPage`. |
| Map | `src/features/map/MapView.tsx` (1,567 lines) owns the map, layers, the live-location dot and measuring. |
| API | One Vercel function, `api/[...path].ts`, dispatching to 22 handlers listed in `api/_routes/index.ts`. Four extra entry files in `api/admin/` and `api/ai/` exist because the catch-all only matches one path segment. |
| Data providers | Nominatim and Photon (geocoding), Overpass (map features), OSRM via routing.openstreetmap.de and router.project-osrm.org (routing), Open-Meteo (weather, air quality), Wikidata (population, officials), Esri and NASA GIBS (imagery), RainViewer, USGS, Google News RSS. |
| AI | OpenRouter free models (`api/_lib/ai.ts`), used by Ask maNOWj (`api/_routes/ai/copilot.ts`), the six agents (`api/_routes/ai/agent.ts`) and the command parser (`api/_routes/ai-intent.ts`). |
| Database | Supabase Postgres, reached only from the server with the service-role key (`api/_lib/supabase.ts`). Tables: `kb_documents`, `feedback`, `team_applications`, `app_settings`, `maintenance_audit_log`, `rate_limits`. |
| Tests | 133 Vitest files, 1,400 tests, all passing. No end-to-end tests and no CI. |

The main user journey traced end to end: typing in the search box (`SearchBar.tsx`) waits 600 ms, then calls `searchLocations()` (`src/services/geocode.ts`), which calls `GET /api/geocode`. That handler (`api/_routes/geocode.ts`) tries Plus Codes, then Nominatim, then Photon. Picking a result calls `/api/reverse-geocode`, then `useRunAnalysis` fetches `/api/nearby` (Overpass) for the radius. Ask maNOWj sends the on-screen results to `/api/ai/copilot`.

## Issues

### T-01 Every page served the homepage's HTML. Verified, P0, fixed on branch
- **Evidence:** a raw fetch of `/maps/hyderabad`, `/compare/bengaluru-vs-chennai`, `/ai-map-search`, `/status` and `/admin` returned identical HTML, with title "maNOWj GeoIntel" and canonical `https://www.manowj.com/`. `src/hooks/usePageMeta.ts` corrected these only after JavaScript ran.
- **Fix (commit `09e629a`):**
  - `src/seo/routeMeta.ts` and `plugins/vite-plugin-prerender.ts` write `dist/<path>/index.html` for 148 URLs.
  - The pages now read their metadata from the same module, so the two can't drift apart.
  - Tested by `tests/unit/prerender.test.ts`, plus a browser check that the app still mounts on each page.
- **Needs testing after deploy:** whether Vercel serves `maps/hyderabad/index.html` for `/maps/hyderabad`. Vercel serves static files before rewrites, so it should. If it doesn't, nothing breaks: the old `index.html` is served as before.

### T-02 No enforcement of Nominatim's rate limit. Verified, P0, fixed on branch
- **Evidence:** `api/_lib/nominatim.ts` sent every request immediately. Its User-Agent `"maNOWj-GeoIntel/2.0 (contact: geointel app)"` gave no way to contact you. The [policy](https://operations.osmfoundation.org/policies/nominatim/) caps an application at 1 request per second and blocks violators.
- **Fix (commit `5e1ff58`):**
  - Per-instance pacing: requests start at least 1.1 s apart. If the wait would exceed 2.5 s, the request is refused and the existing Photon fallback answers instead.
  - The User-Agent now carries `+https://www.manowj.com`.
- **Limit:** each warm Vercel instance has its own clock, so several instances can still add up to more than 1/s. T-03 is the real fix.

### T-03 Search-as-you-type uses Nominatim, which forbids autocomplete. Verified, P0, decision needed
- **Evidence:** `src/features/search/SearchBar.tsx` sends a debounced query (600 ms) to `/api/geocode`, which calls Nominatim. The policy says autocomplete is "strictly forbidden".
- **Fix options:**
  1. Serve typeahead from Photon and use Nominatim only on Enter. Photon is designed for typeahead, but its public instance is also best-effort.
  2. Move geocoding to a provider whose plan allows autocomplete and commercial use: a commercial geocoding API, or a self-hosted Nominatim/Photon.
- **Recommendation:** option 2 before any marketing push. Option 1 is a stopgap that needs testing against the Indian addresses that previously failed (see `tests/unit/addressFallback*`).

### T-04 AI depends on a free quota that a few dozen users can exhaust. Verified, P1
- **Evidence:** `api/_lib/ai.ts` uses only `:free` OpenRouter models. OpenRouter's free tier allows 50 requests per day without credits, or 1,000 per day with $10 or more of credits, and 20 per minute. Free models also return 429 when busy, which has been seen live on this site.
- **Impact:** once the daily quota is used, every Ask maNOWj question for every user fails until the next day. That's acceptable for a hobby site, not for a product.
- **Fix:** buy $10 of OpenRouter credit (raises the cap to 1,000 a day), and add a small paid model as the final fallback with a hard monthly spend cap. Log which model answered and how long it took.

### T-05 AI "evidence" is supplied by the browser. Verified, P1
- **Evidence:** `api/_routes/ai/agent.ts` `buildDataBlock()` and `api/_routes/ai/copilot.ts` build the model's data from `req.body.context`. That context is the counts, scores, weather and officials the browser already fetched. The server sanitises it (`api/_lib/untrusted.ts`), but never re-fetches or checks it.
- **Impact:** any caller can send made-up counts and receive a confident, well-written answer about a real place. For a free tool this is tolerable. For a paid "evidence" report it isn't, because the server can't prove where a number came from.
- **Fix (P2):** for paid reports, retrieve on the server: call the same Overpass, Open-Meteo and Wikidata helpers inside the AI route, cache by rounded coordinates, and attach each fact's source and retrieval timestamp.

### T-06 Answers don't follow Retrieve → Answer → Evidence → Reasoning → Confidence → Sources. Verified, P2
- **Evidence:** the prompt deliberately asks for 1 to 3 chatty sentences (you asked for ChatGPT-style answers). `dataSourcesFor()` in `api/_lib/aiGrounding.ts` lists source *types* ("OpenStreetMap via Overpass") rather than per-claim sources. There are no retrieval timestamps, and no answer-level confidence.
- **Good already:**
  - `GROUNDING_RULES` forbids claims about zoning, price, ownership and legal status, and keeps interpretation apart from fact.
  - Officials can only be named from verified Wikidata lines.
  - Questions about other places are refused rather than answered from memory.
- **Recommendation:** keep the short chat answer on top, and add a collapsed "How we know" section underneath: the facts used, the source and fetch time for each, and a confidence level derived from data coverage rather than the model's opinion. This serves both the chat style and auditability.

### T-07 Property "intelligence" is a heuristic over OpenStreetMap tags. Verified, P1 (positioning)
- **Evidence:** `src/features/property/propertyAnalyzer.ts` classifies a point from mapped features. `src/data/featureStatus.ts` lists zoning, parcel boundaries, ownership, market value, comparables, flood risk and crime as "planned".
- **Impact:** the things property buyers and investors care about most are not there. Selling "property intelligence" invites the question "where are the prices?". Position it as a **neighbourhood / location check**: what is nearby, how far, how current. That is true today.

### T-08 14 of 23 analytics events are never sent. Verified, P1
- **Evidence:** `AnalyticsEvent` in `src/services/analytics.ts` defines 23 events. A search of `src/` finds no call for: `search_completed`, `onboarding_dismissed`, `route_started`, `radius_created`, `area_measured`, `distance_measured`, `layer_opened`, `ai_question_asked`, `ai_question_failed`, `daily_game_started`, `daily_game_completed`, `game_started`, `feedback_submitted`, `data_issue_reported`.
- **Impact:** search success rate, AI usage and activation can't be measured.
- **Fix:** call `track()` at these points:
  - `search_completed`: when `suggestionsQuery` resolves with more than 0 results (`SearchBar.tsx`).
  - `ai_question_asked` / `ai_question_failed`: in `CopilotPanel.tsx`.
  - Measure and route events: in `measureStore` and the routing panel.
  - `feedback_submitted`: in `FeedbackForm.tsx`.
  - Add `report_printed` to `AreaReport.tsx`.

### T-09 Sentry downloads 493 KB even when no DSN is configured. Verified, P1
- **Evidence:** `enableSentry()` in `src/features/analytics/consent.ts` runs `await import("@sentry/react")` before checking `sentryDsn()`. The resulting chunk is 493 KB (163 KB gzipped), mostly Replay and Feedback code. `replaysSessionSampleRate` is set, but `replayIntegration()` is never added, so Replay never runs anyway.
- **Fix:**
  - Check the DSN first.
  - Import only `@sentry/browser` with the integrations actually used, and remove the replay rates.
  - Remove the unused `@sentry/tracing` dependency (no file imports it).

### T-10 `framer-motion` is in the entry bundle. Verified, P1
- **Evidence:** a source-map breakdown of the 557 KB entry chunk shows `framer-motion` at 394 KB of source, imported by 12 files (including `src/App.tsx` and `FreeToUseNotice.tsx`).
- **Fix:** lazy-load the panels that animate, or replace simple fades with CSS transitions. See PERFORMANCE_AUDIT.md.

### T-11 No CI, and the `e2e` script cannot run. Verified, P1
- **Evidence:** there is no `.github/workflows/` and no `playwright.config.*`. `npm run e2e` has no tests to find. Vercel's build runs `tsc -b && vite build` and never runs the 1,400 unit tests.
- **Fix:** add a GitHub Actions workflow on pull requests: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Then add three Playwright journeys: search → select → nearby; ask maNOWj; open a city page.

### T-12 About 6,000 lines of unreferenced game and onboarding code. Verified by tool, confirm before deleting, P2
- **Evidence:** `knip` reports these as unused files:
  - `src/features/games/tictactoe/TicTacToe.tsx` and `src/features/onboarding/MapOnboarding.tsx`
  - `src/features/play/components/GameMap.tsx` and `src/features/play/daily.tsx`
  - the games under `play/games/{change,country,daily,mapRace,pin,whereAmI}`
- **Note:** `index.html`'s fallback text still advertises "maNOWj Daily", whose entry file `daily.tsx` is not imported. **Needs testing:** check whether the daily game is still reachable.
- **Fix:** confirm in the Play hub, then delete the unused files, or re-register them in `src/features/play/registry.tsx`.

### T-13 `MapView.tsx` is 1,567 lines. Verified, P2
It mixes the map lifecycle, layers, the live-location dot, measuring and analysis rings. Split it into hooks (`useLiveDot`, `useMeasureLayer`, `useAnalysisLayer`) the next time any of them changes, not as a standalone rewrite.

### T-14 The `v3.2` tag is on the wrong commit. Verified, P0 (housekeeping)
- **Evidence:** `git ls-remote --tags origin` shows `v3.2^{}` at `99376a6`, the admin-dashboard merge. The release commit is `cb857ba`, merged as `3952852`. The tagged tree still has version 0.1.0 and no CHANGELOG.md.
- **Fix:** run these on your computer:
  ```
  git fetch origin
  git tag -f -a v3.2 3952852 -m "maNOWj GeoIntel v3.2"
  git push -f origin v3.2
  ```

### T-15 Dependencies. Verified
| Package | Status | Priority |
|---|---|---|
| `maplibre-gl` 4.7.1 | Critical advisory GHSA-jrc7-96c5-q579 (XSS sanitizer bypass, fixed after 6.4.0). The app never passes untrusted HTML to MapLibre popups; attribution strings are our own. Not reachable today, but upgrade. | P1 |
| `vite` 5.4, `vitest` 2.1, `esbuild` | High/critical advisories, dev-only. Matters because `vite.config.ts` sets `server.host: true` (the dev server listens on your whole Wi-Fi). | P1 |
| `@sentry/tracing` | Unused | P1 (remove) |
| `@testing-library/jest-dom` | Unused | P2 (remove) |
| React 18, Zustand 4, TypeScript 5.9 | Behind, but supported | P2 |

### T-16 Unknown URLs return HTTP 200. Verified, P1
- **Evidence:** `/this-page-does-not-exist` returns 200 with the app's HTML; the app then shows `NotFoundPage`.
- **Fix:** see SEO_AUDIT.md. It needs a `vercel.json` change, which needs your approval. The build now also writes `dist/404.html`, ready for that change.

## What is in good shape (keep it)
- Uniform API envelope and error handling (`api/_lib/http.ts`), with a last-resort catch in `api/[...path].ts`, and no prototype-key route lookups.
- Overpass mirror hedging with health ordering and a stale-data fallback (`api/_lib/overpass.ts`, `api/_routes/nearby.ts`).
- Durable, database-backed rate limits on everything that writes or costs money (`api/_lib/rateLimit.ts`).
- Prompt-injection fencing for every user-controlled string that reaches a model (`api/_lib/untrusted.ts`).
- Error boundaries (`src/components/ErrorBoundary.tsx`), lazy panels, and loading and empty states across panels.
