# Changelog

## v3.7.1 (unreleased, branch ai-property-fixes)

Reported 28 November 2026 from a client meeting the day before: Ask
maNOWj did not answer, the AI agents were slow and then said the servers
were busy, and property type still came back with nothing when no source
described a building.

### Fixed
- AI answers no longer depend on OpenRouter's shared free models alone.
  Groq (GROQ_API_KEY) and Google Gemini (GEMINI_API_KEY) are asked first
  when their keys are set: answers in seconds, each with its own free
  allowance. OpenRouter stays as the last resort. Good agent answers are
  kept for 15 minutes per agent and place, so reopening a place is
  instant.
- No visitor is told "the free AI is busy, try again later" any more.
  When no written answer is possible, the agents, the team report and the
  chat show the checked facts with one neutral line; the reason is kept
  for diagnostics and the server log.
- Ask maNOWj no longer gives up when the AI cannot read a question: it
  tries a looser reading of the same words ("show me hospitals" finds
  hospitals), and a question that means nothing gets an example of how to
  ask.
- Property type is never Unknown for a building nothing describes. After
  the building's own tags, the businesses inside it, the land it stands
  on, its name and the neighbourhood, it now looks at land use within
  800 m (in the same map query), and if that does not settle it, answers
  Residential as a default: labelled as a default, 30% for a house-sized
  footprint and lower for bigger ones.
- A tap on a building opens the Overview with the property type first and
  everything else folded under "More about this place".

### Needs
- GROQ_API_KEY in Vercel (free at console.groq.com/keys) for the speed-up.
  Without it the AI behaves as before, with the new wording.

## v3.6.2 (unreleased, branch property-reliability)

Reported 26 November 2026, evening: a building beside NH163 still read
Unknown, and a tap on the ground nearby "sometimes works" while a tap on
the building does not.

### Fixed
- Shops, offices and clinics mapped inside a building were never found on
  the live site: the lookup asked for them without their positions, so
  none could be placed inside anything. "Commercial, from the businesses
  inside it" now works.
- An answer the map server cut short is now said to be one, with Try
  again, and no browser keeps it. It used to be kept for an hour, so a
  building read from a partial answer stayed wrong however often it was
  tapped.
- The land search is lighter (300 m and 150 m, from 500 m and 200 m), and
  large unnamed land-use zones are also found through the area index on
  servers that support it.

### Changed
- A tap on a building that says nothing about itself now gives the same
  neighbourhood reading a tap beside it gives, as a guess held at 35% at
  most (40% for open ground), and lists the nearest mapped places with
  their distances.

## v3.6.1 (unreleased, branch property-land-use)

Reported with screenshots on 26 November 2026: in Abids (Hyderabad) two
buildings read "Unknown ... no land use around it", and a tap near
Malakpet read "Nothing is mapped at this exact point".

### Fixed
- Property type now finds the land a building stands on even when that
  land has no name, which is most land. Both Abids buildings are inside an
  unnamed residential zone and now read Residential (inferred, 50%, because
  the zone covers a whole neighbourhood); the Malakpet tap is inside
  farmland and now reads Agricultural.

### New
- Parks, gardens, playgrounds and sports grounds read as Open Space, and
  farmland and orchards as Agricultural, instead of Unknown.
- When the map does not say what a building is used for, the panel links
  straight to editing it on OpenStreetMap, and to street photos of the
  spot on Mapillary to check by eye.

## v3.6 (unreleased, branch property-directions-seo)

Reported: Directions did nothing from a list of found places; an office
tower was called "RESIDENTIAL, VERIFIED, 95%"; some buildings were not 3D.
Also the SEO brief of 26 November 2026 (details in
docs/audit/SEO_AUDIT_2026-11.md).

### Fixed
- Tapping a place in an Analyse result (for example "ATMs within 2 km")
  opens Directions to it, starting where the distances were measured from.
  Unnamed places read as what they are ("ATM", or "State Bank of India
  ATM") instead of a code like "atms". Directions from "My Location" now
  starts there.
- Property type reads the building the exact point is inside, anywhere in
  the world: its own OpenStreetMap tags first, then the businesses mapped
  inside it, then the land or campus it stands on. Only the first two are
  ever called Verified. A house next door no longer decides it. Homes with
  shops or offices inside are Mixed Use; with no evidence it says Unknown.
- 3D buildings: buildings mapped as several parts (courtyards, large
  complexes) are now drawn; the whole view is filled (up to 16 blocks of
  about 1 km, nearest first) instead of a fixed 3 x 3 block around the
  centre; and up to 2,500 buildings are drawn per block (was 1,500).
  Clicking a 3D building selects that building, not the ground behind it.

### New
- The property panel shows the building's height (as mapped, or floors x
  3.2 m, saying which), floors, footprint and address, with links to check
  the building and the land on OpenStreetMap.
- City pages show the ground height near the centre (Copernicus 90 m
  elevation model, via Open-Meteo) and a "Tools to use in <city>" section.
