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
    /** ISO 3166-1 alpha-2, e.g. "US", "IN" — powers Official/Authority Intelligence (see api/officials.ts). */
    countryCode?: string;
    /** ISO 3166-2 subdivision code, e.g. "US-CA", "IN-TG", when Nominatim provides one at this precision. */
    stateCode?: string;
  };
  /*
    Deliberately absent. This used to hold
    Intl.DateTimeFormat().resolvedOptions().timeZone, which is the READER's
    timezone, and Location Identity printed it as a property of the searched
    place. A real timezone for the point comes from Open-Meteo instead (see
    WeatherData.timezone); when that is unavailable the panel says so rather
    than substituting the reader's.
  */
  /** Data source label for transparency, e.g. "OpenStreetMap / Nominatim". */
  source: string;
}

export interface SearchSuggestion extends Coordinates {
  displayName: string;
  name: string;
  type?: string;
  importance?: number;
  /** Kilometres from where the user was looking, when that was sent. */
  distanceKm?: number;
}
