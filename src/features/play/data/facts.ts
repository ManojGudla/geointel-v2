/**
 * The claim bank behind Impossible or Real and The Impostor.
 *
 * ── Why every entry carries a source ──────────────────────────────────────
 *
 * This product's entire position is that what it tells you is traceable. A
 * trivia game inside it that confidently asserts unsourced facts would
 * quietly undermine that everywhere else - a visitor who catches one wrong
 * "fact" here has no reason to trust the population figure on the map either.
 *
 * So `source` is a required field, not an optional nicety, and a test fails
 * the build if any entry is missing one. The source is shown to the player on
 * the reveal, which also turns the moment of being wrong into the moment of
 * learning something, rather than just being told off.
 *
 * ── The selection rule ────────────────────────────────────────────────────
 *
 * Only claims that are settled and checkable. Nothing that turns on a
 * definition people argue about, nothing that changes year to year, nothing
 * that needs a caveat longer than the claim. A game whose answers can be
 * argued with is a game that generates complaints instead of shares.
 *
 * The FALSE entries are deliberately the kind of thing people half-remember
 * as true. A false statement nobody would ever believe is a wasted question -
 * it makes the round easier without making it more interesting.
 */

export type FactTopic = "geography" | "space" | "nature" | "science" | "human";

export interface Fact {
  id: string;
  /** Stated as a claim, so it reads identically whether true or false. */
  claim: string;
  /** Is the claim as written true? */
  isTrue: boolean;
  /** Shown on the reveal. Explains the answer rather than repeating it. */
  because: string;
  /** Where the answer comes from. Required. */
  source: string;
  topic: FactTopic;
  /**
   * 1 = most people get this, 3 = most people get this wrong.
   * Used to mix a round rather than deal five impossible ones in a row.
   */
  difficulty: 1 | 2 | 3;
}

