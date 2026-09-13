/**
 * The cities that get their own page.
 *
 * Eight, not eighty, and that is the whole design. A page earns a place in an
 * index by being worth reading; forty near-identical pages generated from a
 * template are the thing search engines have spent fifteen years learning to
 * ignore, and they drag down the pages that would otherwise have ranked. Eight
 * written properly is a better bet than eighty written by a loop.
 *
 * WHAT IS IN THIS FILE, AND WHAT IS DELIBERATELY NOT.
 *
 * In: the things that do not change and that can be checked — the city's name,
 * the state it is in, its coordinates, the river or coast it sits on, a handful
 * of landmarks anyone can verify on the map itself.
 *
 * Not in: a single number. No population, no area, no density, no air quality,
 * no counts of hospitals or schools. Every figure on these pages is fetched
 * live from the same APIs the app uses, and arrives with its source and its
 * date attached. That is not caution for its own sake — a hardcoded population
 * is wrong the day it is written and gets more wrong every year, silently, in a
 * page that exists to look authoritative. This app's whole claim is that every
 * answer shows where it came from and when. A city page full of unsourced
 * numbers would be the one place that claim is false.
 *
 * The prose below is written per city rather than templated for the same
 * reason. "X is a city in Y with a population of Z" eight times is a doorway
 * page whatever the values are.
 */

export interface City {
  /** The URL segment: /maps/<slug>. */
  slug: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  /** How far in the map opens. Tighter for compact cores, wider for sprawl. */
  zoom: number;
  /** One sentence for the meta description and the page intro. */
  summary: string;
  /** Two or three sentences of real geography, specific to this place. */
  geography: string;
  /** Landmarks anyone can find on the map, so the page is checkable. */
  landmarks: string[];
  /**
   * Questions this app can genuinely answer here, phrased the way the parser
   * accepts. Listing a question the app cannot run would be the worst kind of
   * SEO page: one that ranks and then disappoints.
   */
  questions: string[];
}

