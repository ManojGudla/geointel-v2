import type { NearbyCategory } from "@/types/intel";

/**
 * Display names for the searchable categories, in one place so the analysis
 * panel, the AI command bar and any generated report all call the same thing
 * by the same name.
 */
export const CATEGORY_LABELS: Array<{ id: NearbyCategory; label: string }> = [
  { id: "hospitals", label: "Hospitals & clinics" },
  { id: "schools", label: "Schools" },
  { id: "pharmacies", label: "Pharmacies" },
  { id: "police", label: "Police" },
  { id: "banks", label: "Banks" },
  { id: "atms", label: "ATMs" },
  { id: "petrol", label: "Fuel stations" },
  { id: "restaurants", label: "Restaurants" },
  { id: "cafes", label: "Cafés" },
  { id: "hotels", label: "Hotels" },
  { id: "shopping", label: "Shops" },
  { id: "parks", label: "Parks" },
  { id: "publicTransport", label: "Public transport" },
];

const BY_ID = new Map(CATEGORY_LABELS.map((c) => [c.id, c.label]));

export function categoryLabel(id: NearbyCategory): string {
  return BY_ID.get(id) ?? id;
}

/** One of a kind, for a single place: "ATM", not "ATMs". */
const SINGULAR: Record<NearbyCategory, string> = {
  hospitals: "Hospital or clinic",
  schools: "School",
  pharmacies: "Pharmacy",
  police: "Police station",
  banks: "Bank",
  atms: "ATM",
  petrol: "Fuel station",
  restaurants: "Restaurant",
  cafes: "Café",
  hotels: "Hotel",
  shopping: "Shop",
  parks: "Park",
  publicTransport: "Public transport stop",
};

/**
 * What to call one place in a list.
 *
 * Reported (25 November 2026): ATMs within 2 km listed four rows that all
 * read "atms". The nearby service names a place with no name tag after its
 * category slug, so an unnamed ATM came through as "atms". Its own name
 * wins; otherwise its brand or operator ("State Bank of India ATM"), and
 * otherwise the plain kind of place ("ATM"). The slug itself is kept in the
 * data, because the agents use `name === category` to know a place has no
 * name of its own.
 */
export function placeLabel(item: { name?: string | null; category: string; tags?: Record<string, string> }): string {
  const name = item.name?.trim();
  if (name && name !== item.category) return name;
  const kind = SINGULAR[item.category as NearbyCategory] ?? categoryLabel(item.category as NearbyCategory);
  const owner = (item.tags?.brand || item.tags?.operator || "").trim();
  if (owner && !owner.toLowerCase().includes(kind.toLowerCase())) return `${owner} ${kind}`;
  return owner || kind;
}

