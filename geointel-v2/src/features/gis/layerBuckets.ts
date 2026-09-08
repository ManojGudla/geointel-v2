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
// to avoid overloading the public Overpass instances with huge geometries —
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
  { id: "roads", label: "Roads", color: "#8891a8", available: false, description: "Coming soon — needs a tiled fetch strategy" },
  { id: "landuse", label: "Land use", color: "#a8916b", available: false, description: "Coming soon — polygon geometry pipeline" },
  { id: "adminBoundaries", label: "Admin boundaries", color: "#8891a8", available: false, description: "Coming soon — polygon geometry pipeline" },
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

export function groupFeaturesByLayer(features: GISFeature[]): Record<string, GISFeature[]> {
  const groups: Record<string, GISFeature[]> = {};
  for (const feature of features) {
    for (const layer of bucketFeature(feature)) {
      (groups[layer] ??= []).push(feature);
    }
  }
  return groups;
}
