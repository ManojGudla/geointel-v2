# maNOWj GeoIntel v3.2: Audit Report

Audit date: 6 November 2026. Code audited: `main` at `3952852` (the merged v3.2 release). Live site: https://www.manowj.com/.

This is the summary. The detail and evidence are in the seven companion reports in this folder:

| Report | Covers |
|---|---|
| [TECHNICAL_ISSUES.md](TECHNICAL_ISSUES.md) | Frontend, backend, AI agents, maps, tests, dependencies |
| [SEO_AUDIT.md](SEO_AUDIT.md) | Technical SEO, keyword strategy, landing-page plan |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | Security, privacy, data-provider terms |
| [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) | Lighthouse, bundle sizes, Core Web Vitals plan |
| [UI_UX_RECOMMENDATIONS.md](UI_UX_RECOMMENDATIONS.md) | Homepage, conversion, mobile, accessibility |
| [BUSINESS_GROWTH_STRATEGY.md](BUSINESS_GROWTH_STRATEGY.md) | Customers, monetisation, first 1,000 users, analytics |
| [30_DAY_ROADMAP.md](30_DAY_ROADMAP.md) | Day-by-day plan with owners and success measures |

## 1. How this audit was done (and what it did not cover)

**Measured or verified directly:**
- Read the code paths end to end: `src/App.tsx` (routing), `api/[...path].ts` and `api/_routes/index.ts` (the API), every handler in `api/_routes/`, `api/_lib/`, the Supabase migrations, `vercel.json`, `index.html`, `public/`.
- Ran `tsc -b` (0 errors), the unit suite (133 files, 1,400 tests, all passing), a production build (bundle sizes below), `npm audit`, and `npm outdated`.
- Ran Lighthouse 12 (mobile, simulated throttling) against the production build served locally.
- Fetched the live site's raw HTML for 7 URLs to see what a crawler receives before JavaScript runs.
- Read the published usage policies of Nominatim, the OSM tile servers, the OSRM demo server and Open-Meteo.

**Not verified (needs access I do not have):**
- Google Search Console: which pages are indexed, impressions, queries. No search-volume data source was available, so **no search volumes or rankings appear in these reports**; every keyword is a hypothesis to validate.
- Real-user Core Web Vitals (CrUX). The PageSpeed Insights API could not be reached from the audit environment, so all performance numbers are lab numbers.
- The live Supabase project's actual RLS state (only the migrations in the repo were read), Vercel environment variables, and the GTM container's configuration.
- Live AI answer quality across many questions. The AI routes were audited by reading the code and prompts, plus earlier live checks in this project's history.

Findings are labelled **Verified** (seen in code or measured), **Needs testing** (plausible, not confirmed) or **Recommendation**.

## 2. The honest summary

maNOWj GeoIntel is a well-engineered free map tool. The code quality is well above a typical personal project: strict TypeScript, 1,400 unit tests, defensive API handling, a strict Content-Security-Policy, prompt-injection fencing on the AI, and database tables locked down with row-level security.

It is **not yet a product that can acquire users at scale or take money**, for four reasons:

1. **Search engines were being told to ignore every page except the homepage.** Every URL served the same HTML with the homepage's title and canonical tag (Verified; fixed on branch `audit/v3.2`, not yet deployed).
2. **It runs on free public services whose terms forbid what a growing commercial product would do.** Nominatim forbids search-as-you-type and allows 1 request per second; the OSRM demo server and Open-Meteo's free API are for non-commercial use only. Charging money on this stack would breach those terms, and growth alone risks being blocked (Verified).
3. **There is nothing to buy and no way to become a lead.** No pricing, no business enquiry or demo form, no accounts, no saved work (Verified).
4. **You cannot see what users do.** 14 of the 23 analytics events defined in `src/services/analytics.ts` are never sent, including `search_completed` and `ai_question_asked` (Verified).

