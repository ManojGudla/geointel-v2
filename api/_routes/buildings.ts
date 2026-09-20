import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQuery, buildBuildingGeometryQuery, type OverpassElement, type Bbox } from "../_lib/overpass.js";
import { estimateBuildingHeight } from "../_lib/buildingHeight.js";

// Caps how much viewport a single request can cover, so a fast pan/zoom
// can't trigger a multi-megabyte Overpass geometry pull. ~0.03deg is
// roughly a 3km square at the latitudes this app targets - plenty for a
// zoomed-in 3D view, since extrusions aren't meaningful once zoomed out.
const MAX_BBOX_DEGREES = 0.03;
const MAX_BUILDINGS_RETURNED = 1500;

// OSM's built environment - buildings, shops, amenities, POIs - changes over
// days and weeks, not minutes, so a short TTL bought nothing and cost a great
// deal: every repeat view re-queried Overpass's free public mirrors, which are
// the least reliable dependency in this app and were actively rate-limiting us.
// Six hours matches what officials.ts already uses for similarly slow-moving
// data. This is a per-instance in-memory cache on serverless (see cache.ts), so
// it evaporates on a cold start - it reduces load and speeds up repeat views,
// it is not a durability guarantee.
const cache = new TtlCache<OverpassElement[]>(6 * 60 * 60 * 1000);
const limiter = new RateLimiter(60_000, 20);

export interface BuildingDto {
  id: number;
  polygon: Array<[number, number]>;
  heightMeters: number;
  heightIsEstimated: boolean;
  name?: string;
}

function parseBbox(req: Parameters<ApiHandler>[0]): Bbox | null {
  const south = Number(getQueryParam(req, "south"));
  const west = Number(getQueryParam(req, "west"));
  const north = Number(getQueryParam(req, "north"));
  const east = Number(getQueryParam(req, "east"));
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;
  return { south, west, north, east };
}

const handler: ApiHandler = async (req, res) => {
  const bbox = parseBbox(req);
  if (!bbox) return err(res, 400, "'south', 'west', 'north', and 'east' are required numbers describing a valid bounding box.");

  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  if (width > MAX_BBOX_DEGREES || height > MAX_BBOX_DEGREES) {
    return err(res, 400, `Bounding box is too large for building geometry (max ~${MAX_BBOX_DEGREES}° per side). Zoom in further.`, "BBOX_TOO_LARGE");
  }

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many building-geometry requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `bld:${bbox.south.toFixed(4)},${bbox.west.toFixed(4)},${bbox.north.toFixed(4)},${bbox.east.toFixed(4)}`;
  let elements = cache.get(cacheKey);

  if (!elements) {
    try {
      elements = await runOverpassQuery(buildBuildingGeometryQuery(bbox));
      cache.set(cacheKey, elements);
    } catch (error) {
      console.error("[api/buildings]", error);
      const reason = error instanceof Error ? error.message : "unknown reason";
      return err(res, 502, `3D building data is temporarily unavailable (${reason}).`, "PROVIDER_UNAVAILABLE");
    }
  }

  const buildings: BuildingDto[] = elements
    .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 3 && el.tags?.building)
    .slice(0, MAX_BUILDINGS_RETURNED)
    .map((el) => {
      const ring = el.geometry!.map((pt): [number, number] => [pt.lon, pt.lat]);
      // Overpass `out geom` normally returns closed rings for closed ways;
      // close it defensively so downstream GeoJSON is always valid.
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

      const { meters, explicit } = estimateBuildingHeight(el.tags || {});
      return { id: el.id, polygon: ring, heightMeters: meters, heightIsEstimated: !explicit, name: el.tags?.name };
    });

  ok(res, { buildings, source: "OpenStreetMap / Overpass", fetchedAt: new Date().toISOString() });
};

export default withMaintenanceGuard(withEdgeCache(21600)(handler));
