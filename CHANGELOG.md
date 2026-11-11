# Changelog

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