Strategically, the general "ask a map a question" use case is now built into Google Maps (Gemini in Maps, reported March 2026). Competing there is not realistic. The defensible position is narrower: **an evidence-backed neighbourhood report for a specific address** (what is within walking distance, with sources and dates) for home buyers, renters and the agents who serve them in India. See BUSINESS_GROWTH_STRATEGY.md.

## 3. Scorecard

| Category | Weight | Score | Main evidence |
|---|---:|---:|---|
| Technical architecture | 15 | **10** | Strong typing and tests; but no CI, no end-to-end tests, a client-trusted AI context and a 1,567-line `MapView.tsx` |
| SEO | 15 | **6** | Good sitemap, robots and structured data; but wrong canonical on every non-home URL (live), soft-404s, homepage title has no keyword |
| UI/UX | 10 | **6** | Polished, mobile-ready, contrast-tested; but a pop-up on every visit is the LCP element, and the homepage doesn't explain the value in 5 seconds |
| Product functionality | 15 | **9** | 67 features marked live; "property intelligence" lacks what buyers need most (price, legal status, flood risk); no accounts |
| AI reliability | 10 | **5** | Good grounding rules and injection fencing; but evidence is supplied by the browser, no per-claim citations or timestamps, free models rate-limit |
| Security | 10 | **7** | CSP, HSTS, RLS deny-all, server-only service key, timing-safe admin check, durable rate limits; one critical CVE in `maplibre-gl` (not reachable as used), shared admin key |
| Performance | 10 | **4** | Lab mobile: Performance 57, LCP 4.4 s, TBT 1.49 s |
| User acquisition | 5 | **1** | No measured channel, no referral loop, no indexed landing pages beyond 23 URLs |
| Business conversion | 5 | **1** | No pricing, lead form or accounts |
| Analytics | 5 | **2** | Consent-gated GTM in place; core funnel events missing; no dashboard |
| **Total** | **100** | **51** | |

Per-category detail (problems, evidence, fixes, impact, priority) is in the companion reports.

## 4. Priority lists

### P0: critical bugs and security (fix before promoting the site)

| # | Issue | Status |
|---|---|---|
| P0-1 | Ask maNOWj's system prompt told any visitor personal statements about the founder (`api/_routes/ai/copilot.ts`) | **Fixed** on `audit/v3.2` (commit `b7d95bd`) |
| P0-2 | Every URL's raw HTML declared the homepage as canonical, with the homepage title/description (`index.html` served for all paths) | **Fixed** on `audit/v3.2` (commit `09e629a`): build-time per-page HTML |
| P0-3 | No enforcement of Nominatim's 1 request/second limit; non-identifying User-Agent (`api/_lib/nominatim.ts`) | **Fixed** on `audit/v3.2` (commit `5e1ff58`): pacing plus contact User-Agent |
| P0-4 | Search-as-you-type calls Nominatim, which its policy forbids (`src/features/search/SearchBar.tsx` → `/api/geocode`) | **Decision needed**: move typeahead to a geocoder whose terms allow autocomplete (see TECHNICAL_ISSUES.md T-03) |
| P0-5 | Free tiers in use are non-commercial (OSRM demo, Open-Meteo, Esri imagery terms) | **Decision needed before charging money** (SECURITY_AUDIT.md S-01) |
| P0-6 | The `v3.2` git tag points at `99376a6`, the commit before the release commit, so the tagged code says version 0.1.0 | **Your action**: re-tag (command in TECHNICAL_ISSUES.md T-14) |

P0-4 and P0-5 are not code bugs I can safely fix alone: each needs a provider choice, and possibly an account and a cost, from you.

### P1: SEO, performance and conversion (next 30 days)

