# maNOWj GeoIntel v2

Location intelligence for better decisions. A ground-up rebuild of the GeoIntel platform.

## What's in this pass

This delivery covers **Phase 1–5** (foundation, map/search/location identity, GIS evidence & property intelligence, weather/news/nearby, routing), **Pass 2** (AI Copilot, six AI agents, click-to-inspect evidence, command palette, feedback with star ratings, PWA installability), and **Pass 3**: real 3D building extrusions, distance/area measurement & drawing tools, a Travel Planner (flights/trains/buses/movies/hotels as honest provider handoffs), a visual/motion design pass, a mobile bottom-sheet layout, a Settings panel, an in-app Feature Status page, and basic security headers. It does **not** yet include Saved Locations/Recent History persistence, PDF reports, real accounts, or native app-store packaging. Those are real follow-up builds, not stubs left lying around. See "What's next" below, or open the in-app Feature Status page (header → "📋 Features") for the full, current, item-by-item breakdown.

Every feature that *is* here is real: live Nominatim/Overpass/OSRM/Open-Meteo/Google-News calls, no mock data, and every panel has loading/success/empty/error/unavailable states so one provider outage never blanks the app. The AI layer follows the same rule, the Copilot and every agent only reason over data that's already real and already on screen (plus a real product knowledge base), and say plainly when they don't have enough information rather than inventing an answer.

### Pass 2 setup (new, optional but needed for AI/feedback)

Phase 1–5 needs no API keys. Pass 2's AI Copilot/agents and Feedback feature need a couple of free things set up in `.env.local` (copy from `.env.example`):

1. **Supabase** (free tier): create a project at supabase.com, then run `supabase/migrations/0001_init.sql` against it (SQL Editor, paste and run). Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API, the service-role key, never the anon key) in `.env.local`.
2. **Seed the knowledge base**: `npm run seed:kb`, inserts the product-documentation articles the Copilot/agents cite from (`supabase/seed/kb-documents.json`). Safe to re-run; it skips documents already present.
3. **OpenRouter** (free tier): create a free API key at openrouter.ai, set `OPENROUTER_API_KEY` in `.env.local`. `OPENROUTER_MODEL` defaults to `openrouter/free`.

Without these set, the Copilot/agents show a clear "AI features aren't configured yet" message and Feedback shows "storage isn't configured yet". Both graceful, never a crash, so the rest of the app (map, search, GIS, weather, routing, click-to-inspect) works today with zero setup.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. That's it. One command starts both the frontend and the API (see "Local API" below for why that matters).

## Architecture at a glance

- **Frontend:** React 19 + TypeScript (strict) + Vite, styled with CSS custom-property design tokens (light/dark, no invert-filter dark mode).
- **State:** Zustand, split into focused stores (`mapStore`, `locationStore`, `searchStore`, `gisUiStore`, `routeStore`, `uiStore`, `intelTabStore`). No single giant component holding everything.
- **Data fetching:** TanStack Query for every network call, built-in request cancellation, caching, and consistent loading/error states.
- **Map:** MapLibre GL JS. Raster basemaps (OSM standard, Esri World Imagery satellite, Esri Dark Gray Canvas dark, OpenTopoMap terrain). No paid API key required. Swapping to a licensed vector provider later is a one-file change (`src/features/map/basemaps.ts`). 3D building extrusions (`api/buildings.ts`, `src/features/map/useBuildings3D.ts`) render real OSM footprint geometry once you're zoomed in with 3D on. Heights come from OSM tags where present, a labeled estimate otherwise.
- **Backend:** `api/*.ts` handlers, shaped like Vercel serverless functions. Deploy unchanged.
- **Local dev:** `plugins/vite-plugin-api.ts` mounts every `api/*.ts` handler directly onto Vite's dev server, so `npm run dev` alone serves both frontend and API. No `vercel dev`, no second terminal, no proxy juggling. That split was the previous project's most-documented pain point.

## Local API

There is no separate API server to run. `npm run dev` handles it. In production (Vercel), the same handlers deploy as **one** serverless function: everything lives under `api/_routes/` and is dispatched by the catch-all `api/[...path].ts`. That indirection isn't stylistic, Vercel counts each file under `api/` as its own function and the Hobby plan caps a deployment at 12, while this project has 17 endpoints, so deploying them as separate files fails outright and ships a frontend with no API behind it. Both the catch-all and the dev-server plugin resolve routes through the same `api/_routes/index.ts` table, so an unregistered handler 404s identically in dev and production.

