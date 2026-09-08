import { fetchWithTimeout } from "./cache";

// Multiple public mirrors, tried in order — the same failover pattern
// proven in the previous version of this project. Overpass's public
// instances are free but occasionally rate-limit or time out individually.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  let lastError = "";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8", Accept: "application/json" },
          body: query,
        },
        20_000
      );

      if (!response.ok) {
        lastError = `${endpoint} returned HTTP ${response.status}`;
        continue;
      }

      const text = await response.text();
      if (!text.trim()) {
        lastError = `${endpoint} returned an empty response`;
        continue;
      }

      const data = JSON.parse(text) as { elements?: OverpassElement[] };
      if (Array.isArray(data.elements)) return data.elements;
      lastError = `${endpoint} returned no usable elements`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${endpoint} request failed`;
    }
  }

  throw new Error(lastError || "All Overpass endpoints failed.");
}

/**
 * Builds an Overpass QL query for every tag group we care about within a
 * radius, in a single request (cheaper and faster than one request per
 * category).
 */
export function buildEvidenceQuery(lat: number, lon: number, radiusMeters: number): string {
  const filters = [
    "[building]",
    "[shop]",
    "[office]",
    "[amenity]",
    "[landuse]",
    "[industrial]",
    "[tourism]",
    "[leisure=park]",
    "[natural=water]",
    "[waterway]",
    "[railway]",
    "[highway=bus_stop]",
    "[public_transport]",
    "[amenity=hospital]",
    "[amenity=school]",
    "[amenity=college]",
    "[amenity=university]",
    "[amenity=bank]",
    "[amenity=atm]",
    "[amenity=pharmacy]",
    "[amenity=police]",
    "[amenity=fuel]",
    "[amenity=parking]",
    "[tourism=hotel]",
    "[boundary=administrative]",
  ];

  const clauses = filters.map((f) => `nwr(around:${radiusMeters},${lat},${lon})${f};`).join("\n    ");

  return `
    [out:json][timeout:25];
    (
    ${clauses}
    );
    out center tags;
  `;
}

export function normalizeElement(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  return { lat, lon };
}