- Visible questions and answers on the tool pages and the area report.
- Links written as ?lat=&lng=&layer= open too.

### Changed
- New titles, descriptions and headings for the homepage, the tool pages
  and the AI map search page, written around what people search for.
- The "needs JavaScript" notice can no longer be quoted under a search
  result.
- Structured data: the homepage is a SoftwareApplication (Utilities, Web);
  tool pages carry HowTo and FAQPage built from what they show; the AI map
  search page's questions are in its static HTML.
- The satellite history page describes the sharp past versions since 2014,
  not only NASA's 250 m imagery.
- City titles and descriptions fit what a search result shows.
- llms.txt lists every page.

## v3.5.1 (unreleased, branch ai-busy-fallback)

Reported: "What can this app do?", the first suggestion in Ask maNOWj,
answered "The free AI models are busy (rate limited) right now."

### Fixed
- Questions about the app itself are answered at once without the AI: the
  four suggestions shown before a place is picked, "what can you do",
  "hi", "thanks", and who built maNOWj. They no longer fail when the free AI
  is busy, and no longer use up its daily allowance.
- When the AI cannot write, the agent cards, Ask the agents together and
  Ask maNOWj (for questions about the place) still show the facts they
  checked, opened, with a plain note saying why there is no written answer.
  The route to the nearest place still works.
- A per-minute limit on the free AI used to be mistaken for one busy model,
  so each question went on to ask three more models that refused for the
  same reason, using up the day's allowance faster. It now stops at once,
  pauses briefly, and says what happened.

### Changed
- Clearer messages: "too many questions in the last minute", "today's free
  AI allowance is used up, it resets at midnight UTC (5:30 AM India time)",
  or "the free AI models are busy right now".
- Results written without a model now read "No AI model used: ..." instead
  of "Written by none: ...".
- Ask maNOWj names the real menu item, "Join Our Team".

## v3.5 (unreleased, branch agents-v2)

The AI agents now check their facts. Details in docs/agents/.

### New
- Ask the agents together: one request ("Is this good for a family home?
  Route to the nearest hospital") runs several agents, shows what they
  understood, the steps they really took with their times, a section per
  agent with its confidence, and a button that draws the found route.
- Make My Trip builds a 1-3 day plan from real mapped places near you, with
  every hop measured by the routing service. Reorder or remove stops,
  re-measure, and show the plan on the map.
- Every agent and Copilot answer comes with its evidence: each fact with its
  source and time, marked verified data, computed or unavailable. Tap a
  citation to see the fact behind a sentence.
- Navigation lists the routing service's alternative routes and first turns.

### Changed
- The agents and the Copilot no longer take facts from the page. The server
  fetches them, so nothing the browser sends can be stated as verified, and
  officials are looked up by the server only when you ask about them.
- Any sentence with a number that is not in the evidence is removed before
  you see it, and the answer says so.
- Confidence comes from which sources answered, not from the AI.
- With too little evidence, agents say "Insufficient verified data to provide
  a reliable conclusion." without asking the AI, which saves the daily quota.
- AI answers may take up to 40 seconds (was 35), since the evidence is
  fetched first.

### Security (branch deps-upgrade, on top of agents-v2)
- Vite 7.3.8, Vitest 4.1.12 and @vitejs/plugin-react 5 replace Vite 5 and
  Vitest 2, which had critical and high advisories in the dev server and the
  test runner. The site's browser support is unchanged (now written in
  vite.config.ts). Local development needs Node 20.19+ or 22.12+.

## v3.4 (unreleased)

Easier to find your way around, ready for visitors outside India, and a bug
hunt whose rule was: a failure is never shown as a fact. Details in
docs/audit/BUG_REPORT_2026-11-25.md.

### New
- The six AI agents are easy to find: a one-line "AI agents can explain this
  place" row at the top of every place, the bottom tab is now called "AI",
  and the agents come first in that panel.
- "All tools" in the header (it was a magnifying glass) opens one list of
  every feature. It keeps its label on phones.
- Visitors outside India get example places abroad, a map that opens on a
  city in their own time zone, and miles in the US and UK.
- Tracking counts a picked search result as an opened place, with the
  country of the place (never the address).

### Improved
- On phones, the bottom sheet drops out of the way while you pan or measure,
  the Fuel/ATM/Hospital chips step aside while a panel is open, and the
  measuring readout with Undo, Clear and Done sits above the sheet.
- Measurement handles are bigger on touch screens.
- The weather panel shows "as of" next to its source.
- Theme moved into Settings. The "quick game" pop-up no longer appears; the
  games are in More and in All tools.

### Fixed
- A brief Esri outage was cached for weeks as "no capture date published".
- An area outline that crossed itself showed a wrong, too-small area.
- Missing weather readings showed as 0°C or NaN, on screen and in the report.
- Overpass answers cut short were counted as complete; they are now flagged.
- Forecast days were labelled a day early in the Americas.
- Two dialogs were cut off behind phone browser bars, and safe-area insets
  had no effect.