Two deployment details that only bite in production, both configured in `vercel.json`:

- **SPA fallback.** `/admin` is a client-side pathname route (`src/App.tsx`). Vite's dev server falls back to `index.html` automatically; Vercel does not, so without the `rewrites` rule it looks for a file at `/admin`, finds none, and returns 404 before the app loads. The negative lookahead in that rule is load-bearing, `/api/*` must keep reaching the serverless function rather than being rewritten to the SPA shell, or the whole API starts returning HTML.
- **`vercel.json` takes no comments.** It validates against a strict schema and rejects unknown keys, including `_comment`-style ones. Hence this note living here instead.

## Environment variables

Copy `.env.example` to `.env.local` and fill in values as needed. **Phase 1–5 needs no API keys at all**, Nominatim, Overpass, OSRM, Open-Meteo, and Google News RSS are all free, keyless public services. **Pass 2's AI Copilot/agents and Feedback need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENROUTER_API_KEY`** (see "Pass 2 setup" above), everything else works with zero setup, and those two features degrade to a clear "not configured yet" message rather than crashing if you skip this.

## Testing

```bash
npm run test        # Vitest, property analyzer, cache/rate-limiter, and API handler unit tests
npm run typecheck   # tsc -b --noEmit, strict mode, zero `any`
```

60 unit tests currently cover the property-analysis logic (never fabricates a classification with zero evidence, correctly distinguishes verified/inferred/mixed), the cache/rate-limiter, the geocode/weather/poi-evidence handlers' graceful-degradation paths (a provider failure returns `{ok:false}`, never throws), the AI provider abstraction (missing key / provider error / network failure all degrade cleanly), the feedback handler's validation and DB-failure paths, the measurement math and map-preview GeoJSON builder (turf distance/area against known values), the Travel Planner's provider URL builders (correct prefill, honest fallback to a provider's homepage when a scheme can't be prefilled), and the Feature Status data file (no duplicate/empty entries).

**A note on live verification:** I built and typechecked everything in this session, and the automated tests above run with mocked network calls. I could not run a *live* end-to-end smoke test against the real Nominatim/Overpass/OSRM/Open-Meteo endpoints from within this session. Both the cloud sandbox and the bridged device shell used to build this have restricted network egress that blocks those hosts. The request logic itself is the same proven pattern already working in the current live GeoIntel deployment, just cleanly re-typed, but please run the manual checklist below once on your own machine before you trust it fully.

## Manual verification checklist

