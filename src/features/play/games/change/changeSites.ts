/**
 * Places on Earth that visibly changed, and can be SEEN to have changed in the
 * imagery this app actually has.
 *
 * The constraint that shaped this entire list: NASA GIBS serves MODIS at 250
 * metres per pixel. src/features/timeline/gibs.ts is blunt about what that
 * means — "reservoirs filling and emptying, coastlines moving, vegetation and
 * snow coming and going, large urban expansion over years". At 250 m a city
 * block is one pixel.
 *
 * So the obvious crowd-pleasers are not here. Dubai's Palm Jumeirah is about
 * 5 km across and would be twenty pixels of vague smudge; a new airport, a new
 * stadium, a new motorway are all invisible. Including them would have made a
 * game where the honest answer to "what changed?" is "nothing you can see",
 * and the player would rightly conclude the game was broken rather than that
 * they had missed something.
 *
 * Every site below changed by tens of kilometres, and every one is documented
 * by a named source. `source` is shown to the player after they answer, in the
 * same way every other number in this product cites where it came from.
 *
 * Dates are chosen inside MODIS Terra's own record, which starts 2000-02-24,
 * and are pinned to a cloud-free-ish part of the dry season for that region
 * wherever the change is a water body, because a cloudy mosaic tells the
 * player nothing.
 */

export interface ChangeSite {
  id: string;
  /** Never shown before the answer — it would give the change away. */
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Zoom for the tile grid. 5–7 covers tens to hundreds of km. */
  zoom: number;
  before: string;
  after: string;
  /** The correct answer, and what the player picks from. */
  answer: string;
  /** Three wrong answers that are plausible for satellite imagery of anywhere. */
  distractors: [string, string, string];
  /** One or two honest sentences, shown on the reveal. */
  because: string;
  source: string;
  /** False colour makes vegetation and water separate far more clearly. */
  layer: "truecolor" | "falsecolor";
  /**
   * Set ONLY where the two dates are less than a year apart.
   *
   * The default rule is that a site's dates must straddle at least a year, so
   * that a player is not being shown a summer/winter difference and asked to
   * call it a change. This field is the escape hatch, and it has to carry the
   * argument for why the short interval is honest here. The test in
   * tests/unit/spotTheChange.test.ts refuses a short interval without one.
   */
  shortIntervalBecause?: string;
}

const COMMON_WRONG: string[] = [
  "A wildfire burned a very large area of bush",
  "A city expanded outwards across its farmland",
  "Snow and ice covered the whole area",
  "A river shifted and cut itself a new channel",
  "Cleared forest grew back over two decades",
  "A dust storm covered the whole region",
  "New land was built out into the sea",
  "Farmland was abandoned and went to scrub",
];

