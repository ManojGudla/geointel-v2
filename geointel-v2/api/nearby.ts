import type { ApiHandler } from "./_lib/http";
import { ok, err, getQueryParam, getClientIp } from "./_lib/http";
import { TtlCache, RateLimiter } from "./_lib/cache";
import { runOverpassQuery, normalizeElement, type OverpassElement } from "./_lib/overpass";

const CATEGORY_FILTERS: Record<string, string[]> = {
  restaurants: ['[amenity=restaurant]'],
  cafes: ['[amenity=cafe]'],
  hotels: ['[tourism=hotel]', "[tourism=guest_house]"],
  hospitals: ["[amenity=hospital]", "[amenity=clinic]"],
  schools: ["[amenity=school]"],
  atms: ["[amenity=atm]"],
  banks: ["[amenity=bank]"],
  petrol: ["[amenity=fuel]"],
  shopping: ["[shop=mall]", "[shop=supermarket]", "[shop=department_store]"],
  parks: ["[leisure=park]"],
  pharmacies: ["[amenity=pharmacy]"],
  police: ["[amenity=police]"],
  publicTransport: ["[highway=bus_stop]", "[public_transport]"],
};

const cache = new TtlCache<OverpassElement[]>(5 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  const radius = Number(getQueryParam(req, "radius") ?? "1000");
  const category = getQueryParam(req, "category");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return err(res, 400, "'lat' and 'lon' are required numbers.");
  if (category && !CATEGORY_FILTERS[category]) return err(res, 400, `Unknown category '${category}'.`);

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many nearby requests. Please slow down.", "RATE_LIMITED");

  const categories = category ? [category] : Object.keys(CATEGORY_FILTERS);
  const filters = categories.flatMap((c) => CATEGORY_FILTERS[c]!);

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${categories.join(",")}`;
  let elements = cache.get(cacheKey);

  if (!elements) {
    try {
      const clauses = filters.map((f) => `nwr(around:${radius},${lat},${lon})${f};`).join("\n");
      const query = `[out:json][timeout:20];(${clauses});out center tags;`;
      elements = await runOverpassQuery(query);
      cache.set(cacheKey, elements);
    } catch (error) {
      console.error("[api/nearby]", error);
      return err(res, 502, "Nearby places are temporarily unavailable.", "PROVIDER_UNAVAILABLE");
    }
  }

  function categoryOf(tags: Record<string, string>): string | null {
    for (const [cat, filterList] of Object.entries(CATEGORY_FILTERS)) {
      for (const f of filterList) {
        const match = /\[(\w+)=(\w+)\]/.exec(f);
        if (match && tags[match[1]!] === match[2]) return cat;
      }
    }
    return null;
  }

  const items = elements
    .map((el) => {
      const coords = normalizeElement(el);
      if (!coords) return null;
      const tags = el.tags || {};
      const cat = categoryOf(tags);
      if (!cat) return null;
      return {
        id: `${el.type}/${el.id}`,
        name: tags.name || cat,
        category: cat,
        lat: coords.lat,
        lon: coords.lon,
        distanceMeters: Math.round(haversineMeters({ lat, lon }, coords)),
        tags,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 60);

  ok(res, { items, source: "OpenStreetMap / Overpass", radiusMeters: radius });
};

export default handler;
