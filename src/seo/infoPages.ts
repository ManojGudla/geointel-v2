/**
 * The written pages: the area report, the tool pages and the pages for
 * particular jobs (real estate, retail, planning).
 *
 * ONE source for two consumers, the same arrangement as routeMeta.ts: the
 * React page (features/info/InfoPage.tsx) and the build step that writes each
 * page's static HTML both read this file, so what a crawler sees and what a
 * visitor sees cannot drift apart.
 *
 * The editorial rule from public/sitemap.xml applies here too. Every page is
 * about one real job the app already does, says how to do it, links straight
 * into the app at a real place so the claim can be checked in one tap, and
 * says plainly what the data cannot tell you. No page is a city name swapped
 * into a template. If a feature is not built, it is not written about.
 *
 * Only relative imports: the build step loads this from vite.config.ts.
 */

export interface InfoSection {
  heading: string;
  paragraphs?: string[];
  /** Numbered: things done in order. */
  steps?: string[];
  /** Unordered: parallel facts. */
  bullets?: string[];
}

export interface InfoPage {
  path: string;
  group: "Report" | "Tools" | "Solutions";
  /** Short name for navigation and "related" links. */
  nav: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** Opens the app at a real place with this page's feature already running. */
  examples: Array<{ label: string; href: string }>;
  sections: InfoSection[];
  /** What this cannot tell you. Every page has one; it is why the rest can be trusted. */
  limits: string[];
  related: string[];
}

/** A link into the app. `q` is a map command the app runs on arrival (see useSharedLocationFromUrl). */
function open(lat: number, lon: number, zoom: number, rest: string): string {
  return `/?lat=${lat}&lon=${lon}&z=${zoom}&${rest}`;
}

const GACHIBOWLI = { lat: 17.4401, lon: 78.3489 };
const KORAMANGALA = { lat: 12.9352, lon: 77.6245 };
const ANDHERI_WEST = { lat: 19.1364, lon: 72.8296 };
const HITEC_CITY = { lat: 17.4474, lon: 78.3762 };
const INDIRANAGAR = { lat: 12.9719, lon: 77.6412 };
const HUSSAIN_SAGAR = { lat: 17.4239, lon: 78.4738 };

const SOURCES_LINE =
  "Places come from OpenStreetMap, population from Wikidata with its census year, weather and air quality from Open-Meteo, and satellite imagery from Esri and NASA. Each figure in the app shows which one it came from.";

