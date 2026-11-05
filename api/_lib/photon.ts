import { fetchWithTimeout } from "./cache.js";

/**
 * Photon (photon.komoot.io): a free OpenStreetMap search engine, used when
 * Nominatim finds nothing.
 *
 * Why a second engine: Nominatim matches addresses strictly, and Indian
 * addresses are usually written in a way it can't parse - "H.No 12-3-45,
 * Flat 302, Sai Residency, near Bus Stop, Ameerpet". Reported: "some
 * addresses are not working." Photon is built on the same OpenStreetMap
 * data but tolerates typos, partial words and extra words, so it finds the
 * place Nominatim gave up on. Same data, same licence (ODbL), more forgiving.
 */
interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_value?: string;
    type?: string;
  };
}

export interface PhotonResult {
  displayName: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
}

export async function photonSearch(query: string, origin: { lat: number; lon: number } | null, limit = 8): Promise<PhotonResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang: "en" });
  if (origin) {
    params.set("lat", origin.lat.toFixed(4));
    params.set("lon", origin.lon.toFixed(4));
  }
  const response = await fetchWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`, { headers: { Accept: "application/json" } }, 6_000);
  if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}`);
  const data = (await response.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .map((f) => {
      const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
      const p = f.properties ?? {};
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const parts = [p.name, street, p.locality, p.district, p.city ?? p.county, p.state, p.postcode, p.country].filter(
        (part, i, all): part is string => !!part && all.indexOf(part) === i
      );
      return {
        displayName: parts.join(", "),
        name: p.name || street || p.locality || p.city || parts[0] || query,
        lat,
        lon,
        type: p.osm_value || p.type,
      };
    })
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.displayName);
}

/**
 * Shorter and shorter versions of an address, most specific first, for when
 * the whole thing matches nothing: drop house/flat/plot numbers and "near …"
 * landmarks, then peel leading parts off one at a time. "H.No 12-3-45, Flat
 * 302, Sai Residency, Ameerpet, Hyderabad" becomes "Sai Residency, Ameerpet,
 * Hyderabad", then "Ameerpet, Hyderabad".
 */
export function relaxedQueries(query: string): string[] {
  const NOISE = /^(h\.?\s*no\.?|house\s*no\.?|flat\s*(no\.?)?|plot\s*(no\.?)?|door\s*no\.?|d\.?\s*no\.?|#|apt\.?|floor|\d+(st|nd|rd|th)\s+floor)\b|^[\d\s\-/#.,]+$|^(near|opp\.?|opposite|beside|behind)\b/i;
  const parts = query
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !NOISE.test(p));
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1 && out.length < 3; i += 1) {
    const candidate = parts.slice(i).join(", ");
    if (candidate.length >= 3 && candidate.toLowerCase() !== query.trim().toLowerCase()) out.push(candidate);
  }
  return [...new Set(out)];
}
