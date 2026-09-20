import type { GISFeature, GISLayerId } from "@/types/gis";

export interface LayerDef {
  id: GISLayerId;
  label: string;
  color: string;
  available: boolean;
  description: string;
}

// Only layers api/gis.ts actually populates are marked available=true.
// Roads and administrative boundaries need a tiled/paginated fetch strategy
// to avoid overloading the public Overpass instances with huge geometries -
// listed here so the layer manager is honest about what's real today rather
// than shipping a checkbox that toggles nothing.
export const LAYER_DEFS: LayerDef[] = [
  { id: "buildings", label: "Buildings", color: "#5b6b8c", available: true, description: "All mapped building footprints" },
  { id: "shops", label: "Shops", color: "#d7622b", available: true, description: "Retail POIs" },
  { id: "offices", label: "Offices", color: "#2b5bd7", available: true, description: "Office POIs" },
  { id: "amenities", label: "Amenities", color: "#1a8a5f", available: true, description: "General amenity POIs" },
  { id: "residential", label: "Residential", color: "#8a5fd7", available: true, description: "Residential buildings & landuse" },
  { id: "industrial", label: "Industrial", color: "#b5750a", available: true, description: "Industrial buildings & landuse" },
  { id: "institutional", label: "Institutional", color: "#c22b3f", available: true, description: "Schools, hospitals, government, worship" },
  { id: "hospitals", label: "Hospitals", color: "#c22b3f", available: true, description: "amenity=hospital" },
  { id: "schools", label: "Schools", color: "#2b8f8f", available: true, description: "amenity=school/college/university" },
  { id: "restaurants", label: "Restaurants", color: "#d7622b", available: true, description: "amenity=restaurant/fast_food" },
  { id: "hotels", label: "Hotels", color: "#8a5fd7", available: true, description: "tourism=hotel" },
  { id: "parks", label: "Parks", color: "#1a8a5f", available: true, description: "leisure=park" },
  { id: "water", label: "Water", color: "#2b7fd7", available: true, description: "natural=water, waterway" },
  { id: "railways", label: "Railways", color: "#55607a", available: true, description: "railway=*" },
  { id: "transport", label: "Transport", color: "#0a8fb5", available: true, description: "Bus stops & public transport" },
  { id: "roads", label: "Roads", color: "#8891a8", available: false, description: "Coming soon: needs a tiled fetch strategy" },
  { id: "landuse", label: "Land use", color: "#a8916b", available: false, description: "Coming soon: polygon geometry pipeline" },
  { id: "adminBoundaries", label: "Admin boundaries", color: "#8891a8", available: false, description: "Coming soon: polygon geometry pipeline" },
];

export function bucketFeature(feature: GISFeature): GISLayerId[] {
  const t = feature.tags;
  const layers = new Set<GISLayerId>();

  if (t.building) {
    layers.add("buildings");
    if (["residential", "house", "apartments", "detached", "terrace"].includes(t.building)) layers.add("residential");
    if (["industrial", "warehouse", "factory"].includes(t.building)) layers.add("industrial");
    if (["school", "hospital", "college", "university", "government", "civic"].includes(t.building)) layers.add("institutional");
  }
  if (t.shop) layers.add("shops");
  if (t.office) layers.add("offices");
  if (t.landuse === "residential") layers.add("residential");
  if (t.landuse === "industrial" || t.industrial) layers.add("industrial");
  if (t.amenity) {
    layers.add("amenities");
    if (t.amenity === "hospital") layers.add("hospitals");
    if (["school", "college", "university"].includes(t.amenity)) layers.add("schools");
    if (["restaurant", "fast_food"].includes(t.amenity)) layers.add("restaurants");
    if (["school", "college", "university", "hospital", "place_of_worship", "police", "townhall"].includes(t.amenity)) {
      layers.add("institutional");
    }
  }
  if (t.tourism === "hotel") layers.add("hotels");
  if (t.leisure === "park") layers.add("parks");
  if (t.natural === "water" || t.waterway) layers.add("water");
  if (t.railway) layers.add("railways");
  if (t.public_transport || t.highway === "bus_stop") layers.add("transport");

  return [...layers];
}

// "Buildings" and "Amenities" are catch-all buckets: bucketFeature() puts a
// residential/industrial/institutional building into BOTH its specific
// subtype layer AND the generic "buildings" layer (same for
// hospitals/schools/restaurants under "amenities"), and those two generic
// layers are also the ones checked by default. Picking whichever layer
// happens to come first in bucketFeature()'s insertion order meant a
// feature was always attributed to the generic bucket, so toggling a
// specific checkbox like "Residential" had no visible effect as long as
// "Buildings" stayed checked - the point was already being rendered, just
// under the generic layer/color.
const GENERIC_LAYERS = new Set<GISLayerId>(["buildings", "amenities"]);

/**
 * Picks which single layer (and therefore which color) a feature renders
 * as, given the layers it could belong to and which layers are currently
 * checked. Prefers a specific, non-generic layer over a generic one
 * whenever both are visible, so checking "Residential" actually recolors
 * those buildings instead of silently doing nothing. Falls back to a
 * generic layer, then to undefined (not rendered) if nothing matches.
 */
export function pickVisibleLayer(layers: GISLayerId[], visibility: Partial<Record<GISLayerId, boolean>>): GISLayerId | undefined {
  return layers.find((l) => !GENERIC_LAYERS.has(l) && visibility[l]) ?? layers.find((l) => visibility[l]);
}

export function groupFeaturesByLayer(features: GISFeature[]): Record<string, GISFeature[]> {
  const groups: Record<string, GISFeature[]> = {};
  for (const feature of features) {
    for (const layer of bucketFeature(feature)) {
      (groups[layer] ??= []).push(feature);
    }
  }
  return groups;
}

/**
 * Layers grouped the way a person thinks about a place, rather than as one
 * flat list of eighteen checkboxes.
 *
 * The flat list was the most technical thing a first-time visitor met: no
 * hierarchy, no sense of which switches belong together, and "Institutional"
 * sitting beside "Land use" with nothing to say how they differ. Grouping
 * costs nothing in capability - every layer is still here, still individually
 * switchable - and turns scanning eighteen items into scanning five headings.
 *
 * Order matters: the groups people reach for most often come first.
 */
export interface LayerGroup {
  id: string;
  label: string;
  /** What this group is for, in plain language. */
  hint: string;
  layers: GISLayerId[];
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: "places",
    label: "Places & business",
    hint: "Where people shop, work, eat and stay.",
    layers: ["shops", "offices", "restaurants", "hotels"],
  },
  {
    id: "services",
    label: "Services",
    hint: "Health, education and everyday facilities.",
    layers: ["hospitals", "schools", "amenities"],
  },
  {
    id: "land",
    label: "Land & property",
    hint: "What the buildings and land around here are used for.",
    layers: ["buildings", "residential", "industrial", "institutional"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    hint: "How people move through the area.",
    layers: ["transport", "railways", "roads"],
  },
  {
    id: "environment",
    label: "Environment",
    hint: "Green space and water.",
    layers: ["parks", "water"],
  },
  {
    id: "advanced",
    label: "Advanced",
    hint: "Boundary and land-use polygons, which need a heavier query than this app runs today.",
    layers: ["landuse", "adminBoundaries"],
  },
];

/** Guards against a layer being defined but left out of every group, which would make it unreachable in the UI. */
export function ungroupedLayerIds(): GISLayerId[] {
  const grouped = new Set(LAYER_GROUPS.flatMap((g) => g.layers));
  return LAYER_DEFS.map((l) => l.id).filter((id) => !grouped.has(id));
}