1. `npm install && npm run dev`, open `http://localhost:5173`, the page should load with a header, search bar, and empty map (no console errors).
2. Search "Charminar Hyderabad", a suggestion should appear; selecting it should center the map, drop a marker, and populate Location Identity, Property Intelligence, and GIS Evidence.
3. Switch the "Evidence" tab and toggle a few GIS layers on/off, points should appear/disappear on the map.
4. Switch to "Weather & News". Both should populate for the selected location.
5. Switch to "Nearby" and try a couple of categories.
6. Click "Directions", set a destination, and confirm a route draws on the map with distance/duration.
7. Open devtools → Network → block `overpass-api.de` (or go offline briefly) and reselect a location, GIS Evidence should show "temporarily unavailable" while the rest of the app keeps working.
8. (Pass 2, needs `.env.local` set up. See above) Click the "✨ Ask Copilot" button, ask "Why this classification?", the answer should reference the real numbers already shown in the Evidence/Property panels.
9. Click a building or empty ground on the map, a small "Evidence at this point" popup should appear bottom-left with real counts for that spot.
10. Open the "AI Agents" tab and click "Run" on a couple of agents, each should return a short write-up citing the same data visible elsewhere on screen.
11. Press Ctrl/Cmd+K (or the header's "⌘K" button), the command palette should open; try a few commands.
12. Click "💬 Feedback" in the header, submit a star rating. It should show "Thanks, your feedback was saved" and a row should appear in Supabase's `feedback` table.
13. Turn on 3D (map controls, top-left) and zoom into a city area, real extruded building shapes should render, not generic blocks; toggle back to 2D and they should disappear.
14. Click "Distance" in the bottom-left toolbar, click two points ~1km apart on the map, the running distance readout should be close to correct; switch to "Area", click 3+ points, and confirm a closed shape with an area readout.
15. Open the "Travel" tab (left panel), search a flight/train/bus route or a city for movies/hotels, each category should open two real provider sites in a new tab, prefilled where the provider supports it.
16. Open "⚙️ Settings" (header) and switch Metric → Imperial, Directions' distance readout should switch units immediately.
17. Open "📋 Features" (header), the Feature Status page should list every tracked feature with an accurate Live/Partial/Planned badge.
18. Resize the browser to a phone width (or open on an actual phone), the right-hand panel (radius + layers) should collapse to a bottom-sheet handle you can tap to expand, not disappear.

If any of these fail, the browser console and the terminal running `npm run dev` will show exactly which provider call failed.

## What's next (Pass 4+, not yet built)

Saved Locations & Recent History persistence, Workspaces/Notes/Bookmarks, PDF/print Reports, Share Analysis links, real accounts (authentication, Premium billing, Team Collaboration, Role Management, Audit Trail. These need real infrastructure decisions, like a payment processor, that haven't been made), Heatmap/Buffer/Catchment/Proximity/Density spatial analysis beyond the Pass 3 measurement tools, a System Status/API Health dashboard, Notifications, native app-store packaging (Capacitor/TWA + store review), and the full Playwright end-to-end suite. Each will ship the same way every pass so far did: real data, real error states, verified before calling it done. The in-app Feature Status page (header → "📋 Features") tracks all of this item-by-item and is the current source of truth, not this paragraph.

## Pass 2 feature notes

- **AI Copilot & Agents** (`src/features/ai/`, `api/ai/copilot.ts`, `api/ai/agent.ts`): grounded only in the currently selected location's real data (property analysis, GIS counts/scores, weather, nearby categories, active route) plus knowledge-base excerpts. See `api/_lib/kb.ts`. Never invents facts; says so when data is insufficient.
- **Click-to-inspect** (`src/features/gis/PoiInspector.tsx`, `api/poi-evidence.ts`): click any point on the map for a tight-radius (60m) Commercial/Residential/Institutional/Industrial breakdown, using the same classification logic as the main Evidence tab.
- **Command palette** (`src/features/command/CommandPalette.tsx`): Ctrl/Cmd+K or the header's "⌘K" button. Two items (Compare Locations, Generate Report) are shown disabled and labeled "coming soon" since those features aren't built yet. Not wired to fake actions.
- **Feedback** (`src/features/feedback/FeedbackForm.tsx`, `api/feedback.ts`): star rating + category + message, saved to Supabase's `feedback` table via the service-role key. Shows a real error state if the save fails. Never a fake "thanks!".
- **PWA installability** (`public/manifest.json`, `public/sw.js`): the site can be "Added to Home Screen" on a phone today. This is a step toward Play Store/App Store distribution, not the whole thing. Wrapping this as a native binary (e.g. via Capacitor or a Trusted Web Activity) and going through store review is separate, future work.

## Pass 3 feature notes

- **3D building extrusions** (`api/buildings.ts`, `api/_lib/buildingHeight.ts`, `src/features/map/useBuildings3D.ts`, `src/features/map/buildings3d.ts`): a separate Overpass query (`out geom;`) fetches real building-way geometry within the visible bounds once you're zoomed in (≥ zoom 16) with 3D on, rendered as a MapLibre `fill-extrusion` layer. Height comes from `height`/`building:levels` OSM tags when present; otherwise a by-building-type default (documented in `buildingHeight.ts`). Every extruded building reports whether its height is explicit or estimated via `heightIsEstimated`, same "no fabricated precision" discipline as the property classifier's confidence scores.
- **Measurement & drawing** (`src/stores/measureStore.ts`, `src/features/measure/`): click-driven distance (turf `length`) and area (turf `area`) tools with a live readout, undo, and clear. The map preview and the math are pure, independently tested functions (`measureGeo.ts`, `measureMath.ts`).
- **Travel Planner** (`src/features/travel/`): Flights, Trains, Buses, Movies, and Hotels, each opening two real providers (Google Flights + Skyscanner, IRCTC + ConfirmTkt, redBus + AbhiBus, BookMyShow + District, Booking.com + Google Hotels) with the search prefilled where that provider's own URL scheme supports it. Never a fabricated price, seat, or showtime, same pattern as the ride-booking links. The Travel Intelligence and Make My Trip AI agents (`api/ai/agent.ts`) now point users here instead of guessing at logistics.
- **Settings** (`src/features/settings/SettingsPanel.tsx`): a real UI for state that existed but had no control before this pass, distance units, default analysis radius, whether new sessions start in 3D, and panel motion (Full/Reduced/Off, on top of the OS-level reduced-motion setting, which always wins).
- **Feature Status page** (`src/data/featureStatus.ts`, `src/features/status/FeatureStatusPage.tsx`): the single source of truth for what's Live, Partial, or Planned, organized by category, built specifically so it can be shown to a client, manager, or teammate without overclaiming. Update the data file, not this README, when a feature's status changes.
- **Mobile layout**: the right-hand context panel (radius + GIS layers) becomes a collapsible bottom sheet below 900px width instead of disappearing; floating map panels (Directions, POI Inspector, Copilot) resize to fit phone widths; touch targets are sized to at least 40–44px across the header, tabs, and map controls.
- **Motion**: panel open/close transitions (Help, Feedback, Settings, Feature Status, Command Palette, Directions, POI Inspector, Copilot), a marker-drop animation, and a route-draw fade, all gated by `useMotionPreference()` (Settings' motion choice + the OS-level `prefers-reduced-motion`, either of which fully disables Framer Motion rather than just zeroing durations).

## Known trade-offs in this pass

- **Bundle size:** production build is ~1.2MB minified JS (MapLibre GL, Turf, and now Framer Motion), which Vite flags as large. Code-splitting the map into a lazy-loaded chunk is a reasonable performance follow-up, not done yet.
- **Basemap tiles:** OSM's public raster tile server has a fair-use policy; if this goes to real production traffic, switch to a paid tile provider or self-hosted tiles (one-file change in `src/features/map/basemaps.ts`).
- **GIS layers:** Roads and administrative boundaries are listed in the layer manager but marked "coming soon" rather than faked. Fetching full road/boundary polygon geometry responsibly needs a tiled fetch strategy, not a single Overpass call.
- **Timezone display**: Location Identity currently shows your device's timezone, not necessarily the selected location's. Flagged honestly on the Feature Status page as "Partial" rather than silently wrong.
- **Default-radius/3D-default settings** apply to the *next* session's initial values (they seed the relevant store's starting state), not retroactively to the current one, the in-session radius selector and 3D toggle still work as before.

## Security posture

Basic security headers are set on every response, locally via `plugins/vite-plugin-api.ts`'s dev middleware, and in production via `vercel.json` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a `Content-Security-Policy` scoped to this app's actual dependencies: same-origin `/api/*` calls plus the four keyless map-tile hosts in `basemaps.ts`; the dev CSP is looser to allow Vite's HMR). What's already true: the Supabase service-role key and the OpenRouter key never reach the client (`api/_lib/*` only); every `api/*.ts` handler validates its input and rate-limits by IP; no client-side code talks to Supabase directly. What's not yet true, and honestly marked "Planned" on the Feature Status page rather than implied: real user accounts, so there's no per-user access control yet.

**Admin / maintenance mode.** `/admin` and `POST /api/admin/maintenance` are gated by a single shared secret (`GEOINTEL_ADMIN_KEY`, server-side only) checked with a constant-time comparison (`api/_lib/adminAuth.ts`). Not a full account system, since none exists yet, but a real check: unset the key and every admin action is refused (503), not open. Enabling maintenance sets a flag in Supabase (`app_settings`, RLS-protected, service-role-only) that every other public `api/*.ts` handler checks before running (`api/_lib/maintenance.ts`'s `withMaintenanceGuard`). So a direct API call can't bypass it, only an admin-keyed request can. Every enable/disable/settings-change is written to `maintenance_audit_log` with a timestamp and whatever display name the admin has set in Settings. Run `supabase/migrations/0004_maintenance_mode.sql` before using this.
