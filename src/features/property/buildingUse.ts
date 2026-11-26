import type { PropertyClassification } from "@/types/gis";

/**
 * How OpenStreetMap tags say what a building or a piece of land is used for.
 *
 * Pure and shared: the Property panel, the area report and the server's
 * Property agent all read tags through these functions, so one place decides
 * that `building=apartments` is residential everywhere. Tags are the same
 * worldwide, which is what lets this work for any coordinates on Earth.
 *
 * Only relative imports at runtime: the server compiles this file too.
 */

/** A single use. "Mixed Use" and "Unknown" are conclusions, not readings. */
export type Use = Exclude<PropertyClassification, "Mixed Use" | "Unknown">;

export interface UseReading {
  use: Use;
  /** Plain words for what the tag says: "office building", "pharmacy". */
  kind: string;
  /** The tag that said it, to show the reader: "building=office". */
  tag: string;
}

const BUILDING_TYPES: Record<string, [Use, string]> = {
  // Homes
  residential: ["Residential", "residential building"],
  house: ["Residential", "house"],
  detached: ["Residential", "detached house"],
  semidetached_house: ["Residential", "semi-detached house"],
  terrace: ["Residential", "row of terraced houses"],
  apartments: ["Residential", "apartment building"],
  bungalow: ["Residential", "bungalow"],
  dormitory: ["Residential", "dormitory"],
  farm: ["Residential", "farmhouse"],
  cabin: ["Residential", "cabin"],
  houseboat: ["Residential", "houseboat"],
  static_caravan: ["Residential", "static caravan"],
  villa: ["Residential", "villa"],
  // Business
  commercial: ["Commercial", "commercial building"],
  office: ["Commercial", "office building"],
  retail: ["Commercial", "retail building"],
  supermarket: ["Commercial", "supermarket"],
  kiosk: ["Commercial", "kiosk"],
  shop: ["Commercial", "shop building"],
  hotel: ["Commercial", "hotel"],
  mall: ["Commercial", "shopping mall"],
  // Industry
  industrial: ["Industrial", "industrial building"],
  warehouse: ["Industrial", "warehouse"],
  factory: ["Industrial", "factory"],
  manufacture: ["Industrial", "manufacturing building"],
  depot: ["Industrial", "depot"],
  // Public and community
  school: ["Institutional", "school building"],
  college: ["Institutional", "college building"],
  university: ["Institutional", "university building"],
  kindergarten: ["Institutional", "kindergarten"],
  hospital: ["Institutional", "hospital building"],
  government: ["Institutional", "government building"],
  civic: ["Institutional", "civic building"],
  public: ["Institutional", "public building"],
  townhall: ["Institutional", "town hall"],
  fire_station: ["Institutional", "fire station"],
  church: ["Institutional", "church"],
  chapel: ["Institutional", "chapel"],
  cathedral: ["Institutional", "cathedral"],
  mosque: ["Institutional", "mosque"],
  temple: ["Institutional", "temple"],
  synagogue: ["Institutional", "synagogue"],
  shrine: ["Institutional", "shrine"],
  monastery: ["Institutional", "monastery"],
  religious: ["Institutional", "religious building"],
  // Transport
  train_station: ["Transport", "train station"],
  transportation: ["Transport", "transport building"],
};

/**
 * Building values that describe a structure, not a use: `yes` (by far the
 * commonest worldwide), garages, roofs, ruins, a site under construction.
 * The building's use has to come from somewhere else.
 */
const STRUCTURE_ONLY: Record<string, string> = {
  yes: "building",
  roof: "roof or canopy",
  construction: "building under construction",
  garage: "garage",
  garages: "garages",
  carport: "carport",
  parking: "parking structure",
  shed: "shed",
  hut: "hut",
  ruins: "ruin",
  service: "service building",
  container: "container",
  greenhouse: "greenhouse",
  barn: "barn",
  stadium: "stadium",
  sports_hall: "sports hall",
};

const BUILDING_USE: Record<string, [Use, string]> = {
  residential: ["Residential", "residential use"],
  commercial: ["Commercial", "commercial use"],
  retail: ["Commercial", "retail use"],
  office: ["Commercial", "office use"],
  industrial: ["Industrial", "industrial use"],
  education: ["Institutional", "education"],
  civic: ["Institutional", "civic use"],
  religious: ["Institutional", "religious use"],
};

/** Amenities that are a business occupying a building (not benches, bins, parking or an ATM on a wall). */
const BUSINESS_AMENITIES = new Set([
  "restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "biergarten", "ice_cream",
  "bank", "bureau_de_change", "money_transfer", "pharmacy", "marketplace", "fuel",
  "car_wash", "car_rental", "cinema", "theatre", "nightclub", "casino", "internet_cafe",
  "coworking_space", "dentist", "doctors", "clinic", "veterinary", "driving_school",
]);
const PUBLIC_AMENITIES = new Set([
  "school", "college", "university", "kindergarten", "hospital", "place_of_worship", "police",
  "townhall", "courthouse", "fire_station", "library", "community_centre", "social_facility",
  "prison", "post_office", "public_building", "arts_centre",
]);
const LODGING = new Set(["hotel", "hostel", "guest_house", "motel", "apartment", "chalet"]);
const VISITOR_SITES = new Set(["museum", "gallery", "attraction", "theme_park", "zoo", "aquarium"]);
const LANDMARK_HISTORIC = new Set(["castle", "fort", "palace", "monument", "memorial", "ruins", "archaeological_site", "city_gate", "tower"]);

