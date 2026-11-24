# maNOWj GeoIntel: bug and stability audit, 25 November 2026

Code audited: `main` at `9ae25db`, plus the live site at https://www.manowj.com on a 375 px phone viewport.

Scope, as requested: external API failures and rate limits, map and geometry maths, mobile layout from 360 to 430 px, and routing, state and SEO. Every finding below was read in the code or checked on the live site. Line numbers are for `9ae25db`.

The code is already defensive: every upstream call has a timeout, the client separates "provider down" from "network error", retries stop on final answers like rate limits, and query keys include the coordinates. The bugs that remain are mostly places where **a failure is shown as a fact**, which matters more here than elsewhere because the product's promise is that every figure is sourced, dated and never guessed.

## Critical: breaks the "never mislead" rule

### C1. A failed Esri lookup is cached as "no capture date published" for weeks
- **Where:** `api/_routes/imagery.ts` lines 141, 171 and 193, and the edge cache on line 197.
- **Cause:** `queryLayers` uses `Promise.allSettled` and drops rejected layers, so when every Esri metadata request fails (HTTP 429 or 5xx, timeout, malformed JSON) the result is an empty list. That is treated exactly like "Esri has no footprint here": `result` stays `null`, it is written to the 7-day in-memory cache (line 193) and returned with `s-maxage=604800, stale-while-revalidate=2419200` (line 197).
- **Impact:** One bad minute at Esri makes the app state, for up to five weeks for that 1 km cell, that the imagery date is not published. That is a false statement presented as a fact.
- **Fix:** Count how many layer queries actually answered. If none did, return `502 PROVIDER_UNAVAILABLE` (which is `no-store`) and cache nothing. Cache `null` only when Esri answered and had no footprint.

### C2. Self-intersecting area measurements show a wrong number
- **Where:** `src/features/measure/measureMath.ts` line 13.
- **Cause:** The ring is passed straight to `turf.area`. When the outline crosses itself (an easy mistake when tapping points out of order on a phone), the two lobes have opposite winding, their signed areas cancel, and turf returns a figure that can be far too small (close to zero for a symmetrical figure-of-eight).
- **Impact:** A confidently wrong area, with nothing on screen to say so.
- **Fix:** Check the polygon with `turf.kinks`. If the lines cross, show no number and say "The outline crosses itself. Move or undo a point."

## High

### H1. Any failed imagery-date check says "Esri does not publish a capture date"
- **Where:** `src/features/map/ImageryDate.tsx` lines 77 to 85.
- **Cause:** `query.data?.imagery ?? null` is `null` both when Esri has no date and when the request failed. The error branch is never checked.
- **Impact:** Panning quickly can hit the route's own limit of 30 requests per minute (`imagery.ts` line 47), and that 429, or any network failure, is reported to the visitor as a fact about Esri's data.
- **Fix:** Show "Couldn't check the imagery date just now" with a Retry button when `query.isError`.

### H2. Missing weather values render as "0°C", "0%" or "NaN"
- **Where:** `src/features/weather/WeatherPanel.tsx` lines 24 to 55.
- **Cause:** `Math.round(null)` is `0` and `Math.round(undefined)` is `NaN`. Open-Meteo returns `null` for variables it has no value for, and `api/_routes/weather.ts` passes them through unchanged. Precipitation renders as " mm" with no number.
- **Impact:** A missing reading becomes a misleading zero ("0°C", "0 km/h wind").
- **Fix:** One formatter that renders "not reported" for anything that is not a finite number.

### H3. Overpass results cut short mid-query are counted as complete
- **Where:** `api/_lib/overpass.ts` lines 336 to 346.
- **Cause:** A `remark` (Overpass flagging that it stopped part-way, usually a timeout or memory limit) is treated as a failure only when there are no elements. With some elements it is accepted silently, and the remark is not passed on.
- **Impact:** Counts like "7 shops within 250 m" and the 0 to 100 score can be undercounts, shown with no caveat.
- **Fix:** Pass an `incomplete` flag through `runOverpassQueryDetailed` and `/api/gis`, and show "The map data server cut this query short, so counts may be low" on the evidence and score panels.