1. Send the missing analytics events (`search_completed`, `ai_question_asked`, `area_measured`, `route_started`, `feedback_submitted` and more). See TECHNICAL_ISSUES.md T-08.
2. Return a real 404 status for unknown URLs (needs a `vercel.json` change; your approval required). See SEO_AUDIT.md.
3. Rewrite the homepage title and first screen around one job ("Check any address before you rent or buy"). See UI_UX_RECOMMENDATIONS.md.
4. Show the free-to-use notice on the first visit only, or as a non-blocking banner. It is currently the LCP element on mobile.
5. Add a "Business enquiry / request a report" form (lead capture) stored in Supabase like `team_applications`.
6. Load Sentry only when a DSN exists, and drop the unused `@sentry/tracing` dependency. Today 493 KB is downloaded after consent even if no DSN is set.
7. Defer `framer-motion` out of the entry chunk (394 KB of source in the first bundle).
8. Upgrade `maplibre-gl` 4.7 to 6.x (critical advisory GHSA-jrc7-96c5-q579).
9. Add CI (GitHub Actions: typecheck, tests, build) so a broken change cannot reach `main`.
10. Fix the `target-size` accessibility failure on the basemap "more" button.

### P2: long-term

Accounts and saved places, paid report tier, server-side evidence retrieval for AI answers with per-claim citations, a self-hosted or commercial geocoder and router, a public API, team workspaces, and splitting `MapView.tsx`.

## 5. What I changed on branch `audit/v3.2`

Nothing is deployed. Three commits, each with its own tests, all 1,400+ tests passing:

1. `b7d95bd` **Copilot founder answers.** `api/_routes/ai/copilot.ts`: replaced the birthday, "no best friends, feeling alone" and "marry a financially successful woman" instructions with "founder and developer of maNOWj GeoIntel; reach him through feedback or Join My Team". Everything else personal is now declined as private. *Revert this commit if you want those answers back.*
2. `09e629a` **Per-page HTML.**
   - New `src/seo/routeMeta.ts` (one source of page titles, descriptions and canonicals) and `plugins/vite-plugin-prerender.ts`. The build now writes 148 pages plus `404.html`, e.g. `dist/maps/hyderabad/index.html`, each with its own title, canonical, social tags and readable text with internal links. `/admin` gets `noindex`.
   - `CityPage.tsx`, `ComparePage.tsx` and `LandingPage.tsx` read from the same module.
   - Tests: `tests/unit/prerender.test.ts`.
   - **Verify after deploy:** run `curl -s https://www.manowj.com/maps/hyderabad | grep canonical`. It should print `/maps/hyderabad`, not `/`.
3. `5e1ff58` **Nominatim pacing.**
   - `api/_lib/nominatim.ts`: requests start at least 1.1 s apart per instance, and are refused (falling back to Photon) if the wait would exceed 2.5 s.
   - The User-Agent now carries the site URL. The Wikidata User-Agent is fixed too.
   - Tests: `tests/unit/nominatimPacing.test.ts`.

## 6. Progress log

**Week 1 (branch `feat/week1-tracking-ci-404`)**
- **P1-1 done:** the funnel events now fire. They cover:
  - `search_started` / `search_completed` / `search_failed` (typeahead, with result count and time);
  - `ai_question_asked` / `ai_question_failed` (chat and all six agents, with model and time);
  - `analysis_completed` / `analysis_failed`, `distance_measured`, `area_measured`, `route_started`, `layer_opened`, `game_started`, `report_printed`, `feedback_submitted`.
  - No query text, question text, message or coordinate is ever sent. Tested by `tests/unit/funnelEvents.test.ts`.
- **P1-2 done:** removed the catch-all rewrite from `vercel.json`. Every app URL is a real prerendered file, so an unknown URL now gets `404.html` with HTTP 404. Guarded by `tests/unit/spaRewrite.test.ts`. Verify on the Vercel preview before merging.
- **P1-9 done:** `.github/workflows/ci.yml` runs typecheck, unit tests, the contrast check and the build on every pull request and every push to `main`. To make it block merges, turn on branch protection (see the comment in the workflow file).
- **Search success rate** = `search_completed` ÷ `search_started` where `kind = typeahead`.