const words = (value: string) => value.replace(/_/g, " ");

/** What the building's own type says, from building=* or building:use=*. Null for "yes" and other bare structures. */
export function readBuildingType(tags: Record<string, string>): UseReading | null {
  const use = tags["building:use"];
  if (use && BUILDING_USE[use]) {
    const [u, kind] = BUILDING_USE[use]!;
    return { use: u, kind: `building in ${kind}`, tag: `building:use=${use}` };
  }
  const value = tags.building;
  if (value && BUILDING_TYPES[value]) {
    const [u, kind] = BUILDING_TYPES[value]!;
    return { use: u, kind, tag: `building=${value}` };
  }
  return null;
}

/** Plain words for a building with no use in its type: "building", "garage", "building under construction". */
export function structureKind(tags: Record<string, string>): string {
  const value = tags.building ?? "yes";
  return BUILDING_TYPES[value]?.[1] ?? STRUCTURE_ONLY[value] ?? `${words(value)} building`;
}

/** What a business or facility tag says: on a building itself, or on a point mapped inside one. */
export function readBusiness(tags: Record<string, string>): UseReading | null {
  if (tags.shop) return { use: "Commercial", kind: tags.shop === "yes" ? "shop" : `${words(tags.shop)} shop`, tag: `shop=${tags.shop}` };
  if (tags.office) {
    if (tags.office === "government" || tags.office === "diplomatic") return { use: "Institutional", kind: `${words(tags.office)} office`, tag: `office=${tags.office}` };
    return { use: "Commercial", kind: tags.office === "yes" ? "office" : `${words(tags.office)} office`, tag: `office=${tags.office}` };
  }
  if (tags.amenity && PUBLIC_AMENITIES.has(tags.amenity)) return { use: "Institutional", kind: words(tags.amenity), tag: `amenity=${tags.amenity}` };
  if (tags.amenity && BUSINESS_AMENITIES.has(tags.amenity)) return { use: "Commercial", kind: words(tags.amenity), tag: `amenity=${tags.amenity}` };
  if (tags.amenity === "bus_station") return { use: "Transport", kind: "bus station", tag: "amenity=bus_station" };
  if (tags.healthcare) {
    if (tags.healthcare === "hospital") return { use: "Institutional", kind: "hospital", tag: "healthcare=hospital" };
    return { use: "Commercial", kind: words(tags.healthcare), tag: `healthcare=${tags.healthcare}` };
  }
  if (tags.tourism && LODGING.has(tags.tourism)) return { use: "Commercial", kind: words(tags.tourism), tag: `tourism=${tags.tourism}` };
  if (tags.tourism && VISITOR_SITES.has(tags.tourism)) return { use: "Landmark", kind: words(tags.tourism), tag: `tourism=${tags.tourism}` };
  if (tags.historic && LANDMARK_HISTORIC.has(tags.historic)) return { use: "Landmark", kind: `historic ${words(tags.historic)}`, tag: `historic=${tags.historic}` };
  if (tags.craft) return { use: "Commercial", kind: `${words(tags.craft)} workshop`, tag: `craft=${tags.craft}` };
  if (tags.leisure === "fitness_centre" || tags.leisure === "sports_centre") return { use: "Commercial", kind: words(tags.leisure), tag: `leisure=${tags.leisure}` };
  if (tags.railway === "station" || tags.public_transport === "station") return { use: "Transport", kind: "station", tag: tags.railway === "station" ? "railway=station" : "public_transport=station" };
  return null;
}

/** What an area containing the point says about the land: a campus, a site, or a land-use zone. */
export function readArea(tags: Record<string, string>): (UseReading & { campus: boolean }) | null {
  const business = readBusiness(tags);
  // A school or hospital mapped as an area is its campus: more specific than a zone.
  if (business) return { ...business, kind: `${business.kind} site`, campus: true };
  switch (tags.landuse) {
    case "residential":
      return { use: "Residential", kind: "residential land", tag: "landuse=residential", campus: false };
    case "commercial":
    case "retail":
      return { use: "Commercial", kind: `${tags.landuse} land`, tag: `landuse=${tags.landuse}`, campus: false };
    case "industrial":
    case "port":
      return { use: "Industrial", kind: `${tags.landuse} land`, tag: `landuse=${tags.landuse}`, campus: false };
    case "education":
    case "institutional":
    case "religious":
    case "military":
      return { use: "Institutional", kind: `${tags.landuse} land`, tag: `landuse=${tags.landuse}`, campus: false };
    case "railway":
      return { use: "Transport", kind: "railway land", tag: "landuse=railway", campus: false };
    case "cemetery":
      return { use: "Institutional", kind: "cemetery", tag: "landuse=cemetery", campus: false };
  }
  if (tags.landuse && AGRICULTURAL_LANDUSE.has(tags.landuse)) {
    return { use: "Agricultural", kind: words(tags.landuse), tag: `landuse=${tags.landuse}`, campus: false };
  }
  if (tags.landuse && OPEN_LANDUSE.has(tags.landuse)) {
    return { use: "Open Space", kind: tags.landuse === "grass" ? "grass" : `${words(tags.landuse)} land`, tag: `landuse=${tags.landuse}`, campus: false };
  }
  if (tags.leisure && OPEN_LEISURE.has(tags.leisure)) {
    return { use: "Open Space", kind: words(tags.leisure), tag: `leisure=${tags.leisure}`, campus: false };
  }
  if (tags.aeroway === "aerodrome") return { use: "Transport", kind: "airport", tag: "aeroway=aerodrome", campus: true };
  if (tags.military) return { use: "Institutional", kind: "military area", tag: `military=${tags.military}`, campus: true };
  return null;
}