export const INFO_PAGES: InfoPage[] = [
  {
    path: "/area-report",
    group: "Report",
    nav: "Area report",
    title: "Free Area Report for Any Address in India | maNOWj",
    description:
      "Hospitals, schools, transit and daily needs around any address, with distances and sources. Print it or save it as a PDF. Free, no sign-up.",
    h1: "Free area report for any address",
    lead: "Pick an address and get a short report on what is around it: hospitals, schools, public transport, shops and more, each with a distance and the source it came from. It prints on paper or saves as a PDF.",
    examples: [
      { label: "Gachibowli, Hyderabad", href: open(GACHIBOWLI.lat, GACHIBOWLI.lon, 15, "r=1000&s=place&t=evidence") },
      { label: "Koramangala, Bengaluru", href: open(KORAMANGALA.lat, KORAMANGALA.lon, 15, "r=1000&s=place&t=evidence") },
      { label: "Andheri West, Mumbai", href: open(ANDHERI_WEST.lat, ANDHERI_WEST.lon, 15, "r=1000&s=place&t=evidence") },
    ],
    sections: [
      {
        heading: "How to get a report",
        steps: [
          "Search for an address, a locality or a landmark, or tap any point on the map.",
          "Choose how far to look, from 100 m to 5 km. The default is 250 m; 1 km is a good choice for a neighbourhood.",
          "Press Report under the search box.",
          "Press Print / Save as PDF. Your browser's print window can save it as a file.",
        ],
      },
      {
        heading: "What the report contains",
        bullets: [
          "The address and its coordinates.",
          "Counts of mapped places within your chosen distance, such as hospitals, schools, shops, banks, parks and public transport stops.",
          "What kind of area it is, judged from the mapped buildings and land use around the point.",
          "Any analysis you ran, for example the nearest hospital or every school within 2 km.",
          "Current weather and air quality.",
          "The source and date of every figure.",
        ],
      },
      {
        heading: "Who uses it",
        paragraphs: [
          "People comparing flats before renting or buying, agents adding a 'what is nearby' page to a listing, and small business owners checking a street before signing a lease. The report takes about a minute and costs nothing.",
        ],
      },
      { heading: "Where the data comes from", paragraphs: [SOURCES_LINE] },
    ],
    limits: [
      "It does not include property prices, rents, crime figures or the legal status of a property. Check RERA and the local land records for those.",
      "OpenStreetMap is built by volunteers. Coverage is very good in large cities and thinner in small towns, so a low count can mean 'not mapped yet' as well as 'not there'.",
    ],
    related: ["/tools/radius-search", "/solutions/real-estate", "/tools/measure-area"],
  },
  {
    path: "/tools/radius-search",
    group: "Tools",
    nav: "Radius search",
    title: "Radius Search: Count Places Within a Distance | maNOWj",
    description:
      "Count hospitals, schools, shops, ATMs or transit stops within any distance of any point, from 100 m to 5 km. Free map tool with CSV and GeoJSON download.",
    h1: "Count places within a radius of any point",
    lead: "Choose a point and a distance, and see how many hospitals, schools, shops, ATMs or transit stops fall inside the circle, listed nearest first. Download the list as CSV or GeoJSON.",
    examples: [
      { label: "Hospitals within 5 km of HITEC City", href: open(HITEC_CITY.lat, HITEC_CITY.lon, 13, "q=hospitals+within+5+km") },
      { label: "Schools within 2 km of Koramangala", href: open(KORAMANGALA.lat, KORAMANGALA.lon, 14, "q=schools+within+2+km") },
      { label: "Everything within 800 m of Andheri West", href: open(ANDHERI_WEST.lat, ANDHERI_WEST.lon, 15, "q=what+is+within+800+m") },
    ],
    sections: [
      {
        heading: "How to use it",
        steps: [
          "Search for a place or tap the map to choose the centre point.",
          "Type a question in the search box in plain words, such as 'hospitals within 2 km' or 'schools within 1 km', or open Analyse and pick a category and a distance.",
          "Read the count and the list. Each place shows its straight-line distance from your point, and the circle is drawn on the map.",
          "Press CSV or GeoJSON under the list to download every place that was found.",
        ],
      },
      {
        heading: "What you can count",
        paragraphs: [
          "Hospitals and clinics, schools, pharmacies, police stations, banks, ATMs, fuel stations, restaurants, cafés, hotels, shops, parks and public transport stops.",
        ],
      },
      {
        heading: "Using the download",
        bullets: [
          "CSV opens in Excel or Google Sheets, with a name, category, latitude, longitude and distance in metres for each place.",
          "GeoJSON opens in QGIS, ArcGIS, geojson.io or your own code, as a set of points.",
          "Both files carry the OpenStreetMap credit, which its licence asks you to keep when you reuse the data.",
        ],
      },
      { heading: "Where the data comes from", paragraphs: [SOURCES_LINE] },
    ],
    limits: [
      "Distances are straight lines from your point, not walking or driving distances. Use Directions for a route.",
      "The largest radius is 5 km.",
      "Counts are of places mapped in OpenStreetMap. In areas with thin coverage the real number can be higher.",
    ],
    related: ["/area-report", "/solutions/retail-site-selection", "/tools/measure-area"],
  },
  {
    path: "/tools/measure-area",
    group: "Tools",
    nav: "Measure distance and area",
    title: "Measure Distance and Area on a Map, Free | maNOWj",
    description:
      "Draw on the map to measure a distance or the area of a plot, on street or satellite view. Drag any point to adjust. Free, no sign-up, works on phones.",
    h1: "Measure a distance or an area on the map",
    lead: "Tap points on the map to measure how far apart two places are, or draw around a plot, a lake or a campus to get its area. It works on the satellite view, so you can trace what you can see.",
    examples: [
      { label: "Open the measuring tools in Hyderabad", href: open(17.385, 78.4867, 15, "s=tools") },
      { label: "Measure on satellite view at Hussain Sagar", href: open(HUSSAIN_SAGAR.lat, HUSSAIN_SAGAR.lon, 14, "map=satellite&s=tools") },
    ],
    sections: [
      {
        heading: "How to measure",
        steps: [
          "Press Measure under the search box.",
          "Choose distance or area.",
          "Tap the map to add points. For an area, tap around the edge of the shape.",
          "Read the running total as you go. Drag any point to correct it.",
        ],
      },
      {
        heading: "Tips for a better measurement",
        bullets: [
          "Switch to Satellite in the bottom corner to trace real boundaries such as walls, fields and water.",
          "Zoom in before placing points. A point placed at city zoom can be tens of metres off.",
          "Add more points along curves. Straight lines between a few points cut the corners.",
        ],
      },
    ],
    limits: [
      "This is a map measurement, not a land survey. Satellite images can be offset by a few metres, so do not use the result for legal boundaries or registration.",
      "Measurements are along the ground as seen from above and do not account for slopes.",
    ],
    related: ["/tools/satellite-history", "/tools/radius-search", "/area-report"],
  },
  {
    path: "/tools/satellite-history",
    group: "Tools",
    nav: "Satellite imagery by year",
    title: "Satellite Imagery by Year, with Capture Dates | maNOWj",
    description:
      "See any place from above, check when the image was taken, and look back through NASA imagery to 2012 to watch lakes, green cover and cities change.",
    h1: "See any place by satellite, and how it has changed",
    lead: "Switch any location to satellite view and see when the image was captured. Then step back through NASA's imagery to 2012 to watch lakes, coastlines, green cover and the edge of a city change.",
    examples: [
      { label: "Hussain Sagar, Hyderabad, on satellite", href: open(HUSSAIN_SAGAR.lat, HUSSAIN_SAGAR.lon, 14, "map=satellite&s=layers") },
      { label: "HITEC City, Hyderabad, on satellite", href: open(HITEC_CITY.lat, HITEC_CITY.lon, 15, "map=satellite&s=layers") },
    ],
    sections: [
      {
        heading: "How to use it",
        steps: [
          "Search for a place or move the map to it.",
          "Press Satellite in the bottom corner of the map.",
          "The capture date of the image appears with the map controls, wherever the imagery provider publishes one.",
          "To look back in time, open Layers, turn on Time travel and move the slider.",
        ],
      },
      {
        heading: "Why the date matters",
        paragraphs: [
          "A satellite view is a photograph, and it can be months or years old. A plot that looks empty may be built on by now, and a new road may not appear yet. The app shows the capture date so you know how much to trust what you see.",
        ],
      },
      {
        heading: "Where the imagery comes from",
        paragraphs: [
          "The current high-resolution view is Esri World Imagery. The time slider uses NASA's public daily imagery (GIBS, from the MODIS Terra satellite).",
        ],
      },
    ],
    limits: [
      "The time slider's imagery is 250 m per pixel. It shows reservoirs, coastlines, vegetation and large-scale growth well. It does not show individual buildings or streets.",
      "Esri does not publish a capture date for every area. Where it does not, the app says the age of the image is unknown.",
    ],
    related: ["/tools/measure-area", "/solutions/urban-planning", "/area-report"],
  },
  {
    path: "/solutions/real-estate",
    group: "Solutions",
    nav: "For real estate",
    title: "Neighbourhood Reports for Property Listings | maNOWj",
    description:
      "Show buyers and tenants what is near a property: hospitals, schools, metro and shops with distances and sources, in a printable report. Free.",
    h1: "Neighbourhood reports for property listings and site visits",
    lead: "Buyers and tenants ask the same questions about every property: how far is the school, the hospital, the metro. Answer them in one sourced page per listing, made in about a minute.",
    examples: [
      { label: "See a sample area: Gachibowli", href: open(GACHIBOWLI.lat, GACHIBOWLI.lon, 15, "r=1000&s=place&t=evidence") },
      { label: "Schools within 2 km of Koramangala", href: open(KORAMANGALA.lat, KORAMANGALA.lon, 14, "q=schools+within+2+km") },
    ],
    sections: [
      {
        heading: "The usual way, and this way",
        bullets: [
          "The usual way: search a map for each kind of place, note distances by hand, and paste them into a brochure. It takes a long time and nobody can check it.",
          "This way: search the property's address once, press Report, and print or save a PDF that lists what is nearby with the source and date of every figure.",
        ],
      },
      {
        heading: "What agents and buyers use it for",
        bullets: [
          "A 'what is nearby' page attached to each listing.",
          "Comparing two or three shortlisted flats on the same measures.",
          "Checking a locality before a site visit: nearest hospital, schools within 2 km, public transport within walking distance.",
          "Seeing the plot on a satellite image, with its capture date where one is published.",
        ],
      },
      { heading: "Where the data comes from", paragraphs: [SOURCES_LINE] },
    ],
    limits: [
      "There are no prices, rents, builder ratings or legal checks here. Use RERA, the sub-registrar's records and a lawyer for those.",
      "Distances in the report are straight lines. For travel time, open Directions for the route.",
    ],
    related: ["/area-report", "/tools/radius-search", "/tools/satellite-history"],
  },
  {
    path: "/solutions/retail-site-selection",
    group: "Solutions",
    nav: "For shops and restaurants",
    title: "Check a Shop Location Before You Lease | maNOWj",
    description:
      "Count competitors, shops, offices and transit around a possible shop or restaurant site, and get a site score out of 100 from mapped data. Free.",
    h1: "Check a shop or restaurant location before you visit",
    lead: "Before you spend a day visiting a site, spend a minute on the map. Count the competitors around it, see how busy the surroundings are, and get a simple score for the kind of business you plan to open.",
    examples: [
      { label: "Is Indiranagar good for a restaurant?", href: open(INDIRANAGAR.lat, INDIRANAGAR.lon, 15, "q=is+this+a+good+place+for+a+restaurant") },
      { label: "Everything within 800 m of a point in Gachibowli", href: open(GACHIBOWLI.lat, GACHIBOWLI.lon, 15, "q=what+is+within+800+m") },
    ],
    sections: [
      {
        heading: "How to check a site",
        steps: [
          "Search the address or tap the exact spot on the map.",
          "Open Analyse and choose the kind of business: retail store, restaurant or café, hotel, hospital or clinic, school, or warehouse.",
          "Read the site score and the factors behind it: everyday activity nearby, offices and retail, public transport, and direct competitors.",
          "Run 'restaurants within 1 km' or a similar count to list the competitors by name and distance, and download the list.",
        ],
      },
      {
        heading: "How the score works",
        paragraphs: [
          "The score is out of 100 and is built only from what is mapped around the point. Each factor is shown with its weight and what it was based on, so you can see why one site scored higher than another instead of trusting a number.",
        ],
      },
      { heading: "Where the data comes from", paragraphs: [SOURCES_LINE] },
    ],
    limits: [
      "It does not know footfall, rents, spending power or sales. The score reflects what is mapped nearby, which is a first filter and not a business case.",
      "A shop that opened recently may not be on the map yet. Walk the street before you sign.",
    ],
    related: ["/tools/radius-search", "/area-report", "/tools/measure-area"],
  },
  {
    path: "/solutions/urban-planning",
    group: "Solutions",
    nav: "For planners and researchers",
    title: "Quick Area Checks for Urban Planning | maNOWj",
    description:
      "A fast first look at any urban area: amenities within walking distance, satellite change over time, population with its census year, and data to download.",
    h1: "A quick first look at any urban area",
    lead: "For students, researchers and planners who need a fast answer before opening a full GIS: what is within walking distance of this point, how has this area changed, and how do two cities compare.",
    examples: [
      { label: "What is within 800 m of Gachibowli", href: open(GACHIBOWLI.lat, GACHIBOWLI.lon, 15, "q=what+is+within+800+m") },
      { label: "Hospitals within 5 km of HITEC City", href: open(HITEC_CITY.lat, HITEC_CITY.lon, 13, "q=hospitals+within+5+km") },
      { label: "Compare Bengaluru and Hyderabad", href: "/compare/bengaluru-vs-hyderabad" },
    ],
    sections: [
      {
        heading: "What you can do in a few minutes",
        bullets: [
          "Count schools, clinics, parks and transit stops within walking distance of any point, and download the result as GeoJSON or CSV.",
          "Find the nearest facility of a kind and its distance.",
          "See large-scale change in water, vegetation and built-up area in NASA imagery back to 2012.",
          "Read a city's population, area and density with the census year attached.",
          "Measure the length of a corridor or the area of a site by drawing on the map.",
        ],
      },
      {
        heading: "Where it fits beside a full GIS",
        paragraphs: [
          "This is a first-look tool. It needs no installation or data preparation, which makes it useful for a quick check, a field visit or teaching. For overlays of your own data, network analysis or cartography, export the points and continue in QGIS or ArcGIS.",
        ],
      },
      { heading: "Where the data comes from", paragraphs: [SOURCES_LINE] },
    ],
    limits: [
      "Analysis uses straight-line distances, not travel time along the street network.",
      "You cannot upload your own layers yet.",
      "Population figures are for whole cities, from the census year shown, not for wards or small areas.",
    ],
    related: ["/tools/radius-search", "/tools/satellite-history", "/tools/measure-area"],
  },
];

export const INFO_PAGE_BY_PATH = new Map(INFO_PAGES.map((page) => [page.path, page]));
