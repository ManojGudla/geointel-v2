# GIS and data accuracy report

25 November 2026. Statuses as in MASTER_AUDIT_REPORT.md. A passing test suite
does not prove that outside data is right: every item says what still needs a
check against the real provider.

## A-01 Population density used areas in the wrong unit

- **Root cause:** `api/_routes/population.ts` read Wikidata's area (P2046)
  with `wdt:`, which returns the number without its unit. Areas recorded in
  square metres, hectares, square miles or acres were divided as if they were
  km², so density could be off by a factor of up to a million. A failed or
  rejected Wikidata query also came back as an empty result, shown as "no
  population data" rather than as an outage.
- **Fix:** the query now reads the full statement (`psv:P2046` with
  `wikibase:quantityUnit`) and its rank. `areaToKm2` converts km², m², ha,
  mi², acres and ft²; an unknown unit gives no density rather than a wrong
  one. Preferred-rank and the latest dated population win. A density above
  150,000 per km² is withheld as implausible. If the detailed query is
  rejected, a simpler one returns population without density. When every
  source fails, the API answers `502 PROVIDER_UNAVAILABLE`.
- **Tests:** `tests/unit/population.test.ts` (22 tests, mocked Wikidata, so
  labelled mock tests): unit conversion, rank and date choice, the
  implausible-density guard, the fallback query, and the outage response.
- **Status:** FIXED, TESTED. Real figures: NEEDS EXTERNAL ACCESS (Wikidata
  was unreachable from this sandbox).

**Manual check.** Paste this into https://query.wikidata.org and compare with
the app for Hyderabad, Chennai and Bengaluru. The app's density should equal
population divided by the area converted to km².

```sparql
SELECT ?city ?cityLabel ?population ?populationDate ?area ?unit ?unitLabel WHERE {
  VALUES ?city { wd:Q1361 wd:Q1352 wd:Q1355 }
  OPTIONAL {
    ?city p:P1082 ?popStatement .
    ?popStatement ps:P1082 ?population ; wikibase:rank ?popRank .
    FILTER(?popRank != wikibase:DeprecatedRank)
    OPTIONAL { ?popStatement pq:P585 ?populationDate . }
  }
  OPTIONAL {
    ?city p:P2046 ?areaStatement .
    ?areaStatement psv:P2046 ?areaValue ; wikibase:rank ?areaRank .
    FILTER(?areaRank != wikibase:DeprecatedRank)
    ?areaValue wikibase:quantityAmount ?area ; wikibase:quantityUnit ?unit .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY ?cityLabel DESC(?populationDate)
```

## A-02 Coordinates off the globe reached the providers

- **Root cause:** `gis`, `reverse-geocode`, `weather`, `live` (air quality)
  and `route` checked only `Number.isFinite`, so `?lat=500` went on to
  Overpass, Nominatim, Open-Meteo or the routing server. Their refusal came
  back as "the service is unavailable" and spent a rate-limited request. In
  every route a blank value passed too, because `Number("")` is 0: `?lat=&lon=`
  analysed the point 0,0 in the Gulf of Guinea.
- **Fix:** `getNumberParam` (blank means missing) and `readLatLon` (missing
  or out of range) in `api/_lib/http.ts`, used by all 11 routes that read
  coordinates. A building box past a pole is refused. In search, a blank bias
  point means no bias. Existing error messages are unchanged.
- **Tests:** `tests/unit/coordinateValidation.test.ts`. 19 cases failed
  before the fix; all 33 pass after, and each checks that no provider was
  called.
- **Status:** FIXED, TESTED.

## A-03 Clicks on a repeated copy of the world

- **Root cause:** the map repeats the world side by side. A click on a copy
  reports an unwrapped longitude (New York on the copy to the east is 286),
  and the app passed it on unchanged.
- **Fix:** `wrapLongitude` in `src/features/map/geo.ts`, applied where a map
  click selects a place. The API stays strict: longitudes outside -180 to 180
  are refused.
- **Status:** FIXED, TESTED (unit). NEEDS MANUAL VALIDATION: zoom out, pan
  across 180°, tap a place, and check the coordinates and the panels.

## Fixed earlier in v3.4

From BUG_REPORT_2026-11-25.md, all FIXED and TESTED:

- C1: an Esri outage was cached for weeks as "no capture date published".
- C2: an area outline that crossed itself showed a wrong, too-small area.
- H1: any failed imagery-date check claimed Esri publishes no date.
- H2: missing weather readings showed as 0°C or NaN.
- H3: Overpass answers cut short were counted as complete; they are now
  flagged, shown with a caveat and not cached.
- M6: forecast days were labelled a day early in the Americas.

## Limits stated in the app (checked, unchanged)

- NASA GIBS imagery is 250 m per pixel and about three days behind; the app
  says so and clamps the date.
- Esri Wayback dates are when a version was published, not when the photo
  was taken; they are labelled that way.
- OpenStreetMap is volunteer data, so a count of zero can mean "not mapped".
  How to show zero at the default 250 m radius (M4) is still the owner's call.

## Not checked yet

- Classification thresholds for property types against known places.
- Distance and area results against a second tool (for example QGIS) for a
  few real places.
- Officials data from Wikidata against official government sources.
