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
  /**
   * Overpass flagged this answer as cut short (a timeout or memory limit
   * mid-query), so every count above may be low. Optional because older
   * cached responses predate it.
   */
  incomplete?: boolean;
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
  /** Farmland, orchards, farmyards: land mapped for growing or keeping animals. */
  | "Agricultural"
  /** Parks, gardens, playgrounds, sports grounds, woods and grassland: land kept open. */
  | "Open Space"
  | "Unknown";

/** An OpenStreetMap object an answer rests on, with the link to check it. */
export interface OsmRef {
  osmType: "node" | "way" | "relation";
  id: number;
  /** https://www.openstreetmap.org/<type>/<id> */
  url: string;
}

/** The building at the point, as OpenStreetMap maps it (from /api/property). */
export interface SiteBuilding extends OsmRef {
  /** The tags that matter here: use, name, height, floors, address. */
  tags: Record<string, string>;
  /** True when the point is inside the footprint; false when the outline is just next to it. */
  containsPoint: boolean;
  /** 0 when inside; otherwise metres from the point to the outline. */
  distanceMeters: number;
  /** Footprint in square metres, courtyards included. */
  footprintM2: number;
}

/** A business or facility mapped inside the building's footprint, or an area containing the point. */
export interface SiteFeature extends OsmRef {
  tags: Record<string, string>;
  /** For land read from its outline: how big it is, in square metres. Absent when only the area index knew of it. */
  areaM2?: number;
}

/**
 * What is mapped at one exact point: the building whose footprint contains
 * it, the businesses mapped inside that building, and the areas (land use,
 * a campus, a site) the point lies in. Read by analyzeProperty.
 */
export interface PropertySite {
  lat: number;
  lon: number;
  building: SiteBuilding | null;
  inside: SiteFeature[];
  /** Areas containing the point, most specific first. Empty when the data server had none or could not say. */
  areas: SiteFeature[];
  source: string;
  /** How current the OpenStreetMap data was (the mirror's replica time), when known. */
  dataAsOf: string | null;
  fetchedAt: string;
}

/** The building a classification describes, for the panel and the report. */
export interface BuildingFacts {
  name?: string;
  /** "office building", "apartment building", "building (use not mapped)" */
  kind: string;
  osmUrl: string;
  containsPoint: boolean;
  distanceMeters: number;
  /** Null when neither a height nor a number of floors is mapped. */
  heightMeters: number | null;
  /** "mapped" = the height tag itself; "floors" = worked out from the number of floors. */
  heightSource: "mapped" | "floors" | null;
  levels: number | null;
  footprintM2: number;
  /** "12, Main Road" from the building's own address tags, when mapped. */
  address?: string;
}

/** What a classification rests on, strongest first. */
export type PropertyBasis = "building" | "inside" | "land" | "name" | "area" | "none";

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
  /** What the classification rests on. Absent on results made before the building check existed. */
  basis?: PropertyBasis;
  /** The building the classification describes, when one is mapped at the point. */
  building?: BuildingFacts;
  /** The OpenStreetMap objects behind the answer, to check it. */
  links?: Array<{ label: string; url: string }>;
  /** One line about the wider area, kept apart so it is never mistaken for the property itself. */
  surroundings?: string;
}
