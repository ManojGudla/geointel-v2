import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBasemapStyle } from "@/features/map/basemaps";
import "./LandingPage.css";

/**
 * The page a stranger lands on.
 *
 * It replaces a version that was, in the owner's own words, "static and
 * simple": a narrow column of white cards on a white page, describing a map
 * product without ever showing a map. Every claim on it was a sentence.
 *
 * The fix is not more sentences. This is a map product, so the hero IS a
 * map — a real MapLibre instance on the same key-free satellite tiles the
 * app itself uses, which you can drag, zoom and fly around before you have
 * clicked anything. The coordinate readout under the headline is wired to
 * that map's actual camera, so the first thing the page proves is that the
 * thing works.
 *
 * The second thing it proves is the part that actually distinguishes this
 * product: every answer carries the source it came from and the date it
 * applies to. So sources are not a logo soup in a trust bar — they are
 * printed, in monospace, next to the specific question each one answers.
 */

type Stop = {
  label: string;
  place: string;
  center: [number, number];
  zoom: number;
  /* Per-stop camera tilt. A single fixed pitch made five very different
     places look like five photographs taken the same way; varying it gives
     each stop its own shot. */
  pitch: number;
  source: string;
};

/* Real places, real coordinates. The pills below fly the hero map to these,
   and each one names a question the app genuinely answers there.

   Typed as a non-empty tuple rather than Stop[]: this project builds with
   noUncheckedIndexedAccess, so a plain array would make TOUR[0] possibly
   undefined and every read of it would need a guard for a case that cannot
   happen. Saying "at least one" in the type says it once. */
const TOUR: [Stop, ...Stop[]] = [
  {
    label: "Hospitals within 2 km",
    place: "Charminar, Hyderabad",
    // Pulled back and shifted onto the Musi so the old city reads as a shape
    // with a river through it, rather than as a field of rooftops.
    center: [78.4736, 17.3688] as [number, number],
    zoom: 13.4,
    pitch: 46,
    source: "OpenStreetMap via Overpass",
  },
  {
    label: "What's at this point?",
    place: "Marina Bay, Singapore",
    center: [103.8578, 1.2845] as [number, number],
    zoom: 14.4,
    pitch: 52,
    source: "Nominatim reverse geocode",
  },
  {
    label: "Air quality right now",
    place: "Lower Manhattan, New York",
    center: [-74.0135, 40.7075] as [number, number],
    zoom: 13.6,
    pitch: 50,
    source: "Open-Meteo, hourly",
  },
  {
    label: "Population + census year",
    place: "Lahore, Pakistan",
    // Moved north onto the Ravi and the fort, the one part of the city with
    // real form to it from above.
    center: [74.3095, 31.5880] as [number, number],
    zoom: 13.2,
    pitch: 44,
    source: "Wikidata, 2023 census",
  },
  {
    label: "Recent earthquakes",
    place: "San Francisco Bay",
    // The bay and the bridges. The most legible piece of geography in the
    // set, and a deliberate change of pace after four dense cities.
    center: [-122.3765, 37.8135] as [number, number],
    zoom: 11.6,
    pitch: 38,
    source: "USGS, last 24 h",
  },
];
/* The attribution table. This is the product's actual dependency list, not a
   marketing trust bar — which is why it says what each one answers and, where
   the source has a cadence, how fresh it is. */
const SOURCES = [
  { name: "OpenStreetMap", answers: "Places, roads, addresses", note: "Community-mapped" },
  { name: "Overpass", answers: "Counting features in a radius", note: "Live query" },
  { name: "Open-Meteo", answers: "Weather and air quality", note: "Hourly" },
  { name: "OSRM", answers: "Routing and directions", note: "On request" },
  { name: "USGS", answers: "Earthquakes", note: "Last 24 hours" },
  { name: "Wikidata", answers: "Population and area", note: "With census year" },
  { name: "Esri", answers: "Satellite imagery", note: "With capture date" },
  { name: "NASA GIBS", answers: "Historical imagery", note: "Back to 2012" },
];

type Ask = {
  q: string;
  /** The headline figure, and what it counts. Shown big in the specimen. */
  value: string;
  unit: string;
  a: string;
  src: string;
  asOf: string;
};

