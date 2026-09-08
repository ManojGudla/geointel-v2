export type EvidenceTrust = "verified" | "inferred" | "unavailable";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Location extends Coordinates {
  /** Human-readable display name, as returned by the geocoder. */
  displayName: string;
  /** Short name suitable for headers/markers, e.g. "Charminar". */
  name: string;
  address: {
    houseNumber?: string;
    road?: string;
    suburb?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  timezone?: string;
  /** Data source label for transparency, e.g. "OpenStreetMap / Nominatim". */
  source: string;
}

export interface SearchSuggestion extends Coordinates {
  displayName: string;
  name: string;
  type?: string;
  importance?: number;
}