## Medium

### M1. Weather: a malformed reply is cached, and "As of" can run up to 15 minutes ahead of the data
- **Where:** `api/_routes/weather.ts` lines 98, 105 and 135.
- **Cause:** The upstream body is cached (line 98) before it is checked (line 105), so an incomplete 200 answer turns into fifteen minutes of 502s for that point. Separately, `fetchedAt` is stamped when the response is built (line 135), not when Open-Meteo was asked, so a cached answer claims to be fresher than it is.
- **Fix:** Validate first, then cache `{ data, fetchedAt }` together and return the stored time.

### M2. Two dialogs use `100vh`, so their bottoms hide behind the phone's browser bar
- **Where:** `src/features/settings/SettingsPanel.css` line 14 and `src/features/status/FeatureStatusPage.css` line 14.
- **Cause:** On mobile Safari and Chrome, `100vh` is the height with the toolbars hidden, so `calc(100vh - …)` is taller than the visible area. The app shell already uses `100dvh` (`src/App.css` line 9); these two were missed.
- **Fix:** `100vh` as a fallback, then `100dvh`.

### M3. Safe-area insets have no effect
- **Where:** `index.html` line 5, and `src/features/shell/NavRail.css` line 67.
- **Cause:** The viewport tag has no `viewport-fit=cover`, so `env(safe-area-inset-*)` always resolves to 0 and the nav bar's inset rule does nothing. The page is letterboxed instead of using the full screen in landscape and in the installed app.
- **Fix:** Add `viewport-fit=cover`, pad the app shell on the top, left and right, and give the fixed bottom banners (consent, notices) a bottom inset. The nav bar's existing rule then starts working.

### M4. At the default 250 m, "Accessibility 0" reads as "no transport"
- **Where:** `src/features/intelligence/locationIntelligence.ts` lines 91 to 96, with the default radius in `src/stores/uiStore.ts` line 56.
- **Cause:** Zero stops mapped within 250 m is common even in city centres (it was 0 on the live site in central Hyderabad). It is scored 0 and labelled like a judgement.
- **Fix:** Below 500 m, when a count is 0, say "None mapped within 250 m. Widen to 1 km" instead of a 0 score. This is a scoring decision, so it is listed for you to decide rather than changed.

### M5. The phone bottom sheet opens at half height, leaving about 40% of the screen for the map
- **Where:** `src/features/shell/sheet.ts` line 53.
- **Cause:** `INITIAL_DETENT` is `half` (50% of the column), under a search box and tool row. Your target is at least 65% map.
- **Fix:** Part of Phase 2: open at the peek height on phones and drop to peek automatically while the map is being dragged or measured.

### M6. Forecast days are labelled one day early in the Americas
- **Where:** `src/features/weather/WeatherPanel.tsx` line 53.
- **Cause:** `new Date("2026-11-26")` is midnight UTC, which is still the 25th anywhere west of Greenwich, so the weekday printed is the previous day. Found while fixing H2; it matters now that the app opens for visitors in the US and Canada.
- **Fix:** Read and print the date in UTC.

## Low

- **L1. Old website address.** `src/config/founder.ts` line 16 still defaults to `https://manoj-gudla-website.vercel.app/`. Your portfolio is now at `https://me.manowj.com/`.
- **L2. Small touch targets.** Measurement handles are 32 px (`src/features/map/MapView.css` line 205). 44 px is the usual minimum for a finger.
- **L3. No guard against NaN.** `formatDistance` and `formatArea` (`src/features/map/geo.ts`) print "NaN km" if they are ever given a non-finite number. No caller does today.
- **L4. Server caches never shrink.** `TtlCache` and `RateLimiter` (`api/_lib/cache.ts` line 16) only drop entries when they are read after expiry. Serverless instances are short-lived, so this is unlikely to matter.

## Checked and working

