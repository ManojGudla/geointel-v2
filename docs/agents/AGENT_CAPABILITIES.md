# Agent capabilities

What each agent does on the `agents-v2` branch, what it refuses to do, and
what the agent brief asks for that is not built yet. Every fact comes from
the sources listed; "computed" means this app worked it out from them.

## 01 Search Intelligence

- **Sources:** reverse geocoding of the selected place (Nominatim, Photon
  fallback); the visitor's search text re-run through `/api/geocode`.
- **Gives:** the place name and area; matches found; the best match; whether
  the selected place is that match or how far from it (computed); up to four
  other matches with their distance from the selected place.
- **Without a search:** describes the selected place and says nothing was
  searched.
- **Not built:** search history comparison, follow-up questions using earlier
  searches.

## 02 GIS Intelligence

- **Sources:** `/api/gis` (Overpass) at the chosen radius (snapped to 100,
  250, 500, 1000, 2000 or 5000 m); `/api/population` (Wikidata, areas with
  their units).
- **Gives:** mapped counts for nine kinds of feature, distance-weighted
  scores (computed), the feature at the point, population, area and density
  for the wider place. Zero counts carry "may be unmapped"; a cut-short
  Overpass answer is flagged and lowers confidence.
- **Not built:** land cover, elevation (no provider connected), comparison of
  two places.

## 03 Property Intelligence

- **Sources:** the same Overpass answer as GIS (asked once).
- **Gives:** classification and confidence from the app's property analyzer
  (computed, with its method and limitations), with the counts behind it.
- **Refuses:** value, ownership, zoning, approvals, legal status.
- **Not built:** side-by-side comparison of properties.

## 04 Navigation Intelligence

- **Sources:** `/api/route` (OSRM, routing.openstreetmap.de) for the planned
  route, or, in a team request, a route to the nearest place of a kind.
- **Gives:** mode, distance, time, straight-line distance (computed), the
  provider's alternatives with how they differ, and the first turns.
- **Refuses:** traffic, closures, delays (there is no live traffic data).
- **Without a route:** says so without calling the model.

## 05 Travel Intelligence

- **Sources:** `/api/weather` (Open-Meteo), `/api/nearby` (Overpass, 1 km).
- **Gives:** current temperature, feels-like, conditions, humidity, wind, the
  last hour's rain, two forecast days, and nearby places by kind with the
  closest named one.
- **Refuses:** prices, availability, opening hours. Bookings go to the Travel
  tab's links to real booking sites.
- **Not built:** comparing two destinations.

## 06 Make My Trip

- **Agent card:** a same-day suggestion from nearby places and weather.
- **Trip builder (`/api/ai/trip`, no model):** interests (sights,
  restaurants, cafes, parks, shops), 1-3 days, 2-4 stops a day, car/walk/bike.
  Named mapped places within 2 km, ordered nearest-next, each hop measured
  by the routing provider, stated visit-time assumptions, warnings for
  unknown hops, hops over an hour and days over 9 hours. Reorder and remove
  stops, re-measure, and draw it on the map.
- **Refuses:** prices, tickets, bookings.
- **Not built:** dates and budget inputs (there is no price data to check a
  budget against), destinations other than the selected place.

## Working together (`/api/ai/ask`)

One request, several agents. The planner picks the agents from the words
used ("evaluate", "family home", "route to the nearest hospital", "within
2 km", "weather", "plan a day"), every source is asked once, and a single
model call writes a section per agent. The screen shows what was understood,
the agents involved, the real steps with their times, each section's
confidence, and a button that opens the found route in Directions.

## Not built from the brief

- The full-screen "Intelligence Suite" workspace with its own layout and
  visual identity per agent. The team box, trip builder and evidence views
  live in the existing AI tab instead.
- Destination comparison, property comparison, search history.
- Live acceptance results: see TEST_RESULTS.md.