/*
  Six questions, each carrying everything the answer card needs to rebuild
  itself when that question is picked.

  The figures are illustrative and the card says so above them, because a
  page arguing that answers should be checkable cannot print numbers nobody
  can check. What is real, and the reason this section exists, is the pairing:
  each question is answered by the source actually wired up to answer it, with
  that source's actual freshness. Those two rows are the product.
*/
const ASKS: [Ask, ...Ask[]] = [
  {
    q: "How many hospitals are within 5 km?",
    value: "14",
    unit: "found, each pinned on the map",
    a: "A count you can act on, and every one of them placed so you can see how they cluster.",
    src: "OpenStreetMap, queried live via Overpass",
    asOf: "The moment you asked",
  },
  {
    q: "What is actually here?",
    value: "1",
    unit: "building identified",
    a: "The address, what the building is, and what sits immediately around it.",
    src: "Nominatim reverse geocode, plus Overpass",
    asOf: "The moment you asked",
  },
  {
    q: "Is the air safe to run in this morning?",
    value: "42",
    unit: "AQI at this point",
    a: "PM2.5, ozone and the rest, for this exact point and this hour rather than for the city.",
    src: "Open-Meteo air quality",
    asOf: "Updated hourly",
  },
  {
    q: "How many people live in this district?",
    value: "3.4",
    unit: "million residents",
    a: "The figure, and the census it came out of. Never a projection dressed up as a count.",
    src: "Wikidata, sourced from the national census",
    asOf: "Census year shown with the figure",
  },
  {
    q: "What did this block look like in 2014?",
    value: "12",
    unit: "years of imagery available",
    a: "The satellite pass from the year you pick, labelled with the date it was captured.",
    src: "NASA GIBS historical imagery",
    asOf: "Each frame carries its capture date",
  },
  {
    q: "How far is it, and how big is this plot?",
    value: "8,410",
    unit: "square metres enclosed",
    a: "Trace a shape on the map. Distance in metres, area in square metres, computed as you draw.",
    src: "Computed in your browser, nothing sent anywhere",
    asOf: "Instant",
  },
];

/* Who actually opens this. Written as situations rather than as industries,
   because "Enterprise" and "Government" would be a claim about customers
   this product does not have — these are jobs it genuinely does today. */
const USES = [
  {
    icon: "radius",
    t: "Choosing a location",
    d: "Before you sign a lease, count what is actually within walking distance. Pharmacies, schools, transit, the competition. Not what the listing says.",
  },
  {
    icon: "survey",
    t: "Field research",
    d: "Ground-truth a study area before travelling to it: what is built there, how dense it is, what the imagery looked like in previous years.",
  },
  {
    icon: "cite",
    t: "Reporting and fact-checking",
    d: "Test a claim about a place against a source you can name in your copy, with the date the figure belongs to.",
  },
  {
    icon: "radar",
    t: "Situational awareness",
    d: "Live rain radar and the last 24 hours of earthquakes, drawn over any area you care about.",
  },
  {
    icon: "grid",
    t: "Teaching and coursework",
    d: "A GIS sandbox with real data and no licence to buy. Measurement, buffers, imagery and population figures, free for a whole class.",
  },
  {
    icon: "ask",
    t: "Ordinary curiosity",
    d: "Is this a good place for a café? How bad is the air today? What is that building? All of it answers in a few taps.",
  },
];

/* Real questions people ask before trusting a tool like this, answered
   honestly — including the places the answer is "no". */
const FAQ = [
  {
    q: "Is it actually free, or free-for-now?",
    a: "Free. There is no account, no trial clock and no paid tier today. It runs on free public data, which is what makes giving it away sustainable rather than a growth tactic.",
  },
  {
    q: "What do you collect about me?",
    a: "Nothing loads until you answer the banner. Say no and the site behaves exactly the same. No analytics, no error tracking, no third-party tags. You do not have to take that on trust: say no, then watch the network tab.",
  },
  {
    q: "How accurate are the answers?",
    a: "As accurate as the source it came from, which is exactly why the source is printed next to it. OpenStreetMap is mapped by volunteers and it is genuinely uneven between regions: dense in some cities, thin in others. Where a source has no figure, the app says so rather than estimating one.",
  },
  {
    q: "Can I use this for work?",
    a: "Yes. The answers come from open data, so check each source's own licence before you redistribute anything. OpenStreetMap is ODbL, and the imagery carries Esri's and NASA's terms.",
  },
  {
    q: "Why not just use Google Maps?",
    a: "Different job. Google Maps is navigation-first and will not tell you how many clinics sit inside a 2 km circle, or which source and year a population figure came from. This is built for counting, measuring and citing.",
  },
  {
    q: "Does it work offline?",
    a: "No. Every answer is a live query against a live source, which is the trade for never serving you a stale number without saying so.",
  },
];

const STEPS = [
  { n: "01", t: "Drop a point", d: "Search a place, click the map, or use your location. Anywhere on Earth." },
  { n: "02", t: "Set the radius", d: "100 m for a block, 5 km for a neighbourhood. The dashed circle is the search area." },
  { n: "03", t: "Ask", d: "In plain words, or with one tap. Counting, weather, population, routes, imagery." },
  { n: "04", t: "Check the source", d: "Every answer arrives stamped with where it came from and when it applies." },
];

