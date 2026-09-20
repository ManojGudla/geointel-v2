import type { NearbyCategory } from "@/types/intel";

/**
 * Turns a plain-language question into a spatial operation the app can
 * actually run.
 *
 * Why a hand-written parser and not just the language model. Two reasons,
 * both practical:
 *
 *  1. Quota. The AI provider's free tier allows fifty requests a day across
 *     the whole application. If every "hospitals within 5 km" spent one,
 *     the feature would stop working partway through a demo - which is the
 *     worst possible moment for it to stop working.
 *  2. Determinism. "Nearest hospital" has exactly one correct
 *     interpretation. Sending it to a language model to find that out adds
 *     a second of latency and a small chance of a different answer each
 *     time, in exchange for nothing.
 *
 * So the common shapes are parsed here, for free and instantly, and
 * anything this cannot parse falls through to the model (see
 * useMapCommand.ts). The model's job there is only to pick an operation and
 * its parameters - it never produces the numbers. Every figure the user
 * sees comes from a real query against real data.
 */

export type MapCommand =
  | { operation: "within"; category: NearbyCategory; radiusMeters: number }
  | { operation: "nearest"; category: NearbyCategory }
  | { operation: "buffer"; radiusMeters: number }
  | { operation: "suitability"; presetId: string; radiusMeters: number };

/**
 * Longest phrases first: "public transport" has to be tested before
 * "transport", and "petrol station" before "station", or the shorter match
 * wins and the category is wrong.
 */
const CATEGORY_WORDS: Array<[RegExp, NearbyCategory]> = [
  [/\bpublic transports?\b|\bbus stops?\b|\bmetro stations?\b|\btrain stations?\b|\brailway stations?\b|\btransit\b|\bmetros?\b/, "publicTransport"],
  [/\bpetrol pumps?\b|\bpetrol stations?\b|\bgas stations?\b|\bfuel stations?\b|\bpetrol\b|\bfuel\b|\bgas\b/, "petrol"],
  [/\bhospitals?\b|\bclinics?\b|\bnursing homes?\b/, "hospitals"],
  [/\bpharmacies\b|\bpharmacy\b|\bchemists?\b|\bmedical stores?\b|\bdrug ?stores?\b/, "pharmacies"],
  [/\bschools?\b|\bcolleges?\b/, "schools"],
  [/\bpolice stations?\b|\bpolice\b/, "police"],
  [/\bbanks?\b/, "banks"],
  [/\batms?\b|\bcash machines?\b/, "atms"],
  [/\brestaurants?\b|\bplaces to eat\b|\beateries\b|\bfood\b/, "restaurants"],
  [/\bcaf[eé]s?\b|\bcoffee\b/, "cafes"],
  [/\bhotels?\b|\bguest ?houses?\b|\bplaces to stay\b|\blodging\b/, "hotels"],
  [/\bshops?\b|\bstores?\b|\bshopping\b|\bmarkets?\b|\bsupermarkets?\b|\bmalls?\b|\bretail\b/, "shopping"],
  [/\bparks?\b|\bgardens?\b|\bgreen spaces?\b/, "parks"],
];

/**
 * Words that mean "this is a question about the area", not a place name.
 *
 * This gate exists because of a real, damaging bug. A bare category word
 * ANYWHERE in the string used to be enough to treat the whole query as a
 * spatial command, and Indian place names are full of those words. Running the
 * real matcher over 28 ordinary Hyderabad addresses, 23 were hijacked:
 *
 *   "Bank Colony"        -> a 2 km ring of banks
 *   "Police Lines"       -> a ring of police stations
 *   "Gas Colony"         -> petrol pumps
 *   "Monda Market"       -> shops
 *   "Green Park Colony"  -> parks
 *   "School Road"        -> schools
 *   "Ameerpet Metro Station" -> transit
 *
 * A user typing their own address pressed Enter, and instead of going there
 * the app jumped to the Analyse panel and drew a circle of banks around the
 * middle of the map. Their address was never searched for. That is a large
 * part of why people reported that search "is not showing" anything.
 *
 * So a category word alone is no longer enough. There has to be an actual
 * question: a proximity word, a distance, or a query that is nothing BUT the
 * category ("hospitals", "atms"), which nobody types as an address.
 */
const INTENT_WORDS =
  /\bnear(?:by|est)?\b|\bwithin\b|\baround\b|\bclosest\b|\bfind\b|\bshow\b|\bwhere\b|\bhow many\b|\bhow much\b|\blist\b|\bclose to\b|\bnext to\b|\bwalking distance\b|\bis this a good\b|\bsuitab/;

