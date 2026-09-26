import type { EvidenceTrust } from "./location";

export interface GISFeature {
  id: number;
  osmType: "node" | "way" | "relation";
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export type GISLayerId =
  | "buildings"
  | "roads"
  | "shops"
  | "offices"
  | "amenities"
  | "residential"
  | "industrial"
  | "institutional"
  | "landuse"
  | "transport"
  | "hospitals"
  | "schools"
  | "restaurants"
  | "hotels"
  | "parks"
  | "water"
  | "railways"
  | "adminBoundaries";

export interface GISLayerMeta {
  id: GISLayerId;
  label: string;
  source: string;
  defaultVisible: boolean;
}

export interface GISEvidence {
  trust: EvidenceTrust;
  radiusMeters: number;
  counts: {
    buildings: number;
    shops: number;
    offices: number;
    residential: number;
    industrial: number;
    institutional: number;
    amenities: number;
    /** tourism=* nodes/ways (attractions, monuments, museums, viewpoints, hotels, ...). */
    tourism: number;
    /** railway features, public_transport=*, and highway=bus_stop. */
    transport: number;
  };
  scores: {
    commercial: number;
    residential: number;
    institutional: number;
    industrial: number;
    landmark: number;
    transport: number;
  };
  /**
   * The mapped feature at the point itself, when there is one within 35m.
   *
   * This is the property. Everything in `counts` and `scores` is the area
   * around it, which is why a commercial tower used to be classified
   * Residential: the 40 houses within 250m outvoted it. When this is
   * present the classification comes from it and can be checked by name.
   */
  subject?: {
    name?: string;
    kind: string;
    category: "commercial" | "residential" | "industrial" | "institutional" | "landmark" | "transport";
    distanceMeters: number;
  } | null;
  features: GISFeature[];
  source: string;
  fetchedAt: string;
}

/**
 * Only labels the analyzer actually produces. "Retail" and "Hospitality" were
 * declared and never emitted. "Vacant / Unknown" became "Unknown": the app
 * cannot see vacancy, only a lack of mapped detail, and a headline reading
 * VACANT over a street of houses that nobody had tagged was a claim about
 * occupancy the data never made.
 */
export type PropertyClassification =
  | "Commercial"
  | "Residential"
  | "Industrial"
  | "Institutional"
  | "Mixed Use"
  | "Transport"
  | "Landmark"
  | "Unknown";

export interface PropertyAnalysis {
  classification: PropertyClassification;
  /**
   * 0-100. Meaningless, and not shown, when trust is "unavailable": there is
   * no classification to be confident in.
   */
  confidence: number;
  trust: EvidenceTrust;
  evidence: string[];
  reasoning: string;
  scores: GISEvidence["scores"];
  sources: string[];
  /** When the underlying OpenStreetMap data was retrieved (ISO 8601). */
  retrievedAt: string;
  /** What this result cannot tell you. Always shown with the classification. */
  limitations: string[];
}
