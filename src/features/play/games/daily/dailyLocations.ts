/**
 * The places the Daily Challenge can send you to, and the clues that make them
 * guessable.
 *
 * This file IS the game. Everything else — scoring, streaks, sharing — is
 * plumbing; whether anyone plays twice depends on whether these locations are
 * interesting to look at from above and satisfying to work out.
 *
 * So the selection rule is not "famous cities". It is: does this place have a
 * SHAPE you could reason about from a satellite image with no labels? A
 * generic suburb is unguessable and teaches nothing. A star-shaped fortress
 * town, a river delta, an airport built on a man-made island, a mine visible
 * from orbit — those are solvable by looking, and they leave the player
 * knowing something they didn't.
 *
 * ── Why the clues exist ────────────────────────────────────────────────────
 *
 * The first version of this game shipped with no help at all: a photo, a blank
 * world map, and nothing else. That was a mistake, and it was obvious the
 * moment a real player hit a round they didn't know. From directly overhead,
 * a waterfall is a river with white water in it — Iguazú, Victoria Falls and
 * Niagara are genuinely indistinguishable that way, and no amount of staring
 * helps. A player who cannot even begin to reason doesn't feel challenged,
 * they feel taunted, and they close the tab.
 *
 * So every place now carries two written clues, and the game gives a third for
 * free (the continent). The ladder is deliberately shaped:
 *
 *   Clue 1 (free)  the continent. Turns "anywhere on Earth" into a region.
 *                  Free because being stuck with no way forward is the failure
 *                  mode worth eliminating entirely, not taxing.
 *   Clue 2 (paid)  what you are looking at, in plain words. Reframes the photo.
 *   Clue 3 (paid)  the geography that pins it down — a neighbouring country, a
 *                  named river, a coastline. Enough to place it if you know the
 *                  region at all.
 *
 * Two rules the clues must obey, both enforced by tests rather than by care:
 *
 *   A clue never contains the place's own name or its country. Clue 3 may name
 *   a NEIGHBOUR ("the far bank is Zambia") because that is the kind of hint
 *   that rewards knowing something, while naming the answer would just be the
 *   answer.
 *
 *   A clue describes, it does not narrate trivia. The interesting story goes in
 *   `fact`, which is shown afterwards. A clue that is merely charming is a clue
 *   that wasted the player's points.
 *
 * On the coordinates: each is the landmark or city centre itself, accurate to
 * roughly a kilometre. That is far inside the scoring bands — the difference
 * between 5000 and 4900 points is about 20 km — so this precision is honest
 * for the purpose, and nothing here is interpolated or invented to fill a gap.
 */

export type Difficulty = 1 | 2 | 3;

/**
 * Continents rather than the app's usual five-region split, because this is
 * used to frame a camera. "Americas" spans a third of the planet and would
 * barely narrow anything, which defeats the point of the free clue.
 */
export type DailyRegion =
  | "Africa"
  | "Asia"
  | "Europe"
  | "North America"
  | "South America"
  | "Oceania"
  | "Antarctica";

/**
 * Where the guess map jumps to when the free clue is taken.
 *
 * Zooms are deliberately loose — one step wider than the continent needs — so
 * the player can still see the neighbouring landmasses and reason about the
 * edges. Framed tightly, the clue would stop being a hint and start being an
 * answer.
 */
export const REGION_VIEW: Record<DailyRegion, { center: [number, number]; zoom: number }> = {
  Africa: { center: [20, 2], zoom: 1.9 },
  Asia: { center: [90, 35], zoom: 1.6 },
  Europe: { center: [15, 52], zoom: 2.2 },
  "North America": { center: [-100, 45], zoom: 1.8 },
  // Wide enough to include Rapa Nui, 3,500 km out into the Pacific.
  "South America": { center: [-75, -18], zoom: 1.5 },
  Oceania: { center: [140, -25], zoom: 1.9 },
  Antarctica: { center: [0, -75], zoom: 1.4 },
};

export interface DailyLocation {
  id: string;
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2, used for the flag on the answer card. */
  countryCode: string;
  /** Continent. Given away free as the first clue, and frames the guess map. */
  region: DailyRegion;
  lat: number;
  lon: number;
  /** 1 = most people will place it, 3 = rewards real knowledge. */
  difficulty: Difficulty;
  /** How close the camera starts. Tight for a landmark, wide for a landscape. */
  zoom: number;
  /**
   * The two paid clues, in the order they are offered.
   * [0] what you are looking at. [1] the geography that pins it down.
   * Neither may name this place or this country — see the tests.
   */
  clues: [string, string];
  /** Shown after the guess. The reason this place was worth visiting. */
  fact: string;
}

