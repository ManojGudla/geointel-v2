# maNOWj GeoIntel

Location intelligence for better decisions. Search a place, get a property classification backed by visible evidence, check weather and news, find what is nearby, and route to it.

Live at [www.manowj.com](https://www.manowj.com).

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. One command serves both the frontend and the API, see "Local API" below for why that matters.

The map, search, location identity, GIS evidence, property intelligence, weather, news, nearby places and routing all work with zero configuration. Nominatim, Overpass, OSRM, Open-Meteo and Google News RSS are free and keyless.

## Optional setup for AI and feedback

The Copilot, the AI agents and the feedback form need two free services. Without them the app shows a clear "not configured yet" message rather than crashing, so this is genuinely optional.

Copy `.env.example` to `.env.local`, then:

1. **Supabase.** Create a free project, run each file in `supabase/migrations/` against it in order (SQL Editor, paste and run). Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings, API. Use the service-role key, never the anon key, and never put either in client code.
2. **Seed the knowledge base.** `npm run seed:kb` inserts the documentation articles the Copilot cites from (`supabase/seed/kb-documents.json`). Safe to re-run, it skips what is already there.
3. **OpenRouter.** Create a free API key and set `OPENROUTER_API_KEY`. `OPENROUTER_MODEL` defaults to `openrouter/free`, which is a router that picks whichever free model is available for each request rather than a model in its own right. The client re-rolls once when a model returns empty content, which reasoning models sometimes do when they spend their whole budget thinking.

## Architecture

- **Frontend.** React 18 with TypeScript in strict mode, built by Vite. Styling is CSS custom-property design tokens with real light and dark palettes, not an invert filter.
- **State.** Zustand, split into focused stores (`mapStore`, `locationStore`, `searchStore`, `routeStore`, `uiStore`, `measureStore` and others) rather than one component holding everything.
- **Data fetching.** TanStack Query for every network call, which brings request cancellation, caching and consistent loading and error states for free.
- **Map.** MapLibre GL JS with raster basemaps (OSM standard, Esri World Imagery, Esri Dark Gray Canvas, OpenTopoMap). No paid key. Moving to a licensed vector provider is a one-file change in `src/features/map/basemaps.ts`. MapLibre is code-split into its own chunk so it only downloads on routes that actually show a map.
- **Backend.** Handlers in `api/`, shaped as Vercel serverless functions and deployed unchanged.
- **Local dev.** `plugins/vite-plugin-api.ts` mounts every handler onto Vite's dev server, so `npm run dev` serves both sides. No `vercel dev`, no second terminal, no proxy.

## Local API

There is no separate API server to run.

In production all 22 endpoints deploy as a **single** serverless function: they live under `api/_routes/` and are dispatched by the catch-all `api/[...path].ts`. That indirection is not stylistic. Vercel counts each file under `api/` as its own function and the Hobby plan caps a deployment at 12, so shipping them as separate files fails outright and leaves a frontend with no API behind it. The catch-all and the dev-server plugin resolve routes through the same `api/_routes/index.ts` table, so an unregistered handler 404s identically in both.

Two production-only details, both configured in `vercel.json`:

- **SPA fallback.** `/admin` is a client-side route. Vite falls back to `index.html` automatically, Vercel does not, so without the `rewrites` rule it looks for a file at `/admin` and returns 404 before the app loads. The negative lookahead in that rule is load-bearing: `/api/*` must keep reaching the serverless function instead of being rewritten to the SPA shell, or the whole API starts returning HTML.
- **`vercel.json` takes no comments.** It validates against a strict schema and rejects unknown keys, including `_comment` ones. Hence this note living here.

### Outbound identity

Overpass, Nominatim and OSRM are volunteer-run and block unidentified cloud clients. Every outbound request carries a `User-Agent` naming the app and its URL, applied as a default inside `fetchWithTimeout` (`api/_lib/cache.ts`) so a new handler cannot forget it.

## Testing

```bash
npm run test        # Vitest
npm run typecheck   # tsc -b --noEmit, strict, no `any`
npm run build       # production build
```

1,300 unit tests across 122 files. They cover the property analyzer (never fabricates a classification with no evidence, separates a verified subject from an inferred neighbourhood), the cache and rate limiter, every API handler's graceful-degradation path (a provider failure returns `{ok:false}` and never throws), the AI layer (missing key, provider error, empty response, leaked reasoning), the measurement math against known distances and areas, the travel provider URL builders, colour contrast against WCAG AA on every published air-quality band, and a set of guards that fail the build if a surface starts overclaiming.

Network calls are mocked, so run the checklist below on a real connection before trusting a change that touches a provider.

## Manual checklist

1. `npm run dev`, open the app. Header, search bar and map load with no console errors.
2. Search a well-known place. Selecting a suggestion centres the map, drops a marker and fills Location Identity, Property Intelligence and GIS Evidence.
3. Toggle GIS layers on the Evidence tab. Points appear and disappear on the map.
4. Weather and News both populate for the selected location.
5. Nearby returns results, and tapping a row opens Directions to that place.
6. Directions draws a route with a distance and duration.
7. Block `overpass-api.de` in devtools and reselect. GIS Evidence shows "temporarily unavailable" while the rest keeps working.
8. Ask the Copilot "Why this classification?". The answer cites numbers already visible on screen.
9. Click bare ground on the map. An evidence popup appears with real counts for that point.
10. Run a couple of AI agents. Each cites the same data shown elsewhere.
11. Ctrl/Cmd+K opens the command palette and every listed command does something.
12. Submit feedback. A row appears in Supabase's `feedback` table.
13. Turn on 3D and zoom into a city. Real extruded footprints render, not generic blocks.
14. Measure a known 1km distance, then switch to Area and close a shape.
15. Travel opens two real provider sites per category, prefilled where the provider's URL scheme allows.
16. Settings, switch Metric to Imperial. Every distance readout in the app switches at once.
17. Features lists each item with an accurate Live, Partial or Planned badge.
18. At phone width the right-hand panel collapses to a bottom sheet you can tap open, rather than disappearing.

If something fails, the browser console and the `npm run dev` terminal name the provider call that broke.

## Design notes

- **Property classification.** The subject building wins outright over its surroundings. A distance-weighted score decides what the clicked place is, with raw counts kept separately for the Evidence tab so the reader can check the working. Confidence is reported honestly: high when a subject was identified, capped when only the neighbourhood could be inferred, and "unavailable" rather than a guess when there is no evidence at all.
- **3D buildings.** A separate Overpass query with `out geom;` fetches real footprint geometry within the visible bounds at zoom 16 and above, rendered as a MapLibre `fill-extrusion`. Height comes from `height` or `building:levels` tags when present and a per-type default otherwise, and every building reports which of the two it used.
- **AI grounding.** The Copilot and the agents only reason over data already on screen plus knowledge-base excerpts. They say when they lack information instead of inventing an answer, and every answer names the model that produced it.
- **Motion.** Panel transitions, a marker drop and a route-draw fade, all gated behind `useMotionPreference()`. The OS-level `prefers-reduced-motion` setting always wins, and when motion is off the Framer Motion code path is skipped entirely rather than run with zero duration.
- **Nearby radius.** Where OpenStreetMap coverage is thin the server widens the search once instead of returning nothing, and the panel says so rather than quietly answering a different question.

## Known trade-offs

- **Bundle size.** MapLibre is around 800kB and Turf is not small. Both are split into their own chunks, so the first paint does not wait on them, but a map-heavy route still downloads a lot.
- **Basemap tiles.** OSM's public raster tiles have a fair-use policy. Real production traffic should move to a paid or self-hosted tile provider, which is a one-file change.
- **GIS layers.** Roads and administrative boundaries are listed but marked as planned rather than faked. Fetching full road and boundary geometry responsibly needs a tiled fetch strategy, not one Overpass call.
- **No accounts.** There is no per-user access control, and the Feature Status page says so rather than implying otherwise.

## Security posture

Security headers are set on every response, locally through the dev middleware in `plugins/vite-plugin-api.ts` and in production through `vercel.json`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a `Content-Security-Policy` scoped to this app's real dependencies, meaning same-origin `/api/*` calls plus the map-tile hosts listed in `basemaps.ts`. The dev CSP is looser so Vite's HMR works.

The Supabase service-role key and the OpenRouter key live only in `api/_lib/*` and never reach the client. Every handler validates its input and rate-limits by IP. No client-side code talks to Supabase directly. Retrieved geographic data is treated as untrusted input, so instructions embedded in external data are not followed.

**Admin and maintenance mode.** `/admin` and `POST /api/admin/maintenance` are gated by a single server-side secret (`GEOINTEL_ADMIN_KEY`) checked with a constant-time comparison in `api/_lib/adminAuth.ts`. Unset the key and every admin action is refused with a 503 rather than being left open. Enabling maintenance sets a flag in Supabase (`app_settings`, RLS-protected, service-role only) that every public handler checks through `withMaintenanceGuard`, so a direct API call cannot bypass it. Each change is written to `maintenance_audit_log` with a timestamp. Run `supabase/migrations/0004_maintenance_mode.sql` before using this.

## Feature status

`src/data/featureStatus.ts` is the source of truth for what is Live, Partial or Planned, and it renders as an in-app page under "Features" in the header. Update that file when something changes, not this README.