- Population density could be computed from an area in the wrong unit
  (square metres or miles read as km²); areas are now converted from their
  Wikidata unit, and a Wikidata outage is reported as an outage.
- Fly maNOWj shows an angry Manoj when you crash and on the game-over card.
- The API refused nothing off the globe: `?lat=500` went on to the weather,
  Overpass, address and routing providers, and a blank `?lat=` meant 0,0.
  Every route now answers 400 first. Clicking a repeated copy of the world
  (beyond 180°) sent longitudes like 286; the map now sends -74.

### Security
- `source-map-js` updated to 1.2.4 (high-severity advisory, build tooling).
- The dev server listens only on this computer. Use `npm run dev:phone` to
  test from a phone on the same Wi-Fi.

## v3.3 (11 November 2026)

A clearer first screen, new guide pages, downloads, games, tracking and
search-engine fixes, following the v3.2 audit.

### New
- The first screen says what the app is for ("Check any address in
  seconds") and offers three localities to try in one tap.
- A Report button under the search box: the printable area report is now
  one tap away instead of three.
- Download results as CSV (Excel, Google Sheets) or GeoJSON (QGIS,
  ArcGIS) from the Nearby list and from analysis results.
- Seven guide pages, each linking into the app at a real place: the area
  report, radius search, measuring, satellite imagery by year, and pages
  for real estate, shops and restaurants, and planners.
- About now says who built the app, with links to his profiles.
- Fly maNOWj: tap to fly through the city towers and collect map pins.
  The sky turns from day to night as the score rises. Medals at 10, 20,
  30 and 50. Five second chances a day: continue from the same score
  after a crash, or restart.
- A small "Fancy a quick game?" card after about a minute of using the
  map, so visitors find out the games exist. At most once a day, three
  times in total, and never again once the games have been opened.
- Sound effects in every game (bat on ball, crowd, flaps, right and
  wrong answers), respecting the sound switch.
- Automatic checks on every pull request and push to main: type check,
  unit tests, colour contrast and build.

### Improved
- Less in the way: the "free to use" notice shows on the first visit
  only, "Join Our Team" moved into the More menu, the status badge
  appears only when something is wrong, and the duplicate 3D chip is
  gone. Coordinates are hidden on phones.
- The homepage title, description and search-result text now describe
  what the app does, and city, comparison and guide pages carry their own
  structured data in the HTML.
- Cricket rebuilt as a TV-style match: camera behind the bowler, a
  stadium with crowd and boards, bowler run-up, swing and spin, a speed
  gun, shot direction and DEFEND / STROKE / LOFT buttons or swipes, an
  aerial view of where the ball goes, a timing meter, umpire signals
  and DRS. Players are drawn as people, not blocks.
- Every page (city maps, comparisons, status, privacy, admin) has its
  own title, description and canonical address in the HTML, so search
  engines and link previews see the right page.
- Usage tracking now covers search, AI questions, area analysis,
  measuring, routes, layers, games, printed reports and feedback. Only
  for visitors who allow analytics; no search text, question or
  location is ever sent.
- Ask maNOWj answers questions about the founder professionally.

### Fixed
- On phones, the compass and fullscreen buttons were half hidden behind
  the search box and too small to tap. They now sit at the bottom right.
- On laptops with the side panel open, the search box covered the zoom
  buttons and the coordinates ran under the map credit.
- Addresses that do not exist now show a "page not found" page with a
  proper 404, instead of the map with a 200 that search engines saw as
  duplicate pages.
- Address search stays within the public geocoder's limit of one
  request per second, so heavy use cannot get the site blocked.

### Removed
- 60 Seconds, Flag Quiz and Impossible or Real.

## v3.2 (6 November 2026)

The first numbered release of maNOWj GeoIntel. It collects the redesign
work of November 2026.

### New
- Live location with a blue dot that follows you, a locate button, and
  near-me chips (petrol, ATM, hospital, food, metro, pharmacy, cafe).
- Mobile bottom sheet layout, built for one-handed use on phones.
- Feature tour that walks through the main tools, available from the
  More menu and the welcome notice.
- "Free to use" notice, including for Apple and Google employees.
- Admin console: overview with ratings and live system health,
  maintenance with a visitor preview and confirmation, feedback and team
  applications with search, filters and CSV export, and an activity log.
- Measurement points can be dragged to adjust a drawn distance or area.

### Improved
- New Aurora violet and teal colours, readable in light and dark mode.
- New logo; tapping the name goes home, tapping the icon opens the
  admin entrance.
- Ask maNOWj answers only what was asked, in a chat style, and falls
  back across several AI models when one is busy.
- Address search falls back to a second geocoder when the first finds
  nothing.
- Nearby search keeps working when map-data servers are slow.
- Link previews on WhatsApp, LinkedIn and X use a new image that stays
  readable as a small thumbnail.

### Fixed
- iPhone location failing indoors or timing out.
- Tour card running off the top of the screen.
- Cricket scoreboard text contrast.