- **Timeouts:** Every server call to Overpass, Nominatim, Photon, OSRM, Open-Meteo, USGS, RainViewer, Wikidata and Esri goes through `fetchWithTimeout`.
- **Client failures:** The client applies a 20 s deadline that covers the response body too, survives malformed JSON, and does not retry final answers like `RATE_LIMITED`.
- **Overpass:** Mirrors are raced, empty results carrying a remark are rejected, and empty results get a short cache.
- **Nominatim:** Requests are paced to one per second, with a Photon fallback.
- **OSRM:** "No route" is told apart from "provider down".
- **USGS:** Events with no magnitude are dropped, and a missing time renders as blank.
- **NASA GIBS:** Dates are clamped to three days ago so tiles are never blank, and the 250 m per pixel limit is stated. Esri Wayback dates are labelled as publish dates, not capture dates.
- **Canonical host:** Every canonical tag, the sitemap, robots.txt and the share links use `https://www.manowj.com`. `manowj.com` redirects to `www` (checked live), and `tests/unit/canonicalHost.test.ts` guards this.
- **Hydration:** There is no hydration step to mismatch. The app mounts with `createRoot` over prerendered HTML.
- **Switching places quickly:** Query keys include the coordinates, search and map-click lookups ignore answers for a place you have already left, and agent answers record which place they were for.
- **Shell height:** The shell uses `100dvh`.

## Status after the fix patch

**Fixed, each with tests (1,482 passing; type check, build and contrast check clean):**

- **C1:** `/api/imagery` returns `502 PROVIDER_UNAVAILABLE` when no Esri layer answers, and caches nothing. `null` is now cached only when Esri actually replied.
- **C2:** An outline that crosses itself shows "Lines cross" and asks you to drag or undo a point, instead of a wrong area. Before the 2nd point (distance) or 3rd point (area) the readout shows a dash, not "0 m".
- **H1:** A failed imagery-date check says so and offers "Try again".
- **H2:** Weather values go through `src/lib/reading.ts`, so a missing reading shows "Not reported" or a dash, never 0 or NaN. The same fix covers the printed area report (`AreaReport.tsx`), which had the same bug, and the AI context, which now leaves a missing temperature out instead of sending null. The weather panel now shows "as of" beside its source.
- **H3:** `runOverpassQueryDetailed` returns `incomplete`, and `/api/gis` passes it on and does not cache it. The Evidence tab and the location score show a caveat.
- **M1:** Weather replies are checked before they are cached, and `fetchedAt` is the time Open-Meteo was actually asked.
- **M2:** Both dialogs use `100dvh`, with a `100vh` fallback.
- **M3:** `viewport-fit=cover` is set, the app shell pads its top and sides for the notch, the consent banner clears the home indicator, and the nav bar's existing inset now takes effect.
- **M5:** On phones the sheet drops to peek height (about 32%) when you pan the map or start measuring. The measuring readout, with Undo, Clear and Done, now sits just above the sheet instead of underneath it.
- **M6:** Forecast weekdays are read in UTC.
- **L1:** The founder link now points to `https://me.manowj.com/`.
- **L2:** Measurement handles are 44 px on touch screens.
- **L3:** `formatDistance` and `formatArea` print a dash for non-finite input.

**Left for you to decide:**

- **M4:** How to show zero counts at small radii. This is a scoring choice.
- **Desktop layout:** Moving the search box into the docked side panel. Today search floats over the map so it stays available when the panel is closed. Moving it would hide search whenever the panel is shut, so I have not changed it.
- **Phone peek content:** A custom peek bar showing the place's main result with its source and date. Today the peek height shows the panel's own header.
- **Touch measuring:** A fixed crosshair with an "Add point here" button, instead of tapping where your finger covers the spot.
- **Report status:** A one-line status strip on the printable report ("Weather loaded · Places timed out · Retry"). The workspace panels already load and fail independently, each with its own message.
- **Caching:** No changes needed. Responses are already cached at the edge (`s-maxage` with `stale-while-revalidate`), in memory per route, and in the browser through React Query's `staleTime`.
