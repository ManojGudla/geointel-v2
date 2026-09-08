/**
 * Rounding coordinates so the CDN can actually cache the answer.
 *
 * ── The bug this fixes ────────────────────────────────────────────────────
 *
 * Thirteen of the API routes are wrapped in `withEdgeCache`, which tells
 * Vercel's CDN to hold the response for hours. On paper that makes a repeat
 * lookup instant. In practice it almost never fired, because the CDN keys its
 * cache on the exact URL and the app was sending raw coordinates at full
 * float precision.
 *
 * Measured on production, "hospitals within 2 km" of the same spot:
 *
 *   identical coordinates      38 ms   x-vercel-cache: HIT
 *   moved about 11 metres    4790 ms   x-vercel-cache: MISS
 *   moved about 1 metre       887 ms   x-vercel-cache: MISS
 *
 * Nobody clicks the same float twice. Panning a map, re-centring on a search
 * result, or a GPS fix drifting by a metre all produce a new URL, so nearly
 * every real request was a miss that went all the way to the free Overpass
 * mirrors and took seconds. The cache was working perfectly and being asked
 * the wrong question.
 *
 * Snapping the coordinate to a grid before the URL is built means everybody
 * standing in roughly the same place asks the same question, and only the
 * first of them waits.
 *
 * ── Why the precision differs per route ───────────────────────────────────
 *
 * Snapping moves the point, so it is only honest where the answer describes
 * an AREA rather than a spot. "What is within 2 km of here" does not change
 * if the centre shifts 50 metres. "What is the address of this exact pin"
 * absolutely does, so reverse-geocode is deliberately left alone and is fast
 * anyway.
 */

/** Metres per degree of latitude, near enough for choosing a grid. */
const METRES_PER_DEGREE = 111_320;

/**
 * Decimal places to keep, per route.
 *
 *   3 dp ≈ a 110 m grid, so the point moves by at most ~55 m.
 *   2 dp ≈ a 1.1 km grid, so it moves by at most ~550 m.
 *
 * A route absent from this table is not snapped at all. That is the safe
 * default: a new endpoint has to opt in deliberately, rather than silently
 * inheriting a rounding that might matter to it.
 */
export const COORD_PRECISION: Record<string, number> = {
  // Radius searches. The radius is 500 m to 5 km, so a 55 m shift in the
  // centre changes the result set by a rounding error.
  "/api/nearby": 3,
  "/api/poi-evidence": 3,
  "/api/gis": 3,
  // Satellite capture dates come from imagery footprints that cover many
  // square kilometres; 110 m is far finer than the data.
  "/api/imagery": 3,
  // Area statistics and administrative lookups. These are already answers
  // about a district or a grid square, not a point, so a coarser grid is
  // honest and caches far better.
  "/api/population": 2,
  "/api/weather": 2,
  "/api/officials": 2,
  "/api/live": 2,

  // Deliberately NOT listed, and each for a reason:
  //   /api/reverse-geocode — names the exact spot the user clicked. Moving it
  //     50 m can return the next street. It is already ~20 ms, so there is
  //     nothing to win and a correct answer to lose.
  //   /api/route — the start and end are the user's actual endpoints; snapping
  //     them would redraw the route from somewhere they did not choose.
  //   /api/buildings — takes a bounding box rather than a centre.
};

/** How far a point can move at a given precision, in metres. Used in tests. */
export function maxShiftMetres(decimals: number): number {
  return (Math.pow(10, -decimals) / 2) * METRES_PER_DEGREE;
}

/**
 * Rounds to a fixed number of decimals, returning a number.
 *
 * Number(x.toFixed(n)) rather than Math.round(x * 10**n) / 10**n: the latter
 * reintroduces float noise for values like 17.385, producing 17.384999999
 * and a URL that differs from another client's for the same grid square —
 * which is the exact failure being fixed.
 */
export function snapCoordinate(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(decimals));
}

/**
 * Returns a copy of `params` with lat/lon snapped to this route's grid.
 *
 * Untouched when the route is not in the table, when the values are missing,
 * or when they are not finite — a bad coordinate should reach the server and
 * get the server's own validation error, not be quietly reshaped here into
 * something that looks valid.
 */
export function snapCoordinateParams<T extends Record<string, string | number | undefined>>(
  path: string,
  params: T | undefined
): T | undefined {
  const decimals = COORD_PRECISION[path];
  if (decimals === undefined || !params) return params;

  const out = { ...params };
  for (const key of ["lat", "lon"] as const) {
    const raw = out[key];
    if (raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    (out as Record<string, string | number | undefined>)[key] = snapCoordinate(n, decimals);
  }
  return out;
}
