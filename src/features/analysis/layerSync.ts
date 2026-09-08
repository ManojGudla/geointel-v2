import type { GISLayerId } from "@/types/gis";
import type { NearbyCategory } from "@/types/intel";
import { LAYER_DEFS } from "@/features/gis/layerBuckets";

/**
 * Which map layers an analysis needs in order to show its own working.
 *
 * Two jobs. First, keeping the map honest: if an analysis reports "9
 * hospitals within 5 km", the hospital layer has to actually be on, or the
 * panel and the map are telling the user two different things. Second,
 * smart layer recommendations — a person assessing a site for a café
 * shouldn't have to already know that "restaurants, shops, offices and
 * transport" are the relevant OpenStreetMap layers. That knowledge belongs
 * in the product, not in the user's head.
 *
 * Categories with no dedicated layer fall back to the generic `amenities`
 * bucket, which is genuinely where those features are rendered — banks,
 * ATMs, pharmacies, police and fuel are all amenity POIs. Claiming a
 * dedicated layer for them would put a checkbox on screen that changes
 * nothing.
 */
const CATEGORY_LAYERS: Record<NearbyCategory, GISLayerId[]> = {
  hospitals: ["hospitals"],
  schools: ["schools"],
  restaurants: ["restaurants"],
  cafes: ["amenities"],
  hotels: ["hotels"],
  shopping: ["shops"],
  parks: ["parks"],
  publicTransport: ["transport"],
  banks: ["amenities"],
  atms: ["amenities"],
  petrol: ["amenities"],
  police: ["amenities", "institutional"],
  pharmacies: ["amenities"],
};

/** Layers that make a suitability assessment's reasoning visible on the map. */
const PRESET_LAYERS: Record<string, GISLayerId[]> = {
  hospital: ["hospitals", "residential", "transport", "amenities"],
  school: ["schools", "residential", "transport"],
  retail: ["shops", "offices", "amenities", "transport"],
  restaurant: ["restaurants", "shops", "offices", "transport"],
  hotel: ["hotels", "transport", "amenities", "shops"],
  warehouse: ["industrial", "transport", "buildings"],
};

export function layersForCategory(category: NearbyCategory): GISLayerId[] {
  return CATEGORY_LAYERS[category] ?? [];
}

export function layersForPreset(presetId: string): GISLayerId[] {
  return PRESET_LAYERS[presetId] ?? [];
}

/** Human-readable names for a set of layer ids, for the "layers used" readout. */
export function layerLabels(ids: GISLayerId[]): string[] {
  return ids.map((id) => LAYER_DEFS.find((l) => l.id === id)?.label ?? id);
}

/**
 * The layers an analysis request implies. Returned rather than applied so
 * the caller can both switch them on AND show the user which ones it
 * switched on — an analysis that silently changes the map is only marginally
 * better than one that doesn't change it at all.
 */
export function layersForRequest(request: { operation: string; category?: NearbyCategory; presetId?: string }): GISLayerId[] {
  if (request.operation === "suitability" && request.presetId) return layersForPreset(request.presetId);
  if (request.category) return layersForCategory(request.category);
  return [];
}