export const CITIES: City[] = [
  {
    slug: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    lat: 17.385,
    lon: 78.4867,
    zoom: 12,
    summary:
      "Explore Hyderabad on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Hyderabad sits on the Deccan plateau in Telangana, built along the Musi river and around a chain of artificial lakes, the largest of which is Hussain Sagar. The old city lies south of the river around Charminar; the newer technology districts run north-west through Madhapur and Gachibowli. Granite outcrops are visible across the whole urban area, which is why so much of the older architecture is built from it.",
    landmarks: ["Charminar", "Golconda Fort", "Hussain Sagar", "HITEC City", "Osmania University"],
    questions: [
      "hospitals within 5 km",
      "schools within 2 km",
      "what is within 800 m",
      "is this a good place for a restaurant",
    ],
  },
  {
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    lat: 12.9716,
    lon: 77.5946,
    zoom: 12,
    summary:
      "Explore Bengaluru on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Bengaluru sits high on the Deccan plateau, around 900 metres above sea level, which is why it stays cooler than most of southern India at the same latitude. It has no river running through it and grew instead around a network of tanks built to hold rainwater, many of which survive as lakes. The city spreads outward along the Outer Ring Road rather than from a single dense core.",
    landmarks: ["Lalbagh Botanical Garden", "Cubbon Park", "Vidhana Soudha", "Ulsoor Lake", "Electronic City"],
    questions: [
      "hospitals within 5 km",
      "cafes within 1 km",
      "what is within 800 m",
      "is this a good place for a restaurant",
    ],
  },
  {
    slug: "mumbai",
    name: "Mumbai",
    state: "Maharashtra",
    lat: 19.076,
    lon: 72.8777,
    zoom: 12,
    summary:
      "Explore Mumbai on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Mumbai occupies Salsette Island on India's west coast, which is the single fact that explains most of its geography: the city could only grow north, so it is long and narrow, and land is scarce in a way it is not anywhere else in the country. Sanjay Gandhi National Park sits inside the municipal boundary, which is unusual for a city this size. The western shoreline faces the Arabian Sea directly.",
    landmarks: ["Gateway of India", "Marine Drive", "Bandra-Worli Sea Link", "Sanjay Gandhi National Park", "Chhatrapati Shivaji Terminus"],
    questions: ["hospitals within 3 km", "schools within 1 km", "what is within 500 m", "banks within 1 km"],
  },
  {
    slug: "delhi",
    name: "Delhi",
    state: "Delhi",
    lat: 28.6139,
    lon: 77.209,
    zoom: 11,
    summary:
      "Explore Delhi on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Delhi lies on the west bank of the Yamuna, on the flat Indo-Gangetic plain, interrupted by the Delhi Ridge — the northern tail of the Aravalli range, which runs through the city as a band of rocky, forested high ground. The National Capital Territory covers far more than the historic city, taking in New Delhi, the older walled city around Red Fort, and a wide belt of newer development.",
    landmarks: ["Red Fort", "India Gate", "Qutub Minar", "Connaught Place", "Lodhi Gardens"],
    questions: ["hospitals within 5 km", "schools within 2 km", "what is within 800 m", "pharmacies within 1 km"],
  },
  {
    slug: "chennai",
    name: "Chennai",
    state: "Tamil Nadu",
    lat: 13.0827,
    lon: 80.2707,
    zoom: 12,
    summary:
      "Explore Chennai on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Chennai runs along the Coromandel Coast on the Bay of Bengal, on a flat coastal plain with almost no elevation change across the whole city. Two rivers cross it, the Cooum and the Adyar, joined by the Buckingham Canal running parallel to the shore. Marina Beach stretches for several kilometres along the eastern edge.",
    landmarks: ["Marina Beach", "Fort St George", "Kapaleeshwarar Temple", "Guindy National Park", "Adyar Estuary"],
    questions: ["hospitals within 5 km", "schools within 2 km", "what is within 800 m", "restaurants within 1 km"],
  },
  {
    slug: "pune",
    name: "Pune",
    state: "Maharashtra",
    lat: 18.5204,
    lon: 73.8567,
    zoom: 12,
    summary:
      "Explore Pune on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Pune sits at the confluence of the Mula and Mutha rivers, on the leeward side of the Western Ghats about 560 metres above sea level. The Ghats to the west put it in a rain shadow, so it gets noticeably less monsoon rainfall than the coast sixty miles away. Hills sit inside the city itself, including Parvati and Vetal, which is why its road network bends around them rather than gridding.",
    landmarks: ["Shaniwar Wada", "Aga Khan Palace", "Parvati Hill", "Pashan Lake", "Hinjawadi"],
    questions: ["hospitals within 3 km", "schools within 2 km", "what is within 800 m", "cafes within 1 km"],
  },
  {
    slug: "kolkata",
    name: "Kolkata",
    state: "West Bengal",
    lat: 22.5726,
    lon: 88.3639,
    zoom: 12,
    summary:
      "Explore Kolkata on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Kolkata stands on the east bank of the Hooghly, a distributary of the Ganges, roughly 60 kilometres inland from the Bay of Bengal. The land is almost entirely flat and only a few metres above sea level, part of the wider Ganges delta. East of the city lie the East Kolkata Wetlands, which treat much of its wastewater naturally and are a Ramsar site.",
    landmarks: ["Victoria Memorial", "Howrah Bridge", "Maidan", "Dakshineswar Kali Temple", "East Kolkata Wetlands"],
    questions: ["hospitals within 3 km", "schools within 2 km", "what is within 800 m", "banks within 1 km"],
  },
  {
    slug: "visakhapatnam",
    name: "Visakhapatnam",
    state: "Andhra Pradesh",
    lat: 17.6868,
    lon: 83.2185,
    zoom: 12,
    summary:
      "Explore Visakhapatnam on an interactive map and ask questions about any part of it, with every answer showing its source.",
    geography:
      "Visakhapatnam sits between the Eastern Ghats and the Bay of Bengal, which gives it something almost no other large Indian city has: hills running right down to the shoreline. Its harbour is a natural one, sheltered by the Dolphin's Nose headland. The coastline here is steep enough that the beach road climbs and falls rather than running flat.",
    landmarks: ["Kailasagiri", "Dolphin's Nose", "RK Beach", "Simhachalam Temple", "Rushikonda Beach"],
    questions: ["hospitals within 3 km", "schools within 2 km", "what is within 800 m", "hotels within 2 km"],
  },
];

export const CITY_BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]));

/** Every path this set of pages owns, for App's known-path check and the sitemap. */
export const CITY_PATHS = CITIES.map((c) => `/maps/${c.slug}`);