/*
  Land with no buildings to speak of. Without these, a tap on a park or a
  field read "Unknown" even where the map says plainly what the land is; the
  tap near Malakpet on 26 November 2026 was inside landuse=farmland.
  Tracks and stadiums are left out: they are facilities, not open land.
*/
const AGRICULTURAL_LANDUSE = new Set([
  "farmland", "farmyard", "orchard", "vineyard", "meadow", "plant_nursery", "greenhouse_horticulture", "aquaculture", "animal_keeping",
]);
const OPEN_LANDUSE = new Set(["recreation_ground", "village_green", "grass", "forest"]);
const OPEN_LEISURE = new Set([
  "park", "garden", "playground", "pitch", "recreation_ground", "nature_reserve", "common", "dog_park", "golf_course",
]);

/*
  Names, as the weakest reading. Only words that are rarely ambiguous, and no
  answer at all when a name points two ways ("School Lane Apartments").
  "Tower", "Plaza", "Complex" and "Heights" are left out on purpose: each is
  as often homes as offices.
*/
const NAME_PATTERNS: Array<[Use, RegExp]> = [
  ["Residential", /\b(apartments?|residency|residences|residential|enclave|homes|villas?|flats|condominiums?|condos?|housing society)\b/i],
  ["Commercial", /\b(tech ?park|it park|business park|business cent(?:re|er)|corporate|offices?|mall|hotel|sez|software)\b/i],
  ["Industrial", /\b(factory|industries|industrial estate|warehouse|godown|manufacturing)\b/i],
  ["Institutional", /\b(school|college|university|institute|hospital|temple|church|mosque|masjid|gurudwara|police station|court|municipal|ministry|library)\b/i],
];

export function readName(name: string | undefined): UseReading | null {
  if (!name) return null;
  const hits = NAME_PATTERNS.filter(([, pattern]) => pattern.test(name));
  if (hits.length !== 1) return null;
  const [use, pattern] = hits[0]!;
  return { use, kind: `"${name.match(pattern)![0]}" in its name`, tag: "name" };
}

const METRES_PER_FLOOR = 3.2;

/** Metres from a height tag: "28.8", "28.8 m", "95 ft", "95'". Null when it cannot be read. */
export function parseHeight(raw: string | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  const feet = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"))?$/.exec(text);
  if (feet) return Number(feet[1]) * 0.3048 + (feet[2] ? Number(feet[2]) * 0.0254 : 0);
  const metres = /^(\d+(?:\.\d+)?)\s*(?:m|metres|meters)?$/.exec(text);
  if (metres) return Number(metres[1]);
  return null;
}

/**
 * The building's height and floors, and how each is known. A mapped height
 * wins. Otherwise floors x 3.2 m, the same figure the 3D view uses, said as
 * worked out rather than measured. Otherwise nothing, rather than a guess
 * from the building type.
 */
export function heightFromTags(tags: Record<string, string>): { meters: number | null; source: "mapped" | "floors" | null; levels: number | null } {
  const levelsRaw = Number(tags["building:levels"]);
  const levels = Number.isFinite(levelsRaw) && levelsRaw > 0 ? Math.round(levelsRaw * 10) / 10 : null;
  const mapped = parseHeight(tags.height ?? tags["building:height"]);
  if (mapped !== null && mapped > 0 && mapped < 1000) return { meters: Math.round(mapped * 10) / 10, source: "mapped", levels };
  if (levels !== null) return { meters: Math.round(levels * METRES_PER_FLOOR * 10) / 10, source: "floors", levels };
  return { meters: null, source: null, levels: null };
}

/** "12, Main Road" from the address tags, when mapped. */
export function addressFromTags(tags: Record<string, string>): string | undefined {
  const street = tags["addr:street"] ?? tags["addr:place"];
  const parts = [tags["addr:housenumber"], street].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** "a" or "an", for the kinds above. */
export function article(kind: string): string {
  return /^[aeiou]/i.test(kind) ? "an" : "a";
}
