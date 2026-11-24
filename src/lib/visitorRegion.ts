/**
 * Where the visitor probably is, from the one signal a browser gives away
 * without asking: its time zone.
 *
 * Not the browser language. A great many browsers in India report en-US, so
 * the language would put a Hyderabad visitor in America and hand them miles.
 * The time zone follows the device clock, which people do keep right.
 *
 * Used only for first-visit defaults that the visitor can change: which
 * example places to suggest, where the map opens, and miles or kilometres.
 * Nothing here is stored or sent anywhere.
 */

export function visitorTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Asia/Calcutta is the older name, and some systems still report it. */
const INDIA_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

export function isIndiaTimeZone(tz: string | null): boolean {
  return tz !== null && INDIA_ZONES.has(tz);
}

/**
 * Where miles are the everyday unit for distance: the United States, the
 * United Kingdom and Liberia. Canada, Australia and Ireland are metric, which
 * is why this is a list of zones rather than "anything in America/".
 */
const MILES_ZONE =
  /^(America\/(New_York|Detroit|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+|Europe\/(London|Belfast|Guernsey|Jersey|Isle_of_Man)|Africa\/Monrovia)$/;

export function prefersMiles(tz: string | null): boolean {
  return tz !== null && MILES_ZONE.test(tz);
}

/**
 * A big city in the visitor's time zone, as [lon, lat], for where the map
 * first opens. Someone in London who lands on a map of Hyderabad reads it as
 * "this is an Indian app" and leaves; the product works anywhere OpenStreetMap
 * does. Zones not listed here keep the default.
 */
const ZONE_CITY: Record<string, [number, number]> = {
  "Europe/London": [-0.1278, 51.5074],
  "Europe/Dublin": [-6.2603, 53.3498],
  "Europe/Paris": [2.3522, 48.8566],
  "Europe/Berlin": [13.405, 52.52],
  "Europe/Amsterdam": [4.9041, 52.3676],
  "Europe/Madrid": [-3.7038, 40.4168],
  "Europe/Rome": [12.4964, 41.9028],
  "America/New_York": [-74.006, 40.7128],
  "America/Chicago": [-87.6298, 41.8781],
  "America/Denver": [-104.9903, 39.7392],
  "America/Phoenix": [-112.074, 33.4484],
  "America/Los_Angeles": [-118.2437, 34.0522],
  "America/Toronto": [-79.3832, 43.6532],
  "America/Vancouver": [-123.1207, 49.2827],
  "Australia/Sydney": [151.2093, -33.8688],
  "Australia/Melbourne": [144.9631, -37.8136],
  "Asia/Dubai": [55.2708, 25.2048],
  "Asia/Singapore": [103.8198, 1.3521],
  "Asia/Tokyo": [139.6503, 35.6762],
  "Pacific/Auckland": [174.7633, -36.8485],
};

export function startingCenter(tz: string | null): [number, number] | null {
  if (!tz) return null;
  return ZONE_CITY[tz] ?? null;
}