export const CHANGE_SITES: ChangeSite[] = [
  {
    id: "aral",
    name: "The Aral Sea",
    country: "Kazakhstan and Uzbekistan",
    lat: 45.0,
    lon: 59.6,
    zoom: 6,
    // 2001, not 2000: MODIS Terra's first months have real gaps, and
    // 2000-08-15 returns no tile at all for this area. Verified against the
    // live archive from a browser, not assumed. Same month either way, so the
    // two views are still the same point in the season.
    before: "2001-08-15",
    after: "2020-08-15",
    answer: "A large lake almost completely dried up",
    distractors: ["A reservoir was filled behind a newly built dam", "A wildfire burned a very large area of bush", "A city expanded outwards across its farmland"],
    because:
      "Soviet-era irrigation diverted the two rivers feeding it. The eastern lobe was gone by 2014. It is the change most often used to teach people what satellite imagery is for.",
    source: "NASA Earth Observatory, World Bank Aral Sea programme",
    layer: "truecolor",
  },
  {
    id: "urmia",
    name: "Lake Urmia",
    country: "Iran",
    lat: 37.6,
    lon: 45.5,
    zoom: 7,
    before: "2000-08-20",
    after: "2015-08-20",
    answer: "A large lake almost completely dried up",
    distractors: ["A reservoir was filled behind a newly built dam", "Snow and ice covered the whole area", "A river shifted and cut itself a new channel"],
    because:
      "Once the largest lake in the Middle East. Damming of its inflows plus drought and groundwater extraction took it to roughly a tenth of its area by 2015. It has partly recovered since.",
    source: "UNEP, Iranian Department of Environment",
    layer: "falsecolor",
  },
  {
    id: "poopo",
    name: "Lake Poopó",
    country: "Bolivia",
    lat: -18.8,
    lon: -67.1,
    zoom: 7,
    before: "2002-04-10",
    after: "2016-04-10",
    answer: "A large lake almost completely dried up",
    distractors: ["A wildfire burned a very large area of bush", "A reservoir was filled behind a newly built dam", "A dust storm covered the whole region"],
    because:
      "Bolivia's second largest lake was declared evaporated in December 2015, after mining and irrigation withdrawals combined with a strong El Niño. Thousands of people who fished it left.",
    source: "European Space Agency, Bolivian government declaration of 2015",
    layer: "truecolor",
  },
  {
    id: "rondonia",
    name: "Rondônia",
    country: "Brazil",
    lat: -10.5,
    lon: -62.5,
    zoom: 7,
    before: "2000-07-20",
    after: "2022-07-20",
    answer: "Rainforest was cleared in a fishbone pattern",
    distractors: ["Cleared forest grew back over two decades", "A large lake almost completely dried up", "Snow and ice covered the whole area"],
    because:
      "Roads are cut first, then side tracks, then the land between them is cleared. The result looks like a fish skeleton from orbit and is the signature of organised deforestation.",
    source: "Brazil's INPE PRODES deforestation monitoring",
    layer: "falsecolor",
  },
  {
    id: "santacruz",
    name: "Santa Cruz department",
    country: "Bolivia",
    lat: -16.8,
    lon: -62.3,
    zoom: 7,
    before: "2000-08-01",
    after: "2021-08-01",
    answer: "Forest was cleared in circles and squares",
    distractors: ["A wildfire burned a very large area of bush", "A city expanded outwards across its farmland", "A river shifted and cut itself a new channel"],
    because:
      "Planned agricultural settlement. Each radial 'pinwheel' is a community with houses at the centre and fields fanning out, which is why the clearing here looks nothing like Brazil's fishbone.",
    source: "NASA Earth Observatory, Bolivian INRA settlement programme",
    layer: "falsecolor",
  },
  {
    id: "threegorges",
    name: "The Three Gorges Reservoir",
    country: "China",
    lat: 30.9,
    lon: 110.5,
    zoom: 7,
    before: "2000-05-01",
    after: "2012-05-01",
    answer: "A river valley was flooded behind a new dam",
    distractors: ["A large lake almost completely dried up", "A city expanded outwards across its farmland", "Cleared forest grew back over two decades"],
    because:
      "The Three Gorges Dam closed in 2003 and the reservoir filled to its full level by 2010. A narrow river becomes a lake more than 600 km long. Around 1.3 million people were resettled.",
    source: "NASA Earth Observatory, China Three Gorges Corporation",
    layer: "truecolor",
  },
  {
    id: "toshka",
    name: "The Toshka Lakes",
    country: "Egypt",
    lat: 22.6,
    lon: 30.8,
    zoom: 7,
    before: "2002-03-01",
    after: "2012-03-01",
    answer: "Lakes appeared in the desert, then shrank",
    distractors: ["A city expanded outwards across its farmland", "A wildfire burned a very large area of bush", "Snow and ice covered the whole area"],
    because:
      "Water was pumped out of Lake Nasser into desert depressions from 1998, creating lakes where there had never been any. They then evaporated through the 2000s. They refilled again after 2020.",
    source: "NASA Earth Observatory Toshka Lakes series",
    layer: "truecolor",
  },
  {
    id: "marshes",
    name: "The Mesopotamian Marshes",
    country: "Iraq",
    lat: 31.0,
    lon: 47.0,
    zoom: 7,
    before: "2000-06-01",
    after: "2018-06-01",
    answer: "Drained wetlands were deliberately reflooded",
    distractors: ["A large lake almost completely dried up", "A reservoir was filled behind a newly built dam", "Farmland was abandoned and went to scrub"],
    because:
      "The marshes were drained in the early 1990s. Embankments were broken open from 2003 and much of the wetland returned. This is one of the few changes on this list that runs the good way.",
    source: "UNEP Iraqi Marshlands Observation System, UNESCO World Heritage listing 2016",
    layer: "falsecolor",
  },
  {
    id: "greatsalt",
    name: "The Great Salt Lake",
    country: "United States",
    lat: 41.1,
    lon: -112.5,
    zoom: 7,
    before: "2000-09-01",
    after: "2022-09-01",
    answer: "A large lake shrank and exposed its bed",
    distractors: ["A reservoir was filled behind a newly built dam", "A city expanded outwards across its farmland", "A dust storm covered the whole region"],
    because:
      "Water diverted upstream plus a long drought took it to its lowest recorded level in November 2022. The exposed lakebed is a dust source, which is why the shrinking is a public health story too.",
    source: "United States Geological Survey lake elevation record",
    layer: "truecolor",
  },
  {
    id: "poyang",
    name: "Poyang Lake",
    country: "China",
    lat: 29.1,
    lon: 116.3,
    zoom: 7,
    before: "2020-07-15",
    after: "2022-09-15",
    answer: "A lake shrank dramatically between seasons",
    distractors: ["A river shifted and cut itself a new channel", "Rainforest was cleared in a fishbone pattern", "New land was built out into the sea"],
    because:
      "China's largest freshwater lake swings hugely between the summer flood and the dry season, and the 2022 drought was the most severe on record. The two dates here are two years apart, not two decades.",
    source: "NASA Earth Observatory, China Ministry of Water Resources",
    layer: "truecolor",
  },
  {
    id: "salton",
    name: "The Salton Sea",
    country: "United States",
    lat: 33.3,
    lon: -115.8,
    zoom: 8,
    // 2002, not 2001, for the same reason as the Aral Sea above: the early
    // archive has holes and 2001-07-01 returns nothing here.
    before: "2002-07-01",
    after: "2021-07-01",
    answer: "A large lake shrank and exposed its bed",
    distractors: ["A reservoir was filled behind a newly built dam", "Cleared forest grew back over two decades", "A river shifted and cut itself a new channel"],
    because:
      "Created by accident in 1905 when the Colorado River broke into a dry basin. With farm runoff reduced and nothing else feeding it, it has been shrinking and getting saltier ever since.",
    source: "California Natural Resources Agency Salton Sea Management Program",
    layer: "truecolor",
  },
  {
    id: "australia-fires",
    name: "The south-east Australian bushfires",
    country: "Australia",
    lat: -36.4,
    lon: 149.2,
    zoom: 8,
    before: "2019-09-01",
    after: "2020-02-15",
    answer: "A wildfire burned a very large area of bush",
    distractors: ["Rainforest was cleared in a fishbone pattern", "A city expanded outwards across its farmland", "Drained wetlands were deliberately reflooded"],
    because:
      "The 2019 to 2020 Black Summer fires burned more than 24 million hectares nationally. In false colour a burn scar reads as dark red-brown against unburnt green.",
    source: "Australian Government Royal Commission into National Natural Disaster Arrangements, 2020",
    layer: "falsecolor",
    shortIntervalBecause:
      "Five months, deliberately: before the fire season and after it. A burn scar in false colour is a hard-edged dark red-brown area that seasonal change does not produce, so the short gap does not make the answer ambiguous — it is what makes the fire the only thing that differs.",
  },
];

/** Every distinct answer, used to check that no option list gives itself away. */
export function allAnswers(): string[] {
  return [...new Set([...CHANGE_SITES.map((s) => s.answer), ...COMMON_WRONG])];
}
