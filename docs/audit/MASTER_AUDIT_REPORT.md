# Master audit: progress report

Last updated 25 November 2026. Code: `main` at `9ae25db` plus the v3.4 commits
listed at the end. This file is the running record across sessions: the audit
brief is too large for one sitting, so it runs in phases.

Every issue carries one or more of these statuses:

| Status | Meaning |
|---|---|
| VERIFIED | Reproduced, or confirmed by reading the current code |
| FIXED | Code changed in the v3.4 commits |
| TESTED | A test fails without the fix and passes with it |
| NEEDS EXTERNAL ACCESS | Needs a live service this sandbox cannot reach (Wikidata, Vercel, Supabase) |
| NEEDS MANUAL VALIDATION | Needs a person, a real phone or production data |
| NOT FIXED | Found but not changed yet; the reason is given |

## Phases

| # | Phase | Where it stands |
|---|---|---|
| 1 | Inspect the repository | Done. Stack, all API routes, providers, Supabase migrations and the earlier reports in this folder were read. |
| 2 | Map the system | Done (next section). |
| 3 | Reproduce failures | Done for every item in the issue table. |
| 4 | Security and data accuracy | Done for what can be checked from here: SECURITY_REPORT.md, GIS_DATA_ACCURACY_REPORT.md. |
| 5 | Backend and AI reliability | Input validation done. AI grounding built on `agents-v2` (plan approved 25 Nov): server-fetched evidence, number check, citations, confidence. Live acceptance not run here. |
| 6 | Frontend and mobile | Done in v3.4 (CHANGELOG). A check on a real phone is still needed. |
| 7 | Performance | Bundle sizes measured. Web Vitals not measured yet: PERFORMANCE_REPORT.md. |
| 8 | Tests | 1,618 unit and integration tests and 8 end-to-end journeys (phone and desktop, API stubbed) pass; both run in CI. |
| 9 | Re-run all checks | Type check, all tests, production build and contrast check pass on the last commit. |
| 10 | Reports | This file and the five reports beside it. |

## How the system fits together

```
Browser: React 18 + MapLibre GL 4.7.1, 155 prerendered pages (Vite 5 build)
  |  same-origin requests only (no CORS headers anywhere)
  v
Vercel: one function, api/[...path].ts -> api/_routes/*
  |  edge cache (s-maxage + stale-while-revalidate) and a per-instance TtlCache
  |- OpenStreetMap: Overpass (mirrors raced), Nominatim (1 request/s) + Photon fallback
  |- Routing: OSRM demo server, routing.openstreetmap.de
  |- Open-Meteo: weather, air quality
  |- USGS earthquakes, RainViewer radar
  |- Wikidata SPARQL: population, officials
  |- Esri: World Imagery metadata, Wayback
  |- OpenRouter: AI (free models)
  '- Supabase Postgres: durable rate limits, maintenance mode, submissions, help articles
Browser direct: map tiles (OSM, Esri, OpenTopoMap, NASA GIBS, Wayback),
Google Tag Manager (after consent only), Sentry
```

Server-only secrets: `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEOINTEL_ADMIN_KEY`. None of them, nor their names, is in the browser bundle
(checked on the built `dist/`).

## Issues

