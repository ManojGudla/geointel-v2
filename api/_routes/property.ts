import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getClientIp, readLatLon, withPrivateCache, OUT_OF_RANGE_MESSAGE } from "../_lib/http.js";
import { TtlCache, RateLimiter } from "../_lib/cache.js";
import { runOverpassQueryDetailed, OverpassUnavailableError } from "../_lib/overpass.js";
import { buildPropertySiteQuery, extractSite } from "../_lib/propertySite.js";
import type { PropertySite } from "../../src/types/gis.js";

/**
 * GET /api/property?lat=&lon=
 *
 * The building at one exact point, what is mapped inside it and the land it
 * stands on. See api/_lib/propertySite.ts for why this is a separate lookup:
 * /api/gis answers for an area around a snapped point, and the property
 * classification needs the exact point the visitor chose.
 *
 * Cached privately, like reverse-geocode: the coordinates are the exact spot,
 * which can be the visitor's own position.
 */
// Ten minutes, the same as reverse-geocode: the key is an exact point, which
// can be the visitor's own position, so it is not kept for long.
const cache = new TtlCache<PropertySite>(10 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

const handler: ApiHandler = async (req, res) => {
  const point = readLatLon(req);
  if (!point.ok) {
    return err(res, 400, point.problem === "missing" ? "Query parameters 'lat' and 'lon' are required numbers." : OUT_OF_RANGE_MESSAGE);
  }
  // About 1 m. Enough to tell two buildings apart, and lets a repeat click reuse the answer.
  const lat = Number(point.lat.toFixed(5));
  const lon = Number(point.lon.toFixed(5));

  const rate = limiter.check(getClientIp(req));
  if (!rate.allowed) return err(res, 429, "Too many property lookups. Please slow down.", "RATE_LIMITED");

  const key = `${lat},${lon}`;
  const cached = cache.get(key);
  if (cached) return ok(res, { site: cached });

  try {
    const answer = await runOverpassQueryDetailed(buildPropertySiteQuery(lat, lon));
    const site = extractSite(answer.elements, { lat, lon }, { dataAsOf: answer.dataAsOf, fetchedAt: new Date().toISOString() });
    if (answer.incomplete) {
      /*
        Cut short by the map server, so it can be missing the building or the
        land: said so in the answer, and kept by nobody. It used to go out
        with the hour-long private cache like any other answer, so a building
        read from a partial answer ("no land use around it") stayed that way
        in the visitor's browser for an hour, however often they tapped it.
      */
      res.setHeader("Cache-Control", "no-store");
      return ok(res, { site: { ...site, incomplete: true } });
    }
    cache.set(key, site);
    return ok(res, { site });
  } catch (error) {
    console.error("[api/property]", error);
    const message =
      error instanceof OverpassUnavailableError
        ? "OpenStreetMap's free map-data servers are overloaded right now, so the building at this point can't be checked. Please try again in a minute."
        : "The building at this point could not be checked just now. Please try again in a minute.";
    return err(res, 502, message, "PROVIDER_UNAVAILABLE");
  }
};

export default withMaintenanceGuard(withPrivateCache(3600)(handler));
