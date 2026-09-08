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