| ID | Area | Issue | Status | Details |
|---|---|---|---|---|
| BR-C1 to BR-L3 | Imagery, measuring, weather, Overpass, phone layout | 15 issues from the bug hunt | FIXED, TESTED. M4 NOT FIXED: a scoring choice for the owner | BUG_REPORT_2026-11-25.md |
| A-01 | Population | Density divided by an area whose unit was ignored (m² or mi² read as km²); a Wikidata outage looked like "no data" | FIXED, TESTED with mocked Wikidata. Real figures: NEEDS EXTERNAL ACCESS | GIS_DATA_ACCURACY_REPORT.md |
| A-02 | API | Five routes sent coordinates off the globe on to providers; every route read a blank value as 0 | FIXED, TESTED (19 cases failed before the fix) | GIS_DATA_ACCURACY_REPORT.md |
| A-03 | Map | A click on a repeated copy of the world sent longitudes such as 286 | FIXED, TESTED (unit). NEEDS MANUAL VALIDATION near 180° | GIS_DATA_ACCURACY_REPORT.md |
| D-01 | Dependencies | 8 npm advisories (3 critical, 2 high, 3 moderate) | 1 FIXED; maplibre-gl VERIFIED not reachable; dev tooling mitigated, upgrades NOT FIXED | SECURITY_REPORT.md |
| S-06 | Dev server | Listened on the whole Wi-Fi | FIXED | SECURITY_REPORT.md |
| S-04 | Privacy | Client IPs kept with submissions with no retention limit | NOT FIXED: deleting data needs the owner's approval | SECURITY_REPORT.md |
| AI-01 | AI | Agents state browser-sent data as facts, including officials marked "verified" by the browser | FIXED, TESTED (mock) on `agents-v2`. Live: NEEDS EXTERNAL ACCESS | AI_RELIABILITY_REPORT.md |
| AI-02 | AI | One free OpenRouter key: 50 model requests a day for all visitors together | VERIFIED from OpenRouter's documentation. The account's tier: NEEDS MANUAL VALIDATION | AI_RELIABILITY_REPORT.md |
| AI-03 | AI | Nothing checks that numbers in an AI answer exist in the data | FIXED, TESTED on `agents-v2` | AI_RELIABILITY_REPORT.md |
| G-01 | Game | Angry face on crash and game over, whole head visible | FIXED, TESTED (3 tests, screenshots at 390×844) | CHANGELOG.md |

## Not started yet

- Map stability under stress: style switching while layers load, layer and
  listener cleanup, many markers, drawing with touch on real devices.
- Web Vitals (LCP, INP, CLS) on a real phone, and Lighthouse.
- SEO review beyond the canonical-host checks.
- Major-version dependency upgrades (vite, vitest, maplibre-gl), each on its
  own branch.
- Re-checking provider terms for commercial use (S-01).
- The six agents' live acceptance tests: `scripts/agent-acceptance.mjs` is
  ready; it needs a deployment that can reach the providers
  (docs/agents/TEST_RESULTS.md).

## Commits in the v3.4 patch

| Commit | What it does |
|---|---|
| c61833c | Counts a picked search result as an opened place, with the country only |
| bc75009 | AI agents and every tool easier to find; international first-visit defaults; more map on phones |
| 4149e5e | Fixes the bug hunt's Critical, High and Medium issues |
| 43bdae6 | Angry face in Fly maNOWj on crash and game over |
| e35947c | Population: areas read with their units; outages reported as outages (A-01) |
| 8f83b7e | source-map-js patched; dev server on this computer only (D-01, S-06) |
| cc5693d | Coordinates off the globe refused before any provider call (A-02, A-03) |
| 137d981 | Angry face: whole head with room above the hair (G-01) |
| 56832d5 | These reports, the agent plan and the changelog |

## Commits on `agents-v2` (on top of v3.4)

| Commit | What it does |
|---|---|
| 536aafb | Agents: the server fetches every fact; every number is checked |
| 59ff517 | Copilot: fetches its own facts, looks up office holders itself |
| 0c7e9e3 | Agents work together on one request, with a real timeline |
| f70a6e5 | Make My Trip plan builder; route alternatives and turns |
| f757ce4 | Agent docs, acceptance script, reports updated |
| (this branch's last commit) | End-to-end journeys with Playwright, run in CI |

## Environment variables

No new variables. Server: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
(optional), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEOINTEL_ADMIN_KEY`,
`PUBLIC_APP_URL`. Browser (public by design): `VITE_GTM_ID`,
`VITE_SENTRY_DSN`, `VITE_FOUNDER_SITE_URL`.

`.env.example` was out of date: it listed `AI_MODEL_REASONING`,
`AI_MODEL_FAST` and `AI_MODEL_CHEAP`, which nothing reads, and missed the two
Sentry and founder-site variables. Both are corrected (FIXED).

## Deploying v3.4

1. `git checkout -b v3.4` and apply the patch with `git am`.
2. `npm ci && npm run typecheck && npm test && npm run build`.
3. Push the branch. Check the Vercel preview on a phone: search, a map tap,
   the AI tab, measuring, Fly maNOWj.
4. Merge to `main` only after that check. Nothing here changes secrets or the
   database.