const INSIDE = [
  { icon: "count", t: "Radius search", d: "Count hospitals, schools, ATMs, shops or anything else OSM knows about, inside a circle you set." },
  { icon: "route", t: "Turn-by-turn navigation", d: "Real routing with live position tracking, not a static line on a map." },
  { icon: "blocks", t: "3D buildings", d: "Real footprints extruded to real heights, from OSM height and level tags." },
  { icon: "time", t: "Time travel", d: "Satellite imagery back to 2012, each frame labelled with the date it was taken." },
  { icon: "live", t: "Live layers", d: "Rain radar and earthquake feeds, drawn over the map as they update." },
  { icon: "measure", t: "Measure and draw", d: "Distance between points, area of a shape you trace out." },
  { icon: "report", t: "Area reports", d: "A printable summary of everything found at a location, sources included." },
  { icon: "play", t: "maNOWj Daily", d: "Five satellite views a day. Guess where each one is. Free, no account." },
];

/* Index safely into the tour. Callers pass an index they believe is in
   range; wrapping rather than trusting it means an off-by-one in the
   autoplay timer degrades to "shows the first stop" instead of a crash. */
function stopAt(index: number): Stop {
  return TOUR[((index % TOUR.length) + TOUR.length) % TOUR.length] ?? TOUR[0];
}

/*
  The icon set.

  Inline SVG rather than a font or a sprite: there are fourteen of them, they
  are a few hundred bytes each, and shipping them as markup means no extra
  request and no flash of missing glyphs on a slow connection.

  Drawn in one language on purpose, the same one as the app mark: 24px box,
  1.5 stroke, round caps, no fill, geometry only. They exist to make a grid of
  cards scannable rather than to decorate it, so none of them is a picture of
  its subject. Each one is the shape of what the tool does.
*/
const ICONS: Record<string, JSX.Element> = {
  // A point fixed inside a radius: the app's core gesture.
  radius: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </>
  ),
  // Terrain seen through a frame: surveying an area before visiting it.
  survey: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 15.5 8 11l3.5 3 4-4.5 5 5.5" />
    </>
  ),
  // A document with a line pulled out of it: a claim and its citation.
  cite: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 13h6M9 16.5h4" />
    </>
  ),
  // Concentric arcs radiating from a point: live feeds over an area.
  radar: (
    <>
      <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.2 14.6a5.4 5.4 0 0 1 7.6 0" />
      <path d="M5.4 11.4a9.4 9.4 0 0 1 13.2 0" />
    </>
  ),
  // A grid with a measure across it: the teaching sandbox.
  grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17" />
    </>
  ),
  // A question mark's dot and curve, reduced to strokes.
  ask: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // Pins scattered inside a boundary: counting features in a radius.
  count: (
    <>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 2.5" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // A path with a turn and a heading: routing.
  route: (
    <>
      <path d="M5.5 19c0-5 4-4.5 6.5-4.5S18.5 14 18.5 9" />
      <circle cx="5.5" cy="19" r="1.8" fill="currentColor" stroke="none" />
      <path d="M15.8 11.6 18.5 8.6l2.7 3" />
    </>
  ),
  // Extruded blocks: 3D buildings.
  blocks: (
    <>
      <path d="M4 20V11l4-2.5V20" />
      <path d="M10 20V7l5-3v16" />
      <path d="M17 20V10l3 1.8V20" />
      <path d="M2.5 20h19" />
    </>
  ),
  // A dial turned back: historical imagery.
  time: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.4l3.6 2.1" />
    </>
  ),
  // A raindrop over a pulse: live weather and quake feeds.
  live: (
    <>
      <path d="M12 3.5s5 5.6 5 8.9a5 5 0 0 1-10 0c0-3.3 5-8.9 5-8.9Z" />
      <path d="M8.8 13.6h2l1.2 2.4 1.2-3.4 1 1h1.2" />
    </>
  ),
  // A ruler's edge with ticks: measurement.
  measure: (
    <>
      <path d="M3 14.5 14.5 3l6.5 6.5L9.5 21z" />
      <path d="M7.5 10 9 11.5M10.5 7 12 8.5M13.5 4 15 5.5" />
    </>
  ),
  // A sheet with a chart on it: the printable area report.
  report: (
    <>
      <path d="M5.5 3.5h13v17h-13z" />
      <path d="M9 15.5v-3M12 15.5v-6M15 15.5v-4" />
    </>
  ),
  // A tile with a marker: the daily guessing game.
  play: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M10 8.5l5.5 3.5L10 15.5z" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      className="ln-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

function circle(center: [number, number], radiusMeters: number, points = 72) {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.max(Math.cos(latRad), 1e-6));
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return coords;
}