function hasSpatialIntent(text: string, distance: number | null): boolean {
  if (INTENT_WORDS.test(text)) return true;
  if (distance !== null) return true;
  // The whole query IS the category - "hospitals", "petrol pumps", "atms".
  // Nobody types that as an address, and it is the shortest useful command.
  const bare = CATEGORY_WORDS.reduce((rest, [pattern]) => rest.replace(pattern, " "), text)
    .replace(/[^a-z]/g, "")
    .trim();
  return bare.length === 0;
}

const FACILITY_WORDS: Array<[RegExp, string]> = [
  [/\bhospitals?\b|\bclinics?\b|\bhealth ?care\b/, "hospital"],
  [/\bschools?\b|\bcolleges?\b/, "school"],
  [/\bwarehouses?\b|\bdepots?\b|\blogistics\b|\bdistribution cent(er|re)s?\b/, "warehouse"],
  [/\bhotels?\b/, "hotel"],
  [/\brestaurants?\b|\bcaf[eé]s?\b|\bcoffee shops?\b/, "restaurant"],
  [/\bretail\b|\bshops?\b|\bstores?\b|\bsupermarkets?\b|\boutlets?\b/, "retail"],
];

const DEFAULT_RADIUS_METERS = 2000;

/** "5 km", "5km", "800 m", "1.5 kilometres", "half a km" is not supported - it must be a number. */
export function parseDistanceMeters(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*(km|kms|kilomet(?:er|re)s?|m|meters?|metres?|mi|miles?)\b/.exec(text);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2]!;
  if (/^k/.test(unit)) return Math.round(value * 1000);
  if (/^mi/.test(unit)) return Math.round(value * 1609.34);
  return Math.round(value);
}

function matchFirst<T>(text: string, table: Array<[RegExp, T]>): T | null {
  for (const [pattern, value] of table) {
    if (pattern.test(text)) return value;
  }
  return null;
}

export function parseMapCommand(input: string): MapCommand | null {
  const text = input.toLowerCase().trim();
  if (!text) return null;

  const distance = parseDistanceMeters(text);

  // Suitability is checked first: "is this a good place for a hospital"
  // mentions a category word too, and would otherwise be read as a search
  // for hospitals rather than an assessment for building one.
  if (/\bsuitab|\bscore this\b|\bgood (place|spot|location|site)\b|\bbest (place|spot|location|site)\b|\bshould i (build|open|put)\b|\bwhere (should|can) i (build|open|put)\b/.test(text)) {
    const presetId = matchFirst(text, FACILITY_WORDS);
    if (presetId) {
      return { operation: "suitability", presetId, radiusMeters: distance ?? DEFAULT_RADIUS_METERS };
    }
  }

  if (/\bnearest\b|\bclosest\b|\bnear(?:by)? est\b/.test(text)) {
    const category = matchFirst(text, CATEGORY_WORDS);
    if (category) return { operation: "nearest", category };
  }

  const category = matchFirst(text, CATEGORY_WORDS);
  if (category && hasSpatialIntent(text, distance)) {
    return { operation: "within", category, radiusMeters: distance ?? DEFAULT_RADIUS_METERS };
  }

  // No category named, but a distance was - "draw a 5 km buffer", "what's
  // within 2 km". A ring plus everything inside it is the useful answer.
  if (distance && /\bbuffer\b|\bring\b|\bradius\b|\bwithin\b|\baround\b/.test(text)) {
    return { operation: "buffer", radiusMeters: distance };
  }

  return null;
}

/** Human-readable echo of what a command was understood to mean, shown before results. */
export function describeCommand(command: MapCommand, categoryLabel: (id: NearbyCategory) => string, presetLabel: (id: string) => string): string {
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`);

  switch (command.operation) {
    case "within":
      return `Finding ${categoryLabel(command.category).toLowerCase()} within ${km(command.radiusMeters)}`;
    case "nearest":
      return `Finding the nearest ${categoryLabel(command.category).toLowerCase().replace(/s$/, "")}`;
    case "buffer":
      return `Drawing a ${km(command.radiusMeters)} buffer and counting what's inside`;
    case "suitability":
      return `Scoring this site for a ${presetLabel(command.presetId).toLowerCase()} within ${km(command.radiusMeters)}`;
  }
}