export const DAILY_LOCATIONS: DailyLocation[] = [
  // ── Tier 1 — recognisable outlines most players can place ──────────────
  {
    id: "giza",
    name: "Pyramids of Giza",
    country: "Egypt",
    countryCode: "EG",
    region: "Africa",
    lat: 29.9792,
    lon: 31.1342,
    difficulty: 1,
    zoom: 15,
    clues: [
      "Three huge stone tombs on a desert plateau, with a modern city stopping dead at their edge.",
      "A few kilometres west of a river that flows north into the Mediterranean through a wide green delta.",
    ],
    fact: "The city of Cairo now reaches right up to the plateau. From above you can see suburbs ending and desert beginning in a single street.",
  },
  {
    id: "palm-jumeirah",
    name: "Palm Jumeirah",
    country: "United Arab Emirates",
    countryCode: "AE",
    region: "Asia",
    lat: 25.1124,
    lon: 55.139,
    difficulty: 1,
    zoom: 13,
    clues: [
      "An artificial island shaped like a palm tree, pushed out into a warm shallow gulf.",
      "The city behind it went from a pearling harbour to a global aviation hub in about forty years.",
    ],
    fact: "Built from dredged sand rather than concrete, and shaped so every villa on the fronds gets its own stretch of beach.",
  },
  {
    id: "manhattan",
    name: "Central Park, New York",
    country: "United States",
    countryCode: "US",
    region: "North America",
    lat: 40.7829,
    lon: -73.9654,
    difficulty: 1,
    zoom: 13,
    clues: [
      "A perfect green rectangle cut out of a dense street grid on a long narrow island.",
      "The island sits between two tidal rivers on an Atlantic coast, at the mouth of the Hudson.",
    ],
    fact: "The rectangle was laid out in 1857, before the streets around it existed. The grid was built to meet the park, not the other way round.",
  },
  {
    id: "venice",
    name: "Venice",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    lat: 45.4408,
    lon: 12.3155,
    difficulty: 1,
    zoom: 14,
    clues: [
      "A city with no roads at all, built across islands in a lagoon, with an S-shaped channel curving through the middle.",
      "It sits at the very top of the Adriatic, sheltered behind a long thin sandbar.",
    ],
    fact: "The S-shaped Grand Canal is a former river channel. The city was built on wooden piles driven into the mud of the lagoon.",
  },
  {
    id: "taj-mahal",
    name: "Taj Mahal, Agra",
    country: "India",
    countryCode: "IN",
    region: "Asia",
    lat: 27.1751,
    lon: 78.0421,
    difficulty: 1,
    zoom: 16,
    clues: [
      "A white marble tomb at the head of a perfectly symmetrical walled garden, on the bank of a slow brown river.",
      "It stands on the Yamuna, about 200 km south-east of Delhi on a vast flat plain.",
    ],
    fact: "Perfectly symmetrical from above except for one thing: Shah Jahan's own tomb, added later, sits off-centre inside.",
  },
  {
    id: "golden-gate",
    name: "Golden Gate Bridge",
    country: "United States",
    countryCode: "US",
    region: "North America",
    lat: 37.8199,
    lon: -122.4783,
    difficulty: 1,
    zoom: 14,
    clues: [
      "A long red suspension bridge over a narrow strait, with a sheltered bay inside and open ocean outside.",
      "The bay behind it is the biggest estuary on the Pacific coast of the Americas.",
    ],
    fact: "The strait it crosses is the only sea-level break in the coastal mountains for hundreds of kilometres.",
  },
  {
    id: "sydney-opera",
    name: "Sydney Opera House",
    country: "Australia",
    countryCode: "AU",
    region: "Oceania",
    lat: -33.8568,
    lon: 151.2153,
    difficulty: 1,
    zoom: 16,
    clues: [
      "A cluster of white shell-shaped roofs on a small headland inside a deep branching harbour.",
      "The harbour is a drowned river valley on the south-east coast of the smallest continent.",
    ],
    fact: "The shells are all sections of one sphere: the solution that finally made the roof buildable after years of failed designs.",
  },
  {
    id: "colosseum",
    name: "Colosseum, Rome",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    lat: 41.8902,
    lon: 12.4922,
    difficulty: 1,
    zoom: 16,
    clues: [
      "A ruined stone oval with no floor left, so you look straight down into the tunnels underneath.",
      "It sits in a capital city built on seven hills, near the middle of a long peninsula in the Mediterranean.",
    ],
    fact: "The oval floor is missing, so from above you look straight down into the tunnel maze that ran beneath the arena.",
  },
  {
    id: "charminar",
    name: "Charminar, Hyderabad",
    country: "India",
    countryCode: "IN",
    region: "Asia",
    lat: 17.3616,
    lon: 78.4747,
    difficulty: 1,
    zoom: 17,
    clues: [
      "A square monument with four arches and four minarets at a crossroads, ringed by a packed old bazaar.",
      "The city around it is on the Deccan plateau and is now known for pharmaceuticals and software.",
    ],
    fact: "It stands at the crossing of two roads laid out in 1591, and the old city's street pattern still radiates from it.",
  },
  {
    id: "uluru",
    name: "Uluru",
    country: "Australia",
    countryCode: "AU",
    region: "Oceania",
    lat: -25.3444,
    lon: 131.0369,
    difficulty: 1,
    zoom: 13,
    clues: [
      "One enormous sandstone rock rising alone out of completely flat red desert.",
      "It sits almost exactly at the centre of its continent, more than a thousand kilometres from any coast.",
    ],
    fact: "What you see is the tip. The sandstone continues underground for several kilometres.",
  },
  {
    id: "machu-picchu",
    name: "Machu Picchu",
    country: "Peru",
    countryCode: "PE",
    region: "South America",
    lat: -13.1631,
    lon: -72.545,
    difficulty: 1,
    zoom: 16,
    clues: [
      "Stone terraces and small rectangular ruins on a narrow saddle between two very steep green peaks.",
      "Built by the Inca high in the Andes, above a river that eventually drains into the Amazon.",
    ],
    fact: "It sits on a saddle between two peaks, which is why it stayed hidden from the valley floor below.",
  },
  {
    id: "christ-redeemer",
    name: "Christ the Redeemer, Rio",
    country: "Brazil",
    countryCode: "BR",
    region: "South America",
    lat: -22.9519,
    lon: -43.2105,
    difficulty: 1,
    zoom: 15,
    clues: [
      "A statue on a bare rocky summit inside a forest, overlooking a harbour city wedged between mountains and beaches.",
      "Portuguese sailors reached the bay below in January 1502 and mistook it for a river mouth.",
    ],
    fact: "The statue stands on Corcovado inside Tijuca Forest, one of the largest urban forests in the world, replanted by hand in the 1860s.",
  },

  // ── Tier 2 — solvable by reasoning about the shape ─────────────────────
  {
    id: "brasilia",
    name: "Brasília",
    country: "Brazil",
    countryCode: "BR",
    region: "South America",
    lat: -15.7939,
    lon: -47.8828,
    difficulty: 2,
    zoom: 12,
    clues: [
      "An entire city laid out on a drawing board in the shape of an aeroplane, ministries along the fuselage and housing on the wings.",
      "It was built from nothing in the interior highlands in the 1950s, to move a capital away from the coast.",
    ],
    fact: "The whole city was planned in 1957 in the shape of an aircraft, with government along the fuselage and housing on the wings.",
  },
  {
    id: "palmanova",
    name: "Palmanova",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    lat: 45.9058,
    lon: 13.3097,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A nine-pointed star fortress town, with streets radiating out from a hexagonal square in the middle.",
      "A merchant republic built it in 1593 to guard its north-eastern frontier against the Ottomans and the Habsburgs.",
    ],
    fact: "A nine-pointed star fortress from 1593. The geometry was defensive: no attacker could approach a wall without being fired on from two sides.",
  },
  {
    id: "richat",
    name: "Richat Structure",
    country: "Mauritania",
    countryCode: "MR",
    region: "Africa",
    lat: 21.1244,
    lon: -11.4016,
    difficulty: 2,
    zoom: 11,
    clues: [
      "A bullseye of concentric rock rings about forty kilometres across, in otherwise empty desert.",
      "It lies in the western Sahara, a few hundred kilometres inland from the Atlantic, north of Senegal.",
    ],
    fact: "Nicknamed the Eye of the Sahara. Long assumed to be an impact crater; it is now understood to be an eroded dome of rock.",
  },
  {
    id: "kansai",
    name: "Kansai International Airport",
    country: "Japan",
    countryCode: "JP",
    region: "Asia",
    lat: 34.4342,
    lon: 135.2328,
    difficulty: 2,
    zoom: 13,
    clues: [
      "An airport on a rectangular artificial island in a bay, linked to the mainland by one long bridge.",
      "It serves an old imperial capital region on the Pacific side of a volcanic island chain.",
    ],
    fact: "Built on an artificial island because there was no land left near Osaka. It has been sinking since it opened, and is monitored constantly.",
  },
  {
    id: "three-gorges",
    name: "Three Gorges Dam",
    country: "China",
    countryCode: "CN",
    region: "Asia",
    lat: 30.8235,
    lon: 111.0033,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A vast concrete dam wedged into a steep river gorge, with a staircase of ship locks cut into the hillside beside it.",
      "The river is the longest in Asia and runs east from here to a delta at Shanghai.",
    ],
    fact: "The reservoir behind it holds so much water that its filling produced a measurable change in the Earth's rotation.",
  },
  {
    id: "bingham",
    name: "Bingham Canyon Mine",
    country: "United States",
    countryCode: "US",
    region: "North America",
    lat: 40.5231,
    lon: -112.151,
    difficulty: 2,
    zoom: 13,
    clues: [
      "A terraced open pit several kilometres wide, spiralling down into a mountainside like a stadium.",
      "It is just west of a city built beside a very large inland salt lake.",
    ],
    fact: "One of the largest excavations ever made by people: a terraced pit roughly four kilometres across and a kilometre deep.",
  },
  {
    id: "salar-uyuni",
    name: "Salar de Uyuni",
    country: "Bolivia",
    countryCode: "BO",
    region: "South America",
    lat: -20.1338,
    lon: -67.4891,
    difficulty: 2,
    zoom: 10,
    clues: [
      "A blinding white salt flat the size of a small country, with dark volcanic islands poking through it.",
      "It sits on the Altiplano at nearly 3,700 metres, in the only landlocked country on that side of the Andes.",
    ],
    fact: "The flattest large surface on Earth, varying by less than a metre across 10,000 km². Satellites use it to calibrate their instruments.",
  },
  {
    id: "flevoland",
    name: "Flevoland polders",
    country: "Netherlands",
    countryCode: "NL",
    region: "Europe",
    lat: 52.5168,
    lon: 5.4714,
    difficulty: 2,
    zoom: 11,
    clues: [
      "Dead-straight fields, roads and canals on land that was the bottom of a sea seventy years ago.",
      "It is ringed by dykes on the North Sea coast, in the lowest-lying country in Europe.",
    ],
    fact: "This was the bottom of a sea until the 1950s. The straight-edged fields are the giveaway: land drawn on paper before it existed.",
  },
  {
    id: "suez",
    name: "Suez Canal at Ismailia",
    country: "Egypt",
    countryCode: "EG",
    region: "Africa",
    lat: 30.5852,
    lon: 32.2654,
    difficulty: 2,
    zoom: 12,
    clues: [
      "A dead-straight shipping channel cut through open sand, widening into a lake partway along.",
      "It joins the Mediterranean to the Red Sea and carries roughly a tenth of world trade.",
    ],
    fact: "A sea-level canal with no locks, because the Mediterranean and the Red Sea sit at nearly the same height.",
  },
  {
    id: "barcelona",
    name: "Eixample, Barcelona",
    country: "Spain",
    countryCode: "ES",
    region: "Europe",
    lat: 41.3917,
    lon: 2.1649,
    difficulty: 2,
    zoom: 15,
    clues: [
      "A city grid where every single block has its corners cut off at 45 degrees, making octagonal junctions.",
      "A Mediterranean port on the north-east coast of the Iberian peninsula, below the Pyrenees.",
    ],
    fact: "Every block has its corners cut off at 45 degrees, designed in 1859 so that horse-drawn trams could turn.",
  },
  {
    id: "bosphorus",
    name: "The Bosphorus, Istanbul",
    country: "Türkiye",
    countryCode: "TR",
    region: "Europe",
    lat: 41.0392,
    lon: 29.009,
    difficulty: 2,
    zoom: 12,
    clues: [
      "A narrow winding strait running right through the middle of a huge city, crossed by long suspension bridges.",
      "It is the only sea route out of the Black Sea, and the city on it stands on two continents at once.",
    ],
    fact: "A drowned river valley, and the only sea route between the Black Sea and the Mediterranean.",
  },
  {
    id: "table-mountain",
    name: "Table Mountain, Cape Town",
    country: "South Africa",
    countryCode: "ZA",
    region: "Africa",
    lat: -33.9628,
    lon: 18.4098,
    difficulty: 2,
    zoom: 13,
    clues: [
      "A mountain with a completely flat top and sheer sides, standing directly over a harbour city and a curved bay.",
      "It is near the south-western tip of its continent, on the sea route round the Cape.",
    ],
    fact: "The flat top is a slab of hard sandstone that resisted the erosion which removed everything around it.",
  },
  {
    id: "fuji",
    name: "Mount Fuji",
    country: "Japan",
    countryCode: "JP",
    region: "Asia",
    lat: 35.3606,
    lon: 138.7274,
    difficulty: 2,
    zoom: 12,
    clues: [
      "An almost perfectly circular volcanic cone with a crater at the summit, standing alone above flat farmland.",
      "It is about a hundred kilometres south-west of a very large Pacific capital, on the main island of an archipelago.",
    ],
    fact: "An almost perfect cone because it is young and built from thousands of thin, even lava flows. It last erupted in 1707.",
  },
  {
    id: "ha-long",
    name: "Ha Long Bay",
    country: "Vietnam",
    countryCode: "VN",
    region: "Asia",
    lat: 20.9101,
    lon: 107.1839,
    difficulty: 2,
    zoom: 12,
    clues: [
      "Hundreds of steep limestone towers rising straight out of a shallow blue-green bay.",
      "The bay opens onto the Gulf of Tonkin, in the north of a long thin country facing the South China Sea.",
    ],
    fact: "Around 1,600 limestone towers: the remains of a landscape that dissolved over millions of years, leaving only the hardest cores.",
  },
  {
    id: "iguazu",
    name: "Iguazú Falls",
    country: "Argentina",
    countryCode: "AR",
    region: "South America",
    lat: -25.6953,
    lon: -54.4367,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A horseshoe of hundreds of separate waterfalls where a wide river drops off a plateau into rainforest.",
      "The falls sit on one international border, and a third country's frontier meets the other two a few kilometres downstream.",
    ],
    fact: "A horseshoe of some 275 separate drops on the border between Argentina and Brazil.",
  },
  {
    id: "victoria-falls",
    name: "Victoria Falls",
    country: "Zimbabwe",
    countryCode: "ZW",
    region: "Africa",
    lat: -17.9243,
    lon: 25.8572,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A river more than a kilometre wide drops into a single narrow crack, then zig-zags away down a chain of old gorges.",
      "The river is the Zambezi, and the far bank belongs to Zambia.",
    ],
    fact: "The river drops into a zig-zag of old gorges, each one a former waterfall that cut backwards along a crack in the rock.",
  },
  {
    id: "grand-prismatic",
    name: "Grand Prismatic Spring",
    country: "United States",
    countryCode: "US",
    region: "North America",
    lat: 44.5251,
    lon: -110.8383,
    difficulty: 2,
    zoom: 16,
    clues: [
      "A steaming hot spring ringed with bands of orange, yellow and green, with a boardwalk running past it.",
      "It is inside the world's first national park, which sits on the caldera of a supervolcano in the Rockies.",
    ],
    fact: "The rings of colour are bacteria. Each band lives at a different temperature, so the spring is a thermometer you can see from the air.",
  },
  {
    id: "amsterdam",
    name: "Amsterdam canal ring",
    country: "Netherlands",
    countryCode: "NL",
    region: "Europe",
    lat: 52.3676,
    lon: 4.9041,
    difficulty: 2,
    zoom: 14,
    clues: [
      "Concentric half-rings of water wrapped around an old harbour front, with narrow blocks packed between them.",
      "Dug in the 1600s by a trading city that sits below sea level near the North Sea.",
    ],
    fact: "The concentric half-rings were dug in the 17th century as a single planned expansion: a ring road, a sewer and a dock all at once.",
  },
  {
    id: "singapore-marina",
    name: "Marina Bay, Singapore",
    country: "Singapore",
    countryCode: "SG",
    region: "Asia",
    lat: 1.2836,
    lon: 103.8607,
    difficulty: 2,
    zoom: 15,
    clues: [
      "A dammed bay in the middle of a dense high-rise centre, with a ship-shaped roof balanced on three towers beside it.",
      "The whole country is one island city at the southern tip of the Malay peninsula, almost exactly on the equator.",
    ],
    fact: "The bay is now a freshwater reservoir. A barrage across the mouth cut it off from the sea in 2008.",
  },
  {
    id: "dubrovnik",
    name: "Dubrovnik old town",
    country: "Croatia",
    countryCode: "HR",
    region: "Europe",
    lat: 42.6407,
    lon: 18.1077,
    difficulty: 2,
    zoom: 16,
    clues: [
      "A small walled town on a rocky point, an unbroken stone wall right around it and orange roofs packed inside.",
      "It is on the Dalmatian coast of the Adriatic, near the southern end of a country shaped like a boomerang.",
    ],
    fact: "The walls run unbroken for nearly two kilometres around a town you can cross on foot in ten minutes.",
  },
  {
    id: "mont-saint-michel",
    name: "Mont-Saint-Michel",
    country: "France",
    countryCode: "FR",
    region: "Europe",
    lat: 48.6361,
    lon: -1.5115,
    difficulty: 2,
    zoom: 16,
    clues: [
      "A tiny rocky island crowned by an abbey, in the middle of an enormous flat bay that empties completely at low tide.",
      "It sits on the Channel coast, right on the boundary between Normandy and Brittany.",
    ],
    fact: "The tide here moves faster than anywhere else in mainland Europe, and the causeway was rebuilt in 2014 to let the sand wash away again.",
  },
  {
    id: "kennedy-lc39a",
    name: "Kennedy Space Center, Pad 39A",
    country: "United States",
    countryCode: "US",
    region: "North America",
    lat: 28.6084,
    lon: -80.6043,
    difficulty: 2,
    zoom: 15,
    clues: [
      "A rocket launch pad with a flame trench and a very wide gravel road, on a low sandy barrier island.",
      "It is on the Atlantic side of a southern peninsula, sited so rockets fly east over open water.",
    ],
    fact: "Apollo 11 and most Shuttle missions left from this pad. The wide gravel road beside it carried the crawler that moved the rockets.",
  },
  {
    id: "pripyat",
    name: "Pripyat",
    country: "Ukraine",
    countryCode: "UA",
    region: "Europe",
    lat: 51.4045,
    lon: 30.0542,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A 1970s planned town of wide avenues and tower blocks, completely empty and being swallowed by trees.",
      "It was built for the staff of a nuclear plant that failed in 1986, north of Kyiv on the Belarus border.",
    ],
    fact: "A city built for 49,000 people and emptied in a day in 1986. From above, the forest is visibly taking the streets back.",
  },
  {
    id: "great-blue-hole",
    name: "Great Blue Hole",
    country: "Belize",
    countryCode: "BZ",
    region: "North America",
    lat: 17.3159,
    lon: -87.535,
    difficulty: 2,
    zoom: 14,
    clues: [
      "A perfectly round patch of deep navy water in the middle of a pale turquoise reef.",
      "It lies off the Caribbean coast of Central America, inside the second largest barrier reef on Earth.",
    ],
    fact: "A limestone cave that collapsed when sea levels were far lower, then flooded as the ice age ended.",
  },

  // ── Tier 3 — for players who know the world properly ───────────────────
  {
    id: "longyearbyen",
    name: "Longyearbyen, Svalbard",
    country: "Norway",
    countryCode: "NO",
    region: "Europe",
    lat: 78.2232,
    lon: 15.6267,
    difficulty: 3,
    zoom: 13,
    clues: [
      "A few rows of brightly coloured buildings in a bare treeless valley, at the head of a fjord between snow-streaked mountains.",
      "It is on an Arctic archipelago roughly halfway between the European mainland and the North Pole.",
    ],
    fact: "One of the northernmost towns on Earth. The sun stays below the horizon from late October to mid-February.",
  },
  {
    id: "ushuaia",
    name: "Ushuaia",
    country: "Argentina",
    countryCode: "AR",
    region: "South America",
    lat: -54.8019,
    lon: -68.303,
    difficulty: 3,
    zoom: 13,
    clues: [
      "A town squeezed between steep mountains and a channel, with a harbour full of expedition ships.",
      "It is on an island at the very bottom of its continent, and is the usual port of departure for Antarctica.",
    ],
    fact: "Squeezed between mountains and the Beagle Channel, and the usual departure port for Antarctica.",
  },
  {
    id: "easter-island",
    name: "Rapa Nui (Easter Island)",
    country: "Chile",
    countryCode: "CL",
    region: "South America",
    lat: -27.1127,
    lon: -109.3497,
    difficulty: 3,
    zoom: 12,
    clues: [
      "A small triangular volcanic island alone in a vast ocean, with a crater at each of its three corners.",
      "It is more than 3,500 km out into the Pacific, and is governed by a long thin country on the South American coast.",
    ],
    fact: "The nearest inhabited land is Pitcairn, over 2,000 km away. The island is three extinct volcanoes joined together.",
  },
  {
    id: "ashgabat",
    name: "Ashgabat",
    country: "Turkmenistan",
    countryCode: "TM",
    region: "Asia",
    lat: 37.9601,
    lon: 58.3261,
    difficulty: 3,
    zoom: 13,
    clues: [
      "Extremely wide, almost empty boulevards between enormous white marble buildings, with desert starting right at the edge of town.",
      "It sits on a narrow strip of oasis between the Karakum desert and the mountains of the Iranian border.",
    ],
    fact: "Rebuilt in white marble on a scale that is obvious from orbit: wide empty boulevards between very large buildings.",
  },
  {
    id: "yakutsk",
    name: "Yakutsk",
    country: "Russia",
    countryCode: "RU",
    region: "Asia",
    lat: 62.0355,
    lon: 129.6755,
    difficulty: 3,
    zoom: 12,
    clues: [
      "A city of apartment blocks raised up on stilts, beside an enormous braided river, with taiga in every direction.",
      "It stands on the Lena in eastern Siberia, and is the coldest city of its size anywhere.",
    ],
    fact: "Built on permafrost, so buildings stand on stilts to keep their heat from melting the ground beneath them.",
  },
  {
    id: "timbuktu",
    name: "Timbuktu",
    country: "Mali",
    countryCode: "ML",
    region: "Africa",
    lat: 16.7735,
    lon: -3.0074,
    difficulty: 3,
    zoom: 14,
    clues: [
      "A low mud-brick town on the edge of the Sahara, where the sand meets the top of a great river's bend.",
      "The river is the Niger, and this was the caravan hub where salt came south and gold went north.",
    ],
    fact: "A desert trading city that was a centre of manuscript scholarship while the Sahara route carried salt and gold.",
  },
  {
    id: "aral",
    name: "The former Aral Sea",
    country: "Kazakhstan",
    countryCode: "KZ",
    region: "Asia",
    lat: 45.15,
    lon: 59.0,
    difficulty: 3,
    zoom: 9,
    clues: [
      "Pale salt flats and a stranded old shoreline where a huge lake used to be, with only a remnant of water left.",
      "Its two feeder rivers were diverted for cotton in Soviet Central Asia during the 1960s.",
    ],
    fact: "One of the largest lakes on Earth until its rivers were diverted for cotton in the 1960s. What remains is mostly salt flat.",
  },
  {
    id: "danakil",
    name: "Danakil Depression",
    country: "Ethiopia",
    countryCode: "ET",
    region: "Africa",
    lat: 14.2417,
    lon: 40.3,
    difficulty: 3,
    zoom: 12,
    clues: [
      "Yellow and green mineral crusts around bubbling acid pools, in a desert basin lying below sea level.",
      "It is in the Afar triangle of the Horn of Africa, where three tectonic plates are pulling apart.",
    ],
    fact: "Over 100 metres below sea level and among the hottest inhabited places anywhere. The colours are sulphur and iron salts.",
  },
  {
    id: "sossusvlei",
    name: "Sossusvlei",
    country: "Namibia",
    countryCode: "NA",
    region: "Africa",
    lat: -24.7286,
    lon: 15.3466,
    difficulty: 3,
    zoom: 12,
    clues: [
      "Enormous star-shaped dunes of deep red sand, with a white clay pan among them and a dry riverbed winding in.",
      "It is in the oldest desert on Earth, on the Atlantic side of the southern part of its continent.",
    ],
    fact: "Star-shaped dunes among the tallest in the world, coloured deep red by iron oxide in sand carried here from the Orange River.",
  },
  {
    id: "lencois",
    name: "Lençóis Maranhenses",
    country: "Brazil",
    countryCode: "BR",
    region: "South America",
    lat: -2.4859,
    lon: -43.1289,
    difficulty: 3,
    zoom: 12,
    clues: [
      "White sand dunes with hundreds of blue-green rainwater lagoons sitting in the hollows between them, right behind a tropical coast.",
      "It is on the northern Atlantic shore of South America's largest country, a little south of the equator.",
    ],
    fact: "A desert-looking dune field that fills with rainwater lagoons every wet season: sand and lakes in the same photograph.",
  },
  {
    id: "perito-moreno",
    name: "Perito Moreno Glacier",
    country: "Argentina",
    countryCode: "AR",
    region: "South America",
    lat: -50.4967,
    lon: -73.1377,
    difficulty: 3,
    zoom: 13,
    clues: [
      "A wall of cracked blue-white glacier ice pushing straight into a lake, with dark forest on both shores.",
      "It flows east off the Southern Patagonian Ice Field, on the drier side of the Andes.",
    ],
    fact: "One of very few glaciers in the world that is not retreating. It periodically dams a lake, then breaks the dam.",
  },
  {
    id: "socotra",
    name: "Socotra",
    country: "Yemen",
    countryCode: "YE",
    region: "Asia",
    lat: 12.4634,
    lon: 53.8236,
    difficulty: 3,
    zoom: 11,
    clues: [
      "A long isolated island of limestone plateaus with white dune fields along the north coast and almost no green.",
      "It lies in the Arabian Sea off the Horn of Africa, but belongs to a country on the Arabian peninsula.",
    ],
    fact: "Isolated for millions of years, so a third of its plants grow nowhere else, including the umbrella-shaped dragon's blood tree.",
  },
  {
    id: "kolmanskop",
    name: "Kolmanskop",
    country: "Namibia",
    countryCode: "NA",
    region: "Africa",
    lat: -26.7047,
    lon: 15.2299,
    difficulty: 3,
    zoom: 16,
    clues: [
      "A few dozen abandoned European-style houses standing in bare desert, half of them filled with drifted sand.",
      "It was a diamond boom town, a few kilometres inland from a small port on the south Atlantic coast.",
    ],
    fact: "A diamond town abandoned in 1956. The desert has been filling the houses with sand ever since.",
  },
  {
    id: "wadi-rum",
    name: "Wadi Rum",
    country: "Jordan",
    countryCode: "JO",
    region: "Asia",
    lat: 29.5765,
    lon: 35.42,
    difficulty: 3,
    zoom: 12,
    clues: [
      "Sheer sandstone and granite towers standing straight out of flat pink sand, separated by wide dry valleys.",
      "It is in the far south of a small Arab kingdom, close to its only port on the Red Sea.",
    ],
    fact: "Sandstone and granite towers rising straight out of flat sand, split by valleys cut when this desert had rivers.",
  },
  {
    id: "lake-natron",
    name: "Lake Natron",
    country: "Tanzania",
    countryCode: "TZ",
    region: "Africa",
    lat: -2.4111,
    lon: 36.0028,
    difficulty: 3,
    zoom: 11,
    clues: [
      "A shallow lake stained deep red and orange by salt and algae, with a steep volcano at its southern end.",
      "It is in the Rift Valley just south of the Kenyan border, and is where East Africa's flamingos breed.",
    ],
    fact: "So alkaline that few things survive in it, yet it is the main breeding site for East Africa's lesser flamingos.",
  },
  {
    id: "olkhon",
    name: "Olkhon Island, Lake Baikal",
    country: "Russia",
    countryCode: "RU",
    region: "Asia",
    lat: 53.15,
    lon: 107.35,
    difficulty: 3,
    zoom: 11,
    clues: [
      "A long narrow island with open steppe on one side and cliffs on the other, sitting in an enormous crescent-shaped lake.",
      "The lake is the deepest on Earth and holds about a fifth of the world's unfrozen fresh water, in southern Siberia near Mongolia.",
    ],
    fact: "Baikal holds about a fifth of the world's unfrozen fresh water and is the deepest lake on Earth.",
  },
  {
    id: "mcmurdo",
    name: "McMurdo Station",
    country: "Antarctica",
    countryCode: "AQ",
    region: "Antarctica",
    lat: -77.8419,
    lon: 166.6863,
    difficulty: 3,
    zoom: 13,
    clues: [
      "A cluster of plain industrial buildings and fuel tanks on bare dark volcanic rock, with sea ice all around.",
      "It is the largest settlement on the southernmost continent, on an island in the Ross Sea.",
    ],
    fact: "The largest settlement in Antarctica, on bare volcanic rock at the tip of Ross Island.",
  },
  {
    id: "iquitos",
    name: "Iquitos",
    country: "Peru",
    countryCode: "PE",
    region: "South America",
    lat: -3.7437,
    lon: -73.2516,
    difficulty: 3,
    zoom: 12,
    clues: [
      "A city of several hundred thousand people on a huge brown river, surrounded on every side by unbroken rainforest.",
      "No road reaches it. It is the largest city in the Amazon basin, in a country whose capital is on the Pacific.",
    ],
    fact: "A city of several hundred thousand people with no road connecting it to anywhere. You arrive by river or by air.",
  },
];

/** Sanity-checkable grouping used by the daily draw. */
export function byDifficulty(level: Difficulty): DailyLocation[] {
  return DAILY_LOCATIONS.filter((l) => l.difficulty === level);
}
