# Security Audit

No secret values appear in this report. Environment variables are referred to by name only.

## Summary

The security baseline is good, and better than most production sites of this size. There is **no verified exploitable vulnerability** in the deployed code. The real risks are commercial/legal (data-provider terms), privacy (a personal-information prompt, now fixed on the branch) and operational (one shared admin key).

## What is in place (verified in code)

| Control | Where |
|---|---|
| Strict CSP: `script-src 'self'` plus GTM only, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` | `vercel.json` |
| HSTS (2 years, preload), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocation self only) | `vercel.json` |
| A test fails the build if an inline script returns to `index.html` | `tests/unit/cspInline.test.ts` |
| Database: RLS enabled on all six tables, with **no** policies, so anon and authenticated roles can't read or write anything | `supabase/migrations/0001`–`0005` |
| Only the server talks to Supabase, with `SUPABASE_SERVICE_ROLE_KEY`; there is no Supabase client in the browser bundle | `api/_lib/supabase.ts` (`src/` has none) |
| Rate-limit SQL functions are `security definer` with execute revoked from `public`, `anon`, `authenticated` | `0006_lock_rate_limit_functions.sql` |
| Admin key compared with `timingSafeEqual`; admin responses `no-store` with `Vary`; fails closed if `GEOINTEL_ADMIN_KEY` is unset | `api/_lib/adminAuth.ts`, `api/_lib/http.ts` |
| Durable (Postgres-backed) rate limits on feedback, team applications, AI routes and admin routes; in-memory limits elsewhere | `api/_lib/rateLimit.ts` |
| Client IP taken from Vercel's own header (rightmost), not from spoofable `X-Forwarded-For` | `getClientIp` in `api/_lib/http.ts` |
| Prompt-injection fencing: every user-controlled string that reaches a model is sanitised and fenced | `api/_lib/untrusted.ts` |
| No `dangerouslySetInnerHTML` and no `eval`; the one `innerHTML` writes a constant string | `src/features/map/MapView.tsx:1438` |
| No SQL built from strings: all database access goes through the Supabase client and RPC with parameters | `api/_lib/*` |
| Production source maps disabled | `vite.config.ts` |
| Analytics and Sentry load only after consent | `src/features/analytics/consent.ts` |

## Findings

### S-01 Data-provider terms block commercial use. Verified, P0 before charging money

| Provider | Used for | Term | Source |
|---|---|---|---|
| Nominatim (public) | Search, reverse geocoding | Max 1 request/s; **autocomplete forbidden**; access can be withdrawn | [OSMF policy](https://operations.osmfoundation.org/policies/nominatim/) |
| OSRM demo server | Car routing fallback (`api/_routes/route.ts`) | 1 request/s; "reasonable, **non-commercial** use" | [OSRM wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) |
| Open-Meteo free API | Weather, air quality | "only for **non-commercial** purposes"; under 10,000 calls a day | [Open-Meteo terms](https://open-meteo.com/en/terms) |
| tile.openstreetmap.org | Standard map tiles | No SLA, can block heavy users; attribution required; no offline or prefetch | [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) |
| routing.openstreetmap.de (FOSSGIS) | Car, walk and bike routing | Donation-run; terms not re-checked in this audit | Needs checking |
| Esri World Imagery (`server.arcgisonline.com`) | Satellite and dark basemaps | Esri's basemap terms generally require an ArcGIS account for production apps; not re-checked in this audit | Needs checking |

**Impact:** the moment the site charges money (or runs ads), it breaks at least the OSRM demo and Open-Meteo terms. Traffic growth alone risks Nominatim and OSM-tile blocks, which would take search and the map down for every user at once.

**Fix:**
1. Before monetising, buy commercial plans (Open-Meteo has paid API plans) or self-host the services.
2. Remove `router.project-osrm.org` from `api/_routes/route.ts`.
3. Move geocoding to a provider with an autocomplete-friendly commercial plan.
4. Check the Esri and FOSSGIS terms.

The interim pacing fix for Nominatim is on branch `audit/v3.2` (commit `5e1ff58`).

### S-02 Personal information in the AI system prompt. Verified, P0, fixed on branch
`api/_routes/ai/copilot.ts` instructed the assistant to tell any visitor the founder's birthday, that he "does not have any best friends and is feeling alone", and that a goal is "to marry a financially successful woman". Any business evaluating the product could see this, and so could your employer.

Fixed in commit `b7d95bd`: the assistant now says he is the founder and developer, explains how to reach him, and declines everything else as private.

### S-03 One shared admin key, no second factor. Verified, P1
- **What exists:**
  - `/admin` is protected by one passphrase (`GEOINTEL_ADMIN_KEY`), kept in `sessionStorage`, compared in constant time and rate-limited durably.
  - The hidden gate behind the header logo is an alternative entrance to the same key check.
- **What's missing:** there's no per-person identity, no 2FA and no way to revoke one person's access.
- **Risk:** the passphrase is shared by WhatsApp, or typed on a shared phone. The audit log records a free-text "admin label", not a verified identity.
- **Fix:**
  - **P1:** a long random key (32+ characters), rotated now and after any sharing.
  - **P2:** Supabase Auth with your email plus TOTP for `/admin`.

### S-04 IP addresses and user agents kept forever. Verified, P1 (privacy)
- **Evidence:**
  - `feedback` and `team_applications` store `ip_address` and `user_agent` (migration `0003_submission_metadata.sql`).
  - No retention or deletion job exists.
  - The new admin console masks IPs on screen, but the database keeps them in full.
- **Fix:**
  - A scheduled SQL job (Supabase cron) that nulls `ip_address` after 30 days.
  - One line in the Privacy panel stating it.
  - India's DPDP Act 2023 expects purpose limitation and retention limits for personal data. That's not legal advice: confirm the specifics before taking business customers.

### S-05 `maplibre-gl` critical advisory. Verified, not reachable today, P1
GHSA-jrc7-96c5-q579 (XSS through MapLibre's HTML sanitizer, versions up to 6.4.0). The app never passes untrusted HTML to MapLibre: there are no `Popup.setHTML` calls, and attribution strings come from `src/features/map/basemaps.ts`. Upgrade to 6.x anyway, because one future popup with an OSM name would make it reachable.

### S-06 Dev-server exposure. Verified, P1 (your laptop, not production)
`vite.config.ts` sets `server.host: true`, so the dev server listens on your whole network. `vite` 5.4 and `esbuild` have path-traversal and cross-origin read advisories against the dev server. On café or office Wi-Fi, someone on the same network could read files from the project folder, including `.env.local`.

Fix: default to `host: false`, run `npm run dev -- --host` only when testing on a phone, and upgrade Vite.

### S-07 AI route abuse and cost. Verified, P1
The AI routes are durably rate-limited per IP, but evidence is client-supplied (TECHNICAL_ISSUES.md T-05). The only cost guard is that the models are free, and that also makes them unreliable. When you move to paid models, set a hard monthly spend limit in OpenRouter, keep `max_tokens` caps (currently 900 to 1,600), and log tokens per request.

### S-08 CORS. Verified, OK
No `Access-Control-Allow-Origin` is set by `api/_lib/http.ts`, so browsers block cross-origin reads of the API. Server-to-server callers can still use it, within the rate limits. Nothing to change unless you launch a public API, which would need keys anyway.

## Needs testing (could not verify)
- The **live** Supabase project matches the migrations: RLS on, no policies added in the dashboard. Check in Supabase → Authentication → Policies.
- Vercel environment variables are set only for Production and Preview as intended. A Preview deployment with the production admin key is a common leak.
- `http://manowj.com` redirects to `https://www.manowj.com` with HSTS.
