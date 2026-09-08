# maNOWj GeoIntel v2

Location intelligence for better decisions. A ground-up rebuild of the GeoIntel platform.

## What's in this pass

This delivery covers **Phases 1–5**: foundation, map/search/location identity, GIS evidence & property intelligence, weather/news/nearby, and routing. It does **not** yet include the AI Copilot/agents, travel planner, saved locations persistence, premium interface, PDF reports, or the 3D globe intro — those are a real follow-up build, not stubs left lying around. See "What's next" below.

Every feature that *is* here is real: live Nominatim/Overpass/OSRM/Open-Meteo/Google-News calls, no mock data, and every panel has loading/success/empty/error/unavailable states so one provider outage never blanks the app.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. That's it — one command starts both the frontend and the API (see "Local API" below for why that matters).

## Architecture at a glance

- **Frontend:** React 19 + TypeScript (strict) + Vite, styled with CSS custom-property design tokens (light/dark, no invert-filter dark mode).
- **State:** Zustand, split into focused stores (`mapStore`, `locationStore`, `searchStore`, `gisUiStore`, `routeStore`, `uiStore`, `intelTabStore`) — no single giant component holding everything.
- **Data fetching:** TanStack Query for every network call — built-in request cancellation, caching, and consistent loading/error states.
- **Map:** MapLibre GL JS. Raster basemaps (OSM standard, Esri World Imagery satellite, CARTO dark, OpenTopoMap terrain) — no paid API key required. Swapping to a licensed vector provider later is a one-file change (`src/features/map/basemaps.ts`).
- **Backend:** `api/*.ts` handlers, shaped like Vercel serverless functions — deploy unchanged.
- **Local dev:** `plugins/vite-plugin-api.ts` mounts every `api/*.ts` handler directly onto Vite's dev server, so `npm run dev` alone serves both frontend and API. No `vercel dev`, no second terminal, no proxy juggling — that split was the previous project's most-documented pain point.

## Local API

There is no separate API server to run. `npm run dev` handles it. In production (Vercel), the same `api/*.ts` files deploy as serverless functions with zero changes.

## Environment variables

Copy `.env.example` to `.env.local` and fill in values as later phases need them. **Phases 1–5 don't require any API keys** — Nominatim, Overpass, OSRM, Open-Meteo, and Google News RSS are all free, keyless public services. The Supabase and AI variables are there for the next phase (saved locations, AI Copilot/agents) and aren't read by anything yet.

## Testing

```bash
npm run test        # Vitest — property analyzer, cache/rate-limiter, and API handler unit tests
npm run typecheck   # tsc -b --noEmit, strict mode, zero `any`
```

22 unit tests currently cover the property-analysis logic (never fabricates a classification with zero evidence, correctly distinguishes verified/inferred/mixed), the cache/rate-limiter, and the geocode/weather handlers' graceful-degradation paths (a provider failure returns `{ok:false}`, never throws).

**A note on live verification:** I built and typechecked everything in this session, and the automated tests above run with mocked network calls. I could not run a *live* end-to-end smoke test against the real Nominatim/Overpass/OSRM/Open-Meteo endpoints from within this session — both the cloud sandbox and the bridged device shell used to build this have restricted network egress that blocks those hosts. The request logic itself is the same proven pattern already working in the current live GeoIntel deployment, just cleanly re-typed — but please run the manual checklist below once on your own machine before you trust it fully.

## Manual verification checklist

1. `npm install && npm run dev`, open `http://localhost:5173` — the page should load with a header, search bar, and empty map (no console errors).
2. Search "Charminar Hyderabad" — a suggestion should appear; selecting it should center the map, drop a marker, and populate Location Identity, Property Intelligence, and GIS Evidence.
3. Switch the "Evidence" tab and toggle a few GIS layers on/off — points should appear/disappear on the map.
4. Switch to "Weather & News" — both should populate for the selected location.
5. Switch to "Nearby" and try a couple of categories.
6. Click "Directions", set a destination, and confirm a route draws on the map with distance/duration.
7. Open devtools → Network → block `overpass-api.de` (or go offline briefly) and reselect a location — GIS Evidence should show "temporarily unavailable" while the rest of the app keeps working.

If any of these fail, the browser console and the terminal running `npm run dev` will show exactly which provider call failed.

## What's next (Phases 6–12, not yet built)

AI Copilot + six agents + orchestration UI + streaming, a knowledge-base/RAG layer over your own product documents, Travel Planner (train/bus/flight/movies + Make My Trip), Saved Locations with persistence, the Premium interface, PDF/print reports, the 3D globe intro and 3D building extrusions, Help & Guide, Join My Team, deeper Settings, and Playwright end-to-end tests. Each will ship the same way this pass did: real data, real error states, verified before calling it done.

## Known trade-offs in this pass

- **Bundle size:** production build is ~1MB minified JS (mostly MapLibre GL + Turf), which Vite flags as large. Code-splitting the map into a lazy-loaded chunk is a reasonable Phase 12 (performance) follow-up, not done yet.
- **Basemap tiles:** OSM's public raster tile server has a fair-use policy; if this goes to real production traffic, switch to a paid tile provider or self-hosted tiles (one-file change in `src/features/map/basemaps.ts`).
- **GIS layers:** Roads and administrative boundaries are listed in the layer manager but marked "coming soon" rather than faked — fetching full road/boundary polygon geometry responsibly needs a tiled fetch strategy, not a single Overpass call.
- **Right-hand context panel** (radius + layer manager) is hidden below 1200px width rather than turned into a mobile bottom sheet yet.