function formatLat(lat: number) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
}
function formatLng(lng: number) {
  return `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
}

/* The CSS media query at the bottom of LandingPage.css cannot reach a
   MapLibre camera animation, which is JavaScript, not CSS. Someone who has
   asked their OS for reduced motion would otherwise still get a map that
   flies itself around the world every six seconds — the single most motion-
   heavy thing on the page. */
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* This route is indexed under its own title and description (it predates
   this rebuild and already ranks), and a client-rendered route inherits
   whatever index.html set. Restoring them here keeps the browser tab, the
   search listing and any share card describing this page rather than the
   app. Reverted on unmount so navigating back to the map is not left
   wearing the landing page's title. */
/*
   The title carried a dash ("AI Map Search – Ask Questions About Any
   Location"), which is the one piece of punctuation on this page a visitor
   sees before the page even loads, sitting in the browser tab and in the
   search result. Retitled to something a person would write, keeping the
   phrase the URL is built around so the page does not lose what it ranks
   for, and using the space to say what makes it different instead of
   restating the product category.

   Changing a title does move the search listing. Google re-crawls and
   updates it within days, the URL does not change, and nothing that points
   at this page breaks, so this is a safe edit rather than a risky one. */
const PAGE_TITLE = "AI Map Search that shows its sources | maNOWj GeoIntel";
/* Kept under about 155 characters. Google truncates a description roughly
   there, and the previous one ran to 198, so the sentence carrying the whole
   point (that every answer shows its source) was being cut off mid-way in
   the search result. */
const PAGE_DESC =
  "Ask any place on Earth a real question: how many hospitals within 5 km, what is here, what the air is like. Every answer shows its source and date.";

/* Pull in Archivo and JetBrains Mono without putting them on the critical
   path. See the note at the top of LandingPage.css for why this is not an
   @import: a blocked font host must cost this page its typeface, never its
   ability to render. Appended once and left in place — the browser caches
   it, and removing it on unmount would only cause a re-fetch if the visitor
   comes back. */
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";

function useDisplayFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

/* See the .ln-route block at the top of LandingPage.css: the app's reset
   pins html/body/#root to exactly one viewport, which this page has to
   escape in order to scroll at all. */
function useScrollableDocument() {
  useEffect(() => {
    document.documentElement.classList.add("ln-route");
    return () => document.documentElement.classList.remove("ln-route");
  }, []);
}

const PAGE_URL = "https://www.manowj.com/ai-map-search";

/*
  FAQ structured data.

  index.html already carries a WebApplication block describing the app, but
  nothing described this page's FAQ, and six genuine question-and-answer
  pairs are exactly what schema.org/FAQPage is for. Google can surface them
  as expandable questions directly under the search result, which costs
  nothing here because the answers are already written and already visible
  on the page, which is the condition Google sets for using them.

  Built from the same FAQ array the section renders, so the markup cannot
  drift from the visible text. Claiming answers in structured data that a
  visitor cannot find on the page is a manual-action offence, and generating
  both from one source is what makes that impossible rather than unlikely.
*/
function useFaqSchema() {
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.landingFaq = "true";
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}

function useDocumentMeta() {
  useEffect(() => {
    const prevTitle = document.title;

    /* Every tag this route overrides, with the value it had before, so
       navigating away leaves the document describing the app again rather
       than still wearing the landing page's identity. */
    const overrides: Array<[Element | null, string, string]> = [
      [document.querySelector('meta[name="description"]'), "content", PAGE_DESC],
      [document.querySelector('meta[property="og:title"]'), "content", PAGE_TITLE],
      [document.querySelector('meta[property="og:description"]'), "content", PAGE_DESC],
      [document.querySelector('meta[property="og:url"]'), "content", PAGE_URL],
      [document.querySelector('meta[name="twitter:title"]'), "content", PAGE_TITLE],
      [document.querySelector('meta[name="twitter:description"]'), "content", PAGE_DESC],
      /* The one that actually matters. index.html hard-codes
         rel=canonical to the homepage, which is correct for the app and
         wrong for every other path: left alone it tells Google this page
         is a duplicate of "/", which is grounds for dropping it from the
         index entirely. This route has its own URL and has to say so. */
      [document.querySelector('link[rel="canonical"]'), "href", PAGE_URL],
    ];

    const restore = overrides.map(([el, attr, next]) => {
      const prev = el?.getAttribute(attr) ?? null;
      el?.setAttribute(attr, next);
      return () => {
        if (prev !== null) el?.setAttribute(attr, prev);
      };
    });

    document.title = PAGE_TITLE;

    return () => {
      document.title = prevTitle;
      restore.forEach((fn) => fn());
    };
  }, []);
}

export function LandingPage() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [active, setActive] = useState(0);
  /* What the readout is allowed to NAME, as opposed to what the pills show
     as selected. A flyTo across continents takes seconds, and naming the
     destination while the coordinates above it are still over the departure
     point makes the instrument contradict itself — the one impression this
     page cannot afford. The pill highlights immediately (it is a selection);
     the label waits for the camera to actually arrive. */
  const [settled, setSettled] = useState(0);
  const [readout, setReadout] = useState(() => ({
    lat: TOUR[0].center[1],
    lng: TOUR[0].center[0],
    zoom: TOUR[0].zoom,
  }));
  const [mapReady, setMapReady] = useState(false);

  /* Which question the answer card downstream is currently answering. */
  const [askIndex, setAskIndex] = useState(0);
  const ask = ASKS[askIndex] ?? ASKS[0];

  useScrollableDocument();
  useDisplayFonts();
  useDocumentMeta();
  useFaqSchema();

  /* The bar starts transparent over the map — putting a solid strip across
     a satellite photograph would waste the one thing the hero is for — and
     earns a background only once the map has scrolled away behind it. */
  const [barSolid, setBarSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setBarSolid(window.scrollY > 90);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Fly to one of the tour stops and redraw the radius ring around it. Kept
     out of the effect below so a pill click and the autoplay timer share
     exactly one code path. */
  const goTo = useCallback((index: number) => {
    const map = mapRef.current;
    const stop = stopAt(index);
    setActive(index);
    if (!map) return;
    if (prefersReducedMotion()) {
      map.jumpTo({ center: stop.center, zoom: stop.zoom, pitch: stop.pitch });
      setSettled(index);
    } else {
      map.flyTo({
        center: stop.center,
        zoom: stop.zoom,
        pitch: stop.pitch,
        speed: 0.7,
        curve: 1.4,
        essential: true,
      });
      map.once("moveend", () => setSettled(index));
    }
    const src = map.getSource("landing-ring") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circle(stop.center, 900)] },
      properties: {},
    });
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      style: buildBasemapStyle("satellite"),
      center: TOUR[0].center,
      zoom: TOUR[0].zoom - 1.6,
      pitch: TOUR[0].pitch - 8,
      bearing: -14,
      attributionControl: false,
      /* A hero is scrolled past, not navigated. Trapping the wheel here would
         mean the page stops scrolling the moment the pointer crosses the map,
         which is the single most irritating thing a full-bleed map hero can
         do. Drag, double-click zoom and the pills all still work. */
      scrollZoom: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("landing-ring", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [circle(TOUR[0].center, 900)] },
          properties: {},
        },
      });
      /*
        The radius ring, drawn as three layers rather than one.

        It is the single most recognisable thing the app does, and as one
        1.5px dashed line at 85% opacity over satellite imagery it was
        effectively invisible: dashes that thin disappear into roof texture.
        A soft wide halo underneath lifts it off whatever is below, a solid
        casing gives it an edge that survives busy ground, and the dashed
        line on top keeps it reading as a drawn search area rather than as
        something that is really there on the ground.
      */
      map.addLayer({
        id: "landing-ring-fill",
        type: "fill",
        source: "landing-ring",
        paint: { "fill-color": "#ff8d3a", "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: "landing-ring-halo",
        type: "line",
        source: "landing-ring",
        paint: { "line-color": "#ff8d3a", "line-width": 9, "line-opacity": 0.16, "line-blur": 5 },
      });
      map.addLayer({
        id: "landing-ring-casing",
        type: "line",
        source: "landing-ring",
        paint: { "line-color": "#1a0d02", "line-width": 4.5, "line-opacity": 0.45 },
      });
      map.addLayer({
        id: "landing-ring-line",
        type: "line",
        source: "landing-ring",
        paint: {
          "line-color": "#ffa055",
          "line-width": 2.4,
          "line-dasharray": [2.4, 1.8],
          "line-opacity": 1,
        },
      });
      setMapReady(true);
      /* Settle into the first stop rather than snapping — the page should
         look like an instrument warming up, not a screenshot. */
      if (prefersReducedMotion()) {
        map.jumpTo({ zoom: TOUR[0].zoom, pitch: TOUR[0].pitch, bearing: 0 });
      } else {
        map.easeTo({ zoom: TOUR[0].zoom, pitch: TOUR[0].pitch, bearing: 0, duration: 2600 });
      }
    });

    const sync = () => {
      const c = map.getCenter();
      setReadout({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    map.on("move", sync);

    /*
      Keep the canvas the same size as the box it lives in.

      Measured on the built site: this canvas was 400x300, MapLibre's
      hard-coded default, inside a hero 902px tall. MapLibre reads the
      container's size once, at construction, and this effect runs before
      the browser has finished laying the hero out, so it measured nothing
      and fell back to the default. Nothing ever told it otherwise, because
      MapLibre only listens to window resize, and the hero's height comes
      from its content rather than from the viewport.

      The result is a hero that advertises "Live satellite map. Drag it."
      above a near-empty rectangle: the page that carries every launch link
      failing at the one thing it promises, in the first second.

      A ResizeObserver rather than a one-off resize() because the box keeps
      changing after this runs: a web font swapping in reflows the column
      beside it, and an orientation change on a phone redraws the lot.
    */
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapNode.current);
    // One immediate call for the common case where layout is already done
    // by the time this effect runs and the observer has nothing to report.
    map.resize();

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Autoplay the tour, but stop the moment someone takes over — either by
     clicking a pill or by dragging the map themselves. Continuing to yank
     the camera away from a person who is using it would be hostile. */
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion());
  /* Whether this tab is actually on screen. A tour that keeps flying in a
     backgrounded tab is invisible by definition and still costs the visitor
     a fresh set of satellite tiles every few seconds, which on a phone is
     their mobile data and their battery paying for something nobody is
     looking at. Someone who opens the site and leaves the tab open all day
     should not be billed for it. */
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!autoplay || !mapReady || !visible) return;
    const map = mapRef.current;
    const stop = () => setAutoplay(false);
    map?.on("dragstart", stop);
    const id = window.setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % TOUR.length;
        goTo(next);
        return next;
      });
    }, 6500);
    return () => {
      window.clearInterval(id);
      map?.off("dragstart", stop);
    };
  }, [autoplay, mapReady, visible, goTo]);

  const onPill = (i: number) => {
    setAutoplay(false);
    goTo(i);
  };

  return (
    <div className="ln">
      <header className={`ln-bar${barSolid ? " is-solid" : ""}`}>
        <div className="ln-bar__inner">
          <a className="ln-bar__brand" href="/">
            <img src="/logo-mark.png" alt="" width={28} height={28} />
            <span>
              maNOWj<span className="ln-bar__brand-dim"> GeoIntel</span>
            </span>
          </a>
          <nav className="ln-bar__nav">
            <a href="#ask">What it answers</a>
            <a href="#sources">Sources</a>
            <a href="#uses">Use cases</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="ln-bar__cta" href="/">
            Open the map
          </a>
        </div>
      </header>

      <section className="ln-hero">
        <div className="ln-hero__map" ref={mapNode} aria-hidden="true" />
        <div className="ln-hero__scrim" aria-hidden="true" />

        <div className="ln-hero__inner">
          <div className="ln-hero__panel">
            <p className="ln-eyebrow">
              <span className="ln-dot" aria-hidden="true" />
              Live satellite map. Drag it.
            </p>

            <h1 className="ln-h1">
              A map that cites
              <br />
              its sources.
            </h1>

            <p className="ln-sub">
              Pick a place anywhere on Earth and ask it a real question. How many hospitals sit within five
              kilometres. What this building is. Whether the air is clean this morning. Every answer comes back
              with the source it came from and the date it applies to. If a source has no figure, the app says
              so rather than guessing one.
            </p>

            <div className="ln-cta-row">
              <a className="ln-btn ln-btn--primary" href="/">
                Open the map
                <span aria-hidden="true">→</span>
              </a>
              <a className="ln-btn ln-btn--ghost" href="#ask">
                See what it answers
              </a>
            </div>

            <p className="ln-note">Free. No sign-up. No tracking unless you say yes.</p>

            <div className="ln-readout" role="status" aria-live="off">
              <div className="ln-readout__row">
                <span className="ln-readout__k">LAT</span>
                <span className="ln-readout__v">{formatLat(readout.lat)}</span>
                <span className="ln-readout__k">LON</span>
                <span className="ln-readout__v">{formatLng(readout.lng)}</span>
                <span className="ln-readout__k">Z</span>
                <span className="ln-readout__v">{readout.zoom.toFixed(1)}</span>
              </div>
              {/* Arrived: name the place and the source that answers for it.
                  Mid-flight: say where it is going, because the coordinates
                  above are somewhere over an ocean and naming either end
                  would contradict them. */}
              <div className="ln-readout__place">
                {active === settled ? (
                  <>
                    {stopAt(settled).place}
                    <span className="ln-readout__src">{stopAt(settled).source}</span>
                  </>
                ) : (
                  <span className="ln-readout__transit">Flying to {stopAt(active).place}</span>
                )}
              </div>
            </div>
          </div>

          <div className="ln-pills" role="list">
            {TOUR.map((t, i) => (
              <button
                key={t.label}
                type="button"
                role="listitem"
                className={`ln-pill${i === active ? " is-active" : ""}`}
                onClick={() => onPill(i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* The claim the whole product rests on, stated once, plainly. */}
      <section className="ln-thesis" id="sources">
        <div className="ln-wrap">
          <div className="ln-thesis__head">
            <h2 className="ln-h2">
              Most map answers are a number with no provenance. These come with a receipt.
            </h2>
            <p className="ln-lede">
              Eight real sources sit behind the app. None of them is here as branding. Each one answers a
              specific question, and the app tells you which one answered yours.
            </p>
          </div>

          <ul className="ln-sources">
            {SOURCES.map((s) => (
              <li key={s.name} className="ln-source">
                <span className="ln-source__name">{s.name}</span>
                <span className="ln-source__answers">{s.answers}</span>
                <span className="ln-source__note">{s.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/*
        The questions and the answer anatomy, merged into one live thing.

        They used to be two sections stacked on top of each other: a flat grid
        of six question cards, then a static specimen card explaining that
        answers carry a source and a date. Both were telling. Neither let you
        do anything, and together they were two of the five consecutive
        card-grid sections that made the page read as a wall of text.

        Now picking a question rebuilds the answer beside it. The claim the
        page rests on is that the source and the date travel with every
        answer, and clicking through six very different questions and watching
        those two rows change to match is the shortest way to see that it is
        true rather than be told.
      */}
      <section className="ln-ask" id="ask">
        <div className="ln-wrap">
          <p className="ln-kicker">What you can actually ask</p>
          <h2 className="ln-h2 ln-h2--wide">Pick a question. Watch the answer build.</h2>

          <div className="ln-demo">
            <ul className="ln-qlist">
              {ASKS.map((a, i) => (
                <li key={a.q}>
                  <button
                    type="button"
                    className={`ln-q${i === askIndex ? " is-active" : ""}`}
                    onClick={() => setAskIndex(i)}
                    aria-pressed={i === askIndex}
                  >
                    <span className="ln-q__text">{a.q}</span>
                    <span className="ln-q__arrow" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {/* keyed on the question so the card genuinely remounts and the
                entry animation replays on every pick, rather than the numbers
                silently swapping in place where the change is easy to miss */}
            <figure className="ln-specimen" key={ask.q}>
              <figcaption className="ln-specimen__cap">
                Example figures. The source and date rows are the real thing.
              </figcaption>

              <div className="ln-specimen__row">
                <span className="ln-specimen__tag">Question</span>
                <p className="ln-specimen__q">{ask.q}</p>
              </div>

              <div className="ln-specimen__row">
                <span className="ln-specimen__tag">Result</span>
                <p className="ln-specimen__result">
                  <strong>{ask.value}</strong> {ask.unit}
                </p>
              </div>

              <div className="ln-specimen__row ln-specimen__row--lit">
                <span className="ln-specimen__tag ln-specimen__tag--lit">Source</span>
                <p className="ln-specimen__meta">{ask.src}</p>
              </div>

              <div className="ln-specimen__row ln-specimen__row--lit">
                <span className="ln-specimen__tag ln-specimen__tag--lit">As of</span>
                <p className="ln-specimen__meta">{ask.asOf}</p>
              </div>

              <p className="ln-specimen__note">{ask.a}</p>
            </figure>
          </div>

          <p className="ln-ask__why">
            A number on its own cannot be checked, argued with, or quoted in anything serious. That is what
            most map tools hand you, and what any chatbot will tell you about a place: a confident figure with
            no way back to where it came from. A population count from a 2011 census and one from 2023 are
            different facts wearing the same number, so here the year is part of the answer rather than a
            footnote. When a source has nothing to say, the app tells you that too.
          </p>
        </div>
      </section>

      {/*
        A band of true figures, and the only place on the page that leads with
        numbers. It sits here because it breaks up a run of prose sections,
        and every figure in it is checkable from the rest of the page: eight
        sources are named in the table above, the imagery year and the price
        are stated in the FAQ.
      */}
      <section className="ln-figures">
        <div className="ln-wrap ln-figures__row">
          <div className="ln-fig">
            <span className="ln-fig__n">8</span>
            <span className="ln-fig__l">open data sources, all named</span>
          </div>
          <div className="ln-fig">
            <span className="ln-fig__n">2012</span>
            <span className="ln-fig__l">earliest satellite imagery</span>
          </div>
          <div className="ln-fig">
            <span className="ln-fig__n">0</span>
            <span className="ln-fig__l">accounts, trials or card details</span>
          </div>
          <div className="ln-fig">
            <span className="ln-fig__n">100%</span>
            <span className="ln-fig__l">of answers carry their source</span>
          </div>
        </div>
      </section>

      {/* Laid out as a horizontal traverse rather than four cards. The
          numbers are real sequence information, since you cannot check a
          source before you have an answer, so a line runs through them and
          the markers sit on it. */}
      <section className="ln-steps">
        <div className="ln-wrap">
          <p className="ln-kicker">How it works</p>
          <h2 className="ln-h2 ln-h2--wide">Four moves, start to answer.</h2>
          <ol className="ln-steplist">
            {STEPS.map((s) => (
              <li key={s.n} className="ln-step">
                <span className="ln-step__marker" aria-hidden="true" />
                <span className="ln-step__n">{s.n}</span>
                <h3 className="ln-step__t">{s.t}</h3>
                <p className="ln-step__d">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ln-uses" id="uses">
        <div className="ln-wrap">
          <p className="ln-kicker">Who opens this</p>
          <h2 className="ln-h2 ln-h2--wide">Six jobs it already does.</h2>
          <div className="ln-usegrid">
            {USES.map((u) => (
              <article key={u.t} className="ln-use">
                <span className="ln-use__icon">
                  <Icon name={u.icon} />
                </span>
                <h3 className="ln-use__t">{u.t}</h3>
                <p className="ln-use__d">{u.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ln-inside" id="inside">
        <div className="ln-wrap">
          <p className="ln-kicker">What's inside</p>
          <h2 className="ln-h2 ln-h2--wide">More than a basemap with pins on it.</h2>
          <div className="ln-grid">
            {INSIDE.map((f) => (
              <article key={f.t} className="ln-feat">
                <span className="ln-feat__icon">
                  <Icon name={f.icon} />
                </span>
                <div>
                  <h3 className="ln-feat__t">{f.t}</h3>
                  <p className="ln-feat__d">{f.d}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Native <details> rather than a JS accordion: it is keyboard
          accessible and findable by the browser's own in-page search for
          free, and the answers stay in the DOM for a crawler to read. */}
      <section className="ln-faq" id="faq">
        <div className="ln-wrap">
          <p className="ln-kicker">Straight answers</p>
          <h2 className="ln-h2 ln-h2--wide">The questions worth asking before you trust it.</h2>
          <div className="ln-faqlist">
            {FAQ.map((f) => (
              <details key={f.q} className="ln-faqitem">
                <summary className="ln-faqitem__q">
                  {f.q}
                  <span className="ln-faqitem__mark" aria-hidden="true" />
                </summary>
                <p className="ln-faqitem__a">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ln-maker">
        <div className="ln-wrap ln-maker__inner">
          {/* Deep below the fold, so it waits rather than competing with the
              hero map for the first connections. */}
          <img
            className="ln-maker__photo"
            src="/about/creator.jpg"
            alt="Manoj Kumar Gudla, who designed and built maNOWj GeoIntel"
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
          />
          <div>
            <p className="ln-kicker">Who built it</p>
            <h2 className="ln-h2">Manoj Kumar Gudla</h2>
            <p className="ln-lede ln-maker__copy">
              maNOWj GeoIntel is designed and built by one person. It runs on free, open data, which is part of
              why it can be given away without a catch. There is no paid feed behind it, so there is nothing
              pushing an answer to look better than it is. If something in here is wrong, it is wrong in public,
              with the source sitting right next to it so you can go and check.
            </p>
          </div>
        </div>
      </section>

      <section className="ln-final">
        <div className="ln-wrap ln-final__inner">
          <h2 className="ln-h2 ln-final__h">Pick a place. Ask a question.</h2>
          <p className="ln-lede">It opens straight into the map. Nothing to sign, nothing to install.</p>
          <a className="ln-btn ln-btn--primary ln-btn--lg" href="/">
            Open the map
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      {/*
        Every link here goes somewhere real.

        The source columns are the obvious thing to put in this product's
        footer: a site whose whole argument is that answers name their
        sources should let you go and read those sources. They double as the
        attribution these licences require, in a place people can actually
        find, rather than buried in a tooltip on the map.
      */}
      <footer className="ln-foot">
        <div className="ln-wrap">
          <div className="ln-foot__top">
            <div className="ln-foot__brandcol">
              <a className="ln-foot__brand" href="/">
                <img src="/logo-mark.png" alt="" width={34} height={34} />
                <span>maNOWj GeoIntel</span>
              </a>
              <p className="ln-foot__blurb">
                A map that answers questions about a place, and tells you where every answer came from. Free,
                no sign-up, built by one person.
              </p>
              <a
                className="ln-foot__gh"
                href="https://github.com/ManojGudla"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>

            <nav className="ln-foot__cols" aria-label="Footer">
              <div className="ln-foot__col">
                <h3 className="ln-foot__h">The app</h3>
                <a href="/">Open the map</a>
                <a href="/ai-map-search">What it does</a>
                <a href="/status">System status</a>
                <a href="/privacy">Privacy and security</a>
              </div>

              <div className="ln-foot__col">
                <h3 className="ln-foot__h">Map data</h3>
                <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">
                  OpenStreetMap
                </a>
                <a href="https://overpass-api.de/" target="_blank" rel="noopener noreferrer">
                  Overpass API
                </a>
                <a href="https://nominatim.org/" target="_blank" rel="noopener noreferrer">
                  Nominatim
                </a>
                <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">
                  OSRM routing
                </a>
              </div>

              <div className="ln-foot__col">
                <h3 className="ln-foot__h">Live data</h3>
                <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                  Open-Meteo
                </a>
                <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener noreferrer">
                  USGS earthquakes
                </a>
                <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">
                  RainViewer radar
                </a>
                <a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">
                  Wikidata
                </a>
              </div>

              <div className="ln-foot__col">
                <h3 className="ln-foot__h">Imagery</h3>
                <a
                  href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Esri World Imagery
                </a>
                <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">
                  NASA GIBS
                </a>
                <a href="https://opentopomap.org/" target="_blank" rel="noopener noreferrer">
                  OpenTopoMap
                </a>
              </div>

              <div className="ln-foot__col">
                <h3 className="ln-foot__h">For machines</h3>
                <a href="/llms.txt">llms.txt</a>
                <a href="/sitemap.xml">sitemap.xml</a>
                <a href="/robots.txt">robots.txt</a>
              </div>
            </nav>
          </div>

          <div className="ln-foot__bottom">
            <span>© {new Date().getFullYear()} maNOWj GeoIntel. Built by Manoj Kumar Gudla.</span>
            <span className="ln-foot__attr">
              Imagery © Esri, Maxar, Earthstar Geographics · Map data © OpenStreetMap contributors, ODbL
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
