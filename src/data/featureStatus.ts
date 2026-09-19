export type FeatureStatus = "live" | "partial" | "planned";

export interface FeatureEntry {
  name: string;
  status: FeatureStatus;
  /** Optional context — what's true today, what's missing, or where to look. Most useful on "partial"/"planned", but fine on "live" too. */
  note?: string;
}

export interface FeatureCategory {
  category: string;
  items: FeatureEntry[];
}

/**
 * Single source of truth for "what does GeoIntel actually do" — rendered by
 * FeatureStatusPage.tsx and linked from the header and Help Guide. Every
 * "live" claim here should be checkable against real code (cross-reference
 * README.md / the relevant src/features/* or api/* file before flipping a
 * status) — this page exists specifically so it can be shown to a client,
 * manager, or teammate without overclaiming. When a feature ships or a gap
 * closes, update the entry here rather than leaving this page stale.
 */
export const FEATURE_STATUS: FeatureCategory[] = [
  {
    category: "Search & Discovery",
    items: [
      { name: "Global search (places, addresses, landmarks)", status: "live" },
      { name: "Address & place autocomplete suggestions", status: "live" },
      { name: "Reverse geocoding (coordinates → address)", status: "live" },
      { name: "Use my current location (GPS)", status: "live" },
      {
        name: "Postal / PIN code lookup",
        status: "partial",
        note: "Nominatim resolves most postcodes as a general search query. There's no dedicated postcode-only lookup UI yet.",
      },
      {
        name: "Search by raw coordinates (lat/lon)",
        status: "live",
        note: "Typing a 'lat, lon' pair jumps straight to that point instead of going through place search.",
      },
      {
        name: "Recent search history",
        status: "planned",
        note: "Selections are already saved to this browser's storage, but there's no history list surfaced in the UI yet to see or reuse them.",
      },
      { name: "Saved locations / favorites", status: "planned" },
      { name: "Voice search", status: "planned" },
    ],
  },
  {
    category: "Map & Visualization",
    items: [
      { name: "Standard basemap", status: "live" },
      { name: "Satellite basemap", status: "live" },
      { name: "Dark basemap", status: "live" },
      { name: "Terrain basemap", status: "live" },
      { name: "2D / 3D perspective toggle", status: "live" },
      { name: "Real 3D building extrusions", status: "live", note: "Heights from OSM tags where available, a labeled estimate otherwise, never fabricated as exact." },
      { name: "Fullscreen mode", status: "live" },
      { name: "Map rotation & compass", status: "live" },
      { name: "Smooth pan, zoom & scroll on all devices", status: "live" },
      { name: "Live traffic layer", status: "planned", note: "No free provider offers real-time traffic data without a paid API." },
      { name: "Live earthquake layer", status: "live", note: "Layers \u2192 Live data. Real USGS feed, last 24 hours or 7 days, sized and coloured by magnitude." },
      { name: "Live weather radar layer", status: "live", note: "Layers \u2192 Live data. Most recent RainViewer precipitation frame as a map overlay." },
      { name: "Air quality reading", status: "live", note: "European AQI plus PM2.5, PM10, NO\u2082 and ozone for the selected location, from Open-Meteo (CAMS). Modelled on a coarse grid, so it describes the area rather than the street." },
      {
        name: "Historical satellite imagery timeline",
        status: "partial",
        note: "Layers \u2192 Time travel. A real year-by-year slider back to 2012 over NASA GIBS / MODIS imagery, keyless and free, with a blend control against the current map. Resolution is 250 m per pixel, so it shows reservoirs, coastlines, vegetation and large-scale urban growth \u2014 not individual buildings or streets, which would need commercial archive imagery.",
      },
      { name: "Wildfire / flight / vessel layers", status: "planned", note: "NASA FIRMS needs a registered key; the free flight and vessel tiers have been withdrawn. Left out rather than shown as switches that do nothing." },
      { name: "Public transit layer", status: "planned" },
      { name: "Street-level imagery", status: "planned" },
      { name: "Custom layer upload (GeoJSON / Shapefile)", status: "planned" },
      { name: "Map printing / image export", status: "planned" },
    ],
  },
  {
    category: "Location & Property Intelligence",
    items: [
      { name: "Click-to-inspect any point on the map", status: "live" },
      { name: "Property classification (Commercial / Residential / Institutional / Industrial / Mixed)", status: "live" },
      { name: "Confidence scoring", status: "live" },
      { name: "Evidence trust badges (Verified / Inferred / Unavailable)", status: "live" },
      { name: '"Why this result" reasoning', status: "live" },
      { name: "GIS evidence layers with adjustable opacity", status: "live", note: "One shared opacity slider for all visible layers today, not an independent control per layer." },
      { name: "Adjustable analysis radius (100m–5km)", status: "live" },
      { name: "Building footprint & height data", status: "live" },
      { name: "Full address identity (road, suburb, city, district, state, postcode)", status: "live" },
      {
        name: "Official / Authority Intelligence (current government officials by country/state/district/city)",
        status: "partial",
        note: "Sourced live from Wikidata, never a hardcoded or guessed name. Country-level is reliably covered; state-level needs a precise subdivision code from the address; city/district-level is best-effort and often correctly shows \"Unable to verify\" where Wikidata's coverage is thin.",
      },
      {
        name: "Timezone lookup",
        status: "partial",
        note: "Currently shows your device's timezone, not the selected location's. This is a known gap, not yet fixed.",
      },
      { name: "Zoning & land use data", status: "planned", note: "No free, reliable zoning data source found yet." },
      { name: "Parcel boundaries & ownership records", status: "planned" },
      { name: "Market value estimates", status: "planned" },
      { name: "Comparable properties", status: "planned" },
      { name: "Flood risk & environmental hazards", status: "planned" },
      { name: "Crime data", status: "planned" },
      { name: "School ratings", status: "planned" },
      { name: "Population & density (census figures, dated and sourced)", status: "live" },
      { name: "Demographics beyond population (income, age, employment)", status: "planned" },
    ],
  },
  {
    category: "Live Data & Nearby Places",
    items: [
      { name: "Live current weather & forecast", status: "live" },
      { name: "Local news", status: "live" },
      { name: "Nearby restaurants", status: "live" },
      { name: "Nearby cafes", status: "live" },
      { name: "Nearby hotels", status: "live" },
      { name: "Nearby hospitals & clinics", status: "live" },
      { name: "Nearby schools", status: "live" },
      { name: "Nearby ATMs", status: "live" },
      { name: "Nearby banks", status: "live" },
      { name: "Nearby petrol stations", status: "live" },
      { name: "Nearby shopping", status: "live" },
      { name: "Nearby parks", status: "live" },
      { name: "Nearby pharmacies", status: "live" },
      { name: "Nearby police stations", status: "live" },
      { name: "Nearby public transport stops", status: "live" },
      // Was "planned" while the identical capability was correctly marked live
      // under Map & Visualization — the page contradicted itself. It is built:
      // api/_routes/live.ts serves Open-Meteo CAMS, and three panels render it.
      {
        name: "Air quality index",
        status: "live",
        note: "European and US AQI with PM2.5, PM10, NO₂ and ozone, from Open-Meteo. Shown in Live layers, the location panel and the area report.",
      },
      { name: "Local events", status: "planned" },
      { name: "EV charging stations", status: "planned" },
    ],
  },
  {
    category: "Ask maNOWj & AI Agents",
    items: [
      { name: "Ask maNOWj chat (grounded Q&A)", status: "live" },
      { name: "Search Intelligence agent", status: "live" },
      { name: "GIS Intelligence agent", status: "live" },
      { name: "Property Intelligence agent", status: "live" },
      { name: "Navigation agent", status: "live" },
      { name: "Travel Intelligence agent", status: "live" },
      { name: "Make My Trip agent", status: "live" },
      { name: "Grounded, no-fabrication AI answers", status: "live", note: "Every agent and Ask maNOWj answer only from real on-screen data. They say so when data is insufficient rather than guessing." },
      { name: "Predictive search suggestions", status: "partial", note: "Basic autocomplete via Nominatim, not a learned/personalized ranking." },
      {
        name: "Map-aware natural-language queries",
        status: "live",
        note: "Ask \u2192 Find things on the map. \"hospitals within 5 km\", \"nearest petrol station\", \"is this a good place for a school\" run a real spatial query and draw the answer. The model only chooses the operation \u2014 every number comes from real data, and common phrasings are parsed locally with no AI call at all.",
      },
      {
        name: "AI-generated area reports",
        status: "partial",
        note: "AI \u2192 Generate area report produces a printable, source-cited report (save as PDF from the print dialogue) built from the evidence, classification, analysis and conditions already loaded. The prose is templated rather than model-written, so nothing in it can be fabricated.",
      },
    ],
  },
  {
    category: "Routing, Travel & Booking",
    items: [
      { name: "Turn-by-turn directions (car, walk, bike)", status: "live" },
      { name: "Real route distance, duration & alternatives", status: "live" },
      { name: "Use current location as route start", status: "live" },
      { name: "Ride-booking handoff (Uber, Rapido, Ola, Google Maps)", status: "live" },
      { name: "Flight search (Google Flights, Skyscanner)", status: "live" },
      { name: "Train search (IRCTC, ConfirmTkt)", status: "live" },
      { name: "Bus search (redBus, AbhiBus)", status: "live" },
      { name: "Movie tickets (BookMyShow, District)", status: "live" },
      { name: "Hotel search (Booking.com, Google Hotels)", status: "live" },
      { name: "Real-time traffic-aware ETA", status: "planned" },
      { name: "Multi-stop route planning", status: "planned" },
      { name: "Offline turn-by-turn navigation", status: "planned" },
      { name: "EV-aware route planning", status: "planned" },
    ],
  },
  {
    category: "Measurement & Spatial Analysis",
    items: [
      { name: "Distance measurement", status: "live" },
      { name: "Area measurement", status: "live" },
      {
        name: "Map drawing tools (click-to-plot points, lines & shapes)",
        status: "partial",
        // Was "live", which overstated it. The only click-to-plot code is the
        // measure tool, and measureStore clears every point when the mode
        // changes, so nothing drawn can be kept. Distance and Area are already
        // listed separately; this is the same tool, not a third capability.
        note: "You can plot points to measure a distance or an area, but shapes are not saved. Switching tools clears them. Keeping and naming drawn shapes is not built yet.",
      },
      {
        name: "Buffer analysis",
        status: "live",
        note: "Tools \u2192 Spatial analysis. Draws a real ring at any distance and counts the mapped features inside it by category.",
      },
      {
        name: "Within / containment search",
        status: "live",
        note: "Finds every place of a chosen category inside a distance, ranked nearest-first with real distances.",
      },
      {
        name: "Nearest-facility analysis",
        status: "live",
        note: "Closest facility of a chosen type within 10 km, with straight-line distance and compass bearing.",
      },
      {
        name: "Site suitability scoring (weighted)",
        status: "partial",
        note: "Scores a site 0\u2013100 for a chosen use from adjustable weights over OpenStreetMap feature density. Population statistics, land price and flood risk are NOT modelled \u2014 no free source provides them at this level, and every factor states the raw count it came from.",
      },
      // Removed rather than downgraded: this was "Nearest-facility analysis"
      // listed a second time under another name. runAnalysis.ts supports
      // exactly buffer, within, nearest and suitability — there is no separate
      // proximity operation, and counting one feature twice inflates the page.
      { name: "Catchment area analysis", status: "planned", note: "Needs travel-time isochrones, which the free routing tier does not provide." },
      { name: "Density / heatmap analysis", status: "planned" },
      { name: "Elevation profile", status: "planned" },
      { name: "Geofencing & location alerts", status: "planned" },
    ],
  },
  {
    category: "Collaboration & Sharing",
    items: [
      { name: "Feedback with star ratings (saved to a real database)", status: "live" },
      { name: "Join our team (application form, saved to a real database)", status: "live" },
      {
        name: "Share a location link",
        status: "live",
        note: "Native share sheet (clipboard fallback); opening a shared link re-selects that exact location.",
      },
      { name: "Share analysis / report", status: "planned" },
      // Was "planned" while the button already existed. The area report has a
      // "Print / Save as PDF" action backed by a real @media print stylesheet,
      // and the side panel tells people to use it.
      {
        name: "PDF / print export",
        status: "live",
        note: "Any area report can be printed or saved as a PDF from your browser's print dialogue, using a layout made for paper.",
      },
      { name: "Notes & annotations", status: "planned" },
      { name: "Bookmarks & collections", status: "planned" },
      { name: "Team workspaces", status: "planned", note: "Needs real accounts first." },
      { name: "Role management", status: "planned" },
      { name: "Real-time presence & comments", status: "planned" },
    ],
  },
  {
    category: "Personalization & Settings",
    items: [
      { name: "Theme: Auto / Light / Dark", status: "live" },
      { name: "Distance units: Metric / Imperial", status: "live" },
      { name: "Panel motion preference (Full / Reduced / Off)", status: "live" },
      { name: "Default analysis radius", status: "live" },
      { name: "Start map in 3D by default", status: "live" },
      {
        name: "Display name",
        status: "partial",
        note: "Saved to this browser only, in Settings → Your profile. There's no account system yet, so it isn't synced across devices.",
      },
      { name: "User accounts / sign-in", status: "planned" },
      { name: "Premium subscription & billing", status: "planned", note: "Needs a real payment processor decision first." },
      { name: "Personalized recommendations", status: "planned" },
    ],
  },
  {
    category: "Platform, Security & Support",
    items: [
      { name: "Command palette (Ctrl/Cmd+K)", status: "live" },
      { name: "Help & feature guide", status: "live" },
      { name: "Feature status page (this page)", status: "live" },
      { name: "Installable app (PWA / Add to Home Screen)", status: "live" },
      {
        name: "Full offline map access",
        status: "planned",
        note: "The app shell installs offline and previously-viewed map tiles are cached, but unvisited tiles and all live data (weather, GIS, nearby, etc.) still need a connection.",
      },
      { name: "Rate-limited, cached API layer", status: "live" },
      { name: "Server-side input validation on every endpoint", status: "live" },
      { name: "No secret keys ever reach the client", status: "live" },
      { name: "Basic security headers (CSP, X-Frame-Options, etc.)", status: "live", note: "Applied in both dev (plugins/vite-plugin-api.ts) and production (vercel.json). See the README's Security posture section." },
      {
        name: "Keyboard shortcuts",
        status: "partial",
        note: "Ctrl/Cmd+K and Escape work; a full documented shortcut set doesn't exist yet.",
      },
      {
        name: "Global maintenance mode (admin-controlled)",
        status: "live",
        note: "One-click enable/disable from /admin, enforced server-side on every API endpoint (not just hidden in the frontend). Admin access is a single shared passphrase, not a full account system (none exists yet). Propagates to open tabs via ~20s polling, not instant push.",
      },
      { name: "Native iOS / Android app", status: "planned", note: "The installable web app works today; app-store packaging is a separate, later effort." },
      { name: "Public developer API", status: "planned" },
      {
        name: "System status / API health dashboard",
        status: "live",
        note: "Live at /status. Real server-side probes of all five external dependencies (Overpass mirrors, Nominatim, Wikidata, OpenRouter, Supabase) with measured latency, cached 60s so the page does not itself load the free services it monitors. The AI check verifies reachability and key validity only \u2014 it deliberately does not spend a generation request, so it cannot report on the daily quota.",
      },
      // Was "planned", which undersold a real, working audit table. It covers
      // admin maintenance actions only (0004_maintenance_mode.sql, written on
      // every change and read back in the dashboard) — narrower than a full
      // audit trail, so "partial" rather than "live".
      {
        name: "Audit trail",
        status: "partial",
        note: "Admin actions on maintenance mode are recorded with who and when, and shown in the dashboard. Wider activity logging needs real accounts first.",
      },
    ],
  },
];

export function countByStatus(): Record<FeatureStatus, number> {
  const counts: Record<FeatureStatus, number> = { live: 0, partial: 0, planned: 0 };
  for (const cat of FEATURE_STATUS) {
    for (const item of cat.items) counts[item.status]++;
  }
  return counts;
}

export function totalFeatureCount(): number {
  return FEATURE_STATUS.reduce((sum, cat) => sum + cat.items.length, 0);
}