export const FACTS: Fact[] = [
  // ── Space ───────────────────────────────────────────────────────────────
  {
    id: "venus-day",
    claim: "A day on Venus is longer than a year on Venus.",
    isTrue: true,
    because:
      "Venus turns on its axis once every 243 Earth days but completes an orbit in about 225, so its rotation outlasts its year.",
    source: "NASA planetary fact sheet",
    topic: "space",
    difficulty: 2,
  },
  {
    id: "moon-drift",
    claim: "The Moon is slowly moving away from Earth.",
    isTrue: true,
    because: "Tidal interaction transfers energy to the Moon's orbit, moving it out by roughly 3.8 cm a year.",
    source: "Lunar laser ranging measurements, NASA",
    topic: "space",
    difficulty: 2,
  },
  {
    id: "sun-mass",
    claim: "The Sun makes up more than 99% of the mass of the Solar System.",
    isTrue: true,
    because: "Every planet, moon, asteroid and comet combined accounts for well under one percent of the total.",
    source: "NASA Solar System overview",
    topic: "space",
    difficulty: 1,
  },
  {
    id: "mercury-hottest",
    claim: "Mercury is the hottest planet in the Solar System.",
    isTrue: false,
    because:
      "Venus is hotter. Mercury is closer to the Sun, but Venus has a thick carbon dioxide atmosphere that traps heat, holding it near 460°C.",
    source: "NASA planetary fact sheet",
    topic: "space",
    difficulty: 2,
  },
  {
    id: "space-silent",
    claim: "Sound cannot travel through the vacuum of space.",
    isTrue: true,
    because: "Sound needs a medium to carry pressure waves, and a vacuum has almost no particles to carry them.",
    source: "Basic acoustics",
    topic: "space",
    difficulty: 1,
  },
  {
    id: "great-wall-space",
    claim: "The Great Wall of China is the only man-made object visible from space with the naked eye.",
    isTrue: false,
    because:
      "It is not reliably visible from low Earth orbit at all. It is narrow and the same colour as the ground around it. Astronauts have said so repeatedly.",
    source: "NASA Earth Observatory",
    topic: "space",
    difficulty: 1,
  },
  {
    id: "saturn-float",
    claim: "Saturn is less dense than water.",
    isTrue: true,
    because: "Its average density is about 0.69 g/cm³, below water's 1.0, because it is mostly hydrogen and helium.",
    source: "NASA planetary fact sheet",
    topic: "space",
    difficulty: 2,
  },
  {
    id: "jupiter-moons",
    claim: "Jupiter has more known moons than Earth has continents.",
    isTrue: true,
    because: "Jupiter has dozens of confirmed moons; Earth has seven continents by the usual count.",
    source: "NASA Jupiter moons catalogue",
    topic: "space",
    difficulty: 1,
  },

  // ── Geography ───────────────────────────────────────────────────────────
  {
    id: "antarctica-desert",
    claim: "Antarctica is a desert.",
    isTrue: true,
    because: "A desert is defined by how little precipitation it receives, not by temperature. Antarctica gets very little.",
    source: "Standard climate classification",
    topic: "geography",
    difficulty: 2,
  },
  {
    id: "sahara-india",
    claim: "The Sahara is larger than India.",
    isTrue: true,
    because: "The Sahara covers roughly 9.2 million km²; India covers about 3.29 million km².",
    source: "Encyclopaedia Britannica; Survey of India",
    topic: "geography",
    difficulty: 1,
  },
  {
    id: "tokyo-rome",
    claim: "Tokyo is further north than Rome.",
    isTrue: false,
    because: "Tokyo sits at about 35.7°N, Rome at about 41.9°N, so Rome is the more northerly of the two.",
    source: "Coordinates, both cities",
    topic: "geography",
    difficulty: 3,
  },
  {
    id: "africa-largest-country",
    claim: "Russia is larger than the entire continent of Antarctica.",
    isTrue: true,
    because: "Russia covers about 17.1 million km², Antarctica about 14.2 million.",
    source: "CIA World Factbook",
    topic: "geography",
    difficulty: 2,
  },
  {
    id: "nile-longest",
    claim: "Every country in South America is in the southern hemisphere.",
    isTrue: false,
    because:
      "Colombia, Venezuela, Guyana, Suriname and Ecuador all extend north of the equator, and much of Brazil's north does too.",
    source: "World atlas",
    topic: "geography",
    difficulty: 2,
  },
  {
    id: "dead-sea",
    claim: "The shore of the Dead Sea is the lowest land surface on Earth.",
    isTrue: true,
    because: "Its shore sits more than 400 metres below sea level, lower than any other exposed land.",
    source: "Geological Survey of Israel",
    topic: "geography",
    difficulty: 1,
  },
  {
    id: "istanbul-continents",
    claim: "Istanbul lies on two continents.",
    isTrue: true,
    because: "The Bosphorus strait runs through the city, putting part of it in Europe and part in Asia.",
    source: "World atlas",
    topic: "geography",
    difficulty: 1,
  },
  {
    id: "africa-equator",
    claim: "Africa is the only continent crossed by both the equator and both tropics.",
    isTrue: true,
    because: "The equator, the Tropic of Cancer and the Tropic of Capricorn all pass through the African continent.",
    source: "World atlas",
    topic: "geography",
    difficulty: 3,
  },
  {
    id: "australia-wider",
    claim: "Australia is wider than the Moon's diameter.",
    isTrue: true,
    because: "Australia measures about 4,000 km east to west; the Moon is about 3,475 km across.",
    source: "Geoscience Australia; NASA",
    topic: "geography",
    difficulty: 3,
  },
  {
    id: "mount-everest-tallest",
    claim: "Mount Everest is the tallest mountain on Earth measured from its own base.",
    isTrue: false,
    because:
      "Everest is the highest above sea level, but Mauna Kea rises further from its base. Most of it is under the ocean.",
    source: "USGS",
    topic: "geography",
    difficulty: 2,
  },
  {
    id: "canada-lakes",
    claim: "Canada has more lakes than the rest of the world combined.",
    isTrue: true,
    because: "Canada holds the majority of the world's natural lakes, a legacy of glaciation.",
    source: "Natural Resources Canada",
    topic: "geography",
    difficulty: 2,
  },
  {
    id: "alaska-widest",
    claim: "Alaska is both the westernmost and the easternmost state of the United States.",
    isTrue: true,
    because: "The Aleutian Islands cross the 180th meridian, putting part of Alaska in the eastern hemisphere.",
    source: "US Geological Survey",
    topic: "geography",
    difficulty: 3,
  },
  {
    id: "pacific-largest",
    claim: "The Pacific Ocean covers more of Earth's surface than all land combined.",
    isTrue: true,
    because: "The Pacific spans about 165 million km²; total land area is about 149 million km².",
    source: "NOAA",
    topic: "geography",
    difficulty: 2,
  },

  // ── Nature ──────────────────────────────────────────────────────────────
  {
    id: "sharks-mammals",
    claim: "Sharks are mammals.",
    isTrue: false,
    because: "Sharks are fish. They have gills, are cold-blooded and do not produce milk.",
    source: "Standard zoological classification",
    topic: "nature",
    difficulty: 1,
  },
  {
    id: "bananas-berries",
    claim: "Bananas are berries, botanically speaking.",
    isTrue: true,
    because: "A berry develops from a single flower with one ovary and has seeds inside the flesh. Bananas qualify; strawberries do not.",
    source: "Botanical definition of a berry",
    topic: "nature",
    difficulty: 2,
  },
  {
    id: "octopus-hearts",
    claim: "An octopus has three hearts.",
    isTrue: true,
    because: "Two pump blood through the gills and one pumps it around the rest of the body.",
    source: "Marine biology reference",
    topic: "nature",
    difficulty: 2,
  },
  {
    id: "goldfish-memory",
    claim: "A goldfish has a memory of only three seconds.",
    isTrue: false,
    because: "Goldfish have been trained to remember tasks for months. The three-second claim has no research behind it.",
    source: "Behavioural studies, Plymouth University",
    topic: "nature",
    difficulty: 1,
  },
  {
    id: "bat-blind",
    claim: "All bats are blind.",
    isTrue: false,
    because: "Every bat species can see. Many also use echolocation, but that supplements sight rather than replacing it.",
    source: "Bat Conservation International",
    topic: "nature",
    difficulty: 1,
  },
  {
    id: "honey-spoil",
    claim: "Honey can remain edible for thousands of years.",
    isTrue: true,
    because: "Its low water content and high acidity stop bacteria growing. Edible honey has been found in ancient tombs.",
    source: "Smithsonian Magazine; food chemistry",
    topic: "nature",
    difficulty: 2,
  },
  {
    id: "penguins-north",
    claim: "No penguin species lives in the wild in the northern hemisphere.",
    isTrue: false,
    because: "The Galápagos penguin lives on islands that straddle the equator, and part of its range is just north of it.",
    source: "IUCN species range data",
    topic: "nature",
    difficulty: 3,
  },
  {
    id: "trees-amazon",
    claim: "There are more trees on Earth than stars in the Milky Way.",
    isTrue: true,
    because: "Earth has roughly three trillion trees; the Milky Way holds an estimated 100 to 400 billion stars.",
    source: "Crowther et al., Nature (2015); NASA",
    topic: "nature",
    difficulty: 3,
  },
  {
    id: "sloth-digest",
    claim: "A sloth can take weeks to digest a single meal.",
    isTrue: true,
    because: "Their metabolism is extremely slow and leaves are hard to break down, so digestion can take a fortnight or more.",
    source: "Zoological research on Bradypus",
    topic: "nature",
    difficulty: 2,
  },
  {
    id: "elephant-jump",
    claim: "Elephants are the only mammal that cannot jump.",
    isTrue: true,
    because: "Their weight and leg structure mean they always keep at least one foot on the ground.",
    source: "Comparative anatomy references",
    topic: "nature",
    difficulty: 2,
  },
  {
    id: "camel-water",
    claim: "A camel's hump stores water.",
    isTrue: false,
    because: "The hump stores fat, not water. Camels survive dry spells through efficient kidneys and tolerance of dehydration.",
    source: "Veterinary physiology references",
    topic: "nature",
    difficulty: 2,
  },

  // ── Science and physics ─────────────────────────────────────────────────
  {
    id: "lightning-sun",
    claim: "A lightning bolt can be hotter than the surface of the Sun.",
    isTrue: true,
    because: "Lightning can reach around 30,000 K; the Sun's visible surface is about 5,800 K.",
    source: "NOAA National Severe Storms Laboratory",
    topic: "science",
    difficulty: 2,
  },
  {
    id: "steel-feathers",
    claim: "A kilogram of steel weighs more than a kilogram of feathers.",
    isTrue: false,
    because: "A kilogram is a kilogram. The steel takes up far less space, which is what makes it feel heavier.",
    source: "Definition of mass",
    difficulty: 1,
    topic: "science",
  },
  {
    id: "water-boils",
    claim: "Water boils at a lower temperature at high altitude.",
    isTrue: true,
    because: "Lower air pressure means less energy is needed for vapour to escape, so boiling happens below 100°C.",
    source: "Thermodynamics",
    topic: "science",
    difficulty: 1,
  },
  {
    id: "glass-liquid",
    claim: "Glass in old windows is thicker at the bottom because glass slowly flows like a liquid.",
    isTrue: false,
    because:
      "Glass is an amorphous solid and does not flow at room temperature. Old panes vary in thickness because of how they were made.",
    source: "Materials science literature",
    topic: "science",
    difficulty: 3,
  },
  {
    id: "light-speed",
    claim: "Nothing can travel faster than light in a vacuum.",
    isTrue: true,
    because: "The speed of light in vacuum is the upper limit for the transfer of matter, energy or information.",
    source: "Special relativity",
    topic: "science",
    difficulty: 1,
  },
  {
    id: "diamond-hardest",
    claim: "Diamond is the hardest naturally occurring material.",
    isTrue: true,
    because: "It sits at the top of the Mohs scale; nothing found in nature scratches it.",
    source: "Mohs hardness scale",
    topic: "science",
    difficulty: 1,
  },
  {
    id: "gold-seawater",
    claim: "There is gold dissolved in the world's oceans.",
    isTrue: true,
    because: "Seawater contains gold at extremely low concentration, far too dilute to extract profitably.",
    source: "NOAA Ocean Facts",
    topic: "science",
    difficulty: 2,
  },
  {
    id: "helium-runs-out",
    claim: "Helium is a finite resource on Earth that can escape into space once released.",
    isTrue: true,
    because: "Helium is light enough to escape the atmosphere entirely, so released helium is effectively lost.",
    source: "US Geological Survey",
    topic: "science",
    difficulty: 2,
  },
  {
    id: "microwave-inside-out",
    claim: "Microwave ovens heat food from the inside out.",
    isTrue: false,
    because: "Microwaves penetrate a few centimetres and heat the outer layers first; the centre warms by conduction.",
    source: "Food physics references",
    topic: "science",
    difficulty: 2,
  },
  {
    id: "sound-water",
    claim: "Sound travels faster through water than through air.",
    isTrue: true,
    because: "Water is denser and less compressible, so pressure waves move through it roughly four times faster.",
    source: "Acoustics reference tables",
    topic: "science",
    difficulty: 2,
  },

  // ── Human body and history ──────────────────────────────────────────────
  {
    id: "brain-ten-percent",
    claim: "Humans only use ten percent of their brains.",
    isTrue: false,
    because: "Brain imaging shows activity across virtually the whole brain over the course of a day. The claim has no basis.",
    source: "Neuroscience imaging studies",
    topic: "human",
    difficulty: 1,
  },
  {
    id: "bones-baby",
    claim: "A newborn baby has more bones than an adult.",
    isTrue: true,
    because: "Babies are born with around 300 bones; many fuse during growth, leaving 206 in an adult.",
    source: "Human anatomy references",
    topic: "human",
    difficulty: 2,
  },
  {
    id: "tongue-map",
    claim: "Different parts of the tongue detect different tastes.",
    isTrue: false,
    because: "The tongue map is a misreading of a 1901 paper. Taste receptors for all basic tastes are spread across the tongue.",
    source: "Sensory science literature",
    topic: "human",
    difficulty: 2,
  },
  {
    id: "stomach-acid",
    claim: "Stomach acid is strong enough to damage metal.",
    isTrue: true,
    because: "Gastric acid is around pH 1.5 to 3.5, acidic enough to corrode some metals.",
    source: "Human physiology references",
    topic: "human",
    difficulty: 2,
  },
  {
    id: "fingerprints-unique",
    claim: "Koalas have fingerprints almost indistinguishable from human ones.",
    isTrue: true,
    because: "Koala fingerprints are so similar that they have been confused with human prints under a microscope.",
    source: "Henneberg et al., Natural History (1997)",
    topic: "human",
    difficulty: 3,
  },
  {
    id: "oxford-pyramids",
    claim: "Oxford University is older than the Aztec Empire.",
    isTrue: true,
    because: "Teaching at Oxford began by 1096; the Aztec Empire was founded in 1428.",
    source: "University of Oxford; historical record",
    topic: "human",
    difficulty: 3,
  },
  {
    id: "cleopatra-pyramids",
    claim: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
    isTrue: true,
    because: "The Great Pyramid was built around 2560 BC, Cleopatra died in 30 BC, and the Moon landing was 1969.",
    source: "Historical chronology",
    topic: "human",
    difficulty: 3,
  },
  {
    id: "eiffel-height",
    claim: "The Eiffel Tower can be more than 15 cm taller in summer than in winter.",
    isTrue: true,
    because: "Iron expands when heated, so the structure grows measurably in hot weather.",
    source: "Société d'Exploitation de la Tour Eiffel",
    topic: "human",
    difficulty: 3,
  },
  {
    id: "vikings-horns",
    claim: "Viking warriors wore horned helmets in battle.",
    isTrue: false,
    because: "No horned helmet has been found in a Viking warrior grave. The image comes from 19th-century opera costume design.",
    source: "National Museum of Denmark",
    topic: "human",
    difficulty: 2,
  },
];

export function factsByTruth(isTrue: boolean): Fact[] {
  return FACTS.filter((f) => f.isTrue === isTrue);
}
