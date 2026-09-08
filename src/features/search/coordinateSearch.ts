/**
 * Recognises a coordinate pair typed or pasted into the search box and
 * short-circuits straight to that point, instead of sending it to Nominatim
 * as free text (which doesn't reliably resolve a bare coordinate string).
 * The numbers ARE the location — there's nothing to look up.
 *
 * Three input shapes are accepted, because these are what people actually
 * have on their clipboard:
 *
 *   1. Signed decimal      17.385044, 78.486671   ·   -33.8688 151.2093
 *   2. Decimal + hemisphere 17.385044° N, 78.486671° E   ·   N 17.38 E 78.48
 *   3. Degrees/minutes/sec 17°23'06.2"N 78°29'12.0"E
 *
 * Shape 1 is what Google Maps' "copy coordinates" puts on the clipboard;
 * shape 3 is what its place card displays on screen, so someone reading it
 * off a page types that instead. Both should work.
 *
 * Anything ambiguous or half-typed (a lone number, "17.3") deliberately
 * returns null and falls through to normal place search rather than being
 * force-fit into a wrong coordinate.
 */
export interface CoordinatePair {
  lat: number;
  lon: number;
}

/** Shape 1: two signed decimals, optional leading "@" (Google Maps URLs). */
const DECIMAL_PAIR = /^@?\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Shape 2: unsigned decimals whose sign comes from an N/S and E/W letter, before or after the number. */
const DECIMAL_HEMISPHERE =
  /^\s*(?:([NS])\s*)?(\d+(?:\.\d+)?)\s*°?\s*(?:([NS])\s*)?[,;\s]+(?:([EW])\s*)?(\d+(?:\.\d+)?)\s*°?\s*(?:([EW])\s*)?$/i;

/** Shape 3: degrees, minutes and optional seconds, each component carrying a hemisphere letter. */
const DEGREES_MINUTES_SECONDS =
  /^\s*(?:([NS])\s*)?(\d+)\s*[°ºd]\s*(\d+(?:\.\d+)?)\s*['′’m]\s*(?:(\d+(?:\.\d+)?)\s*["″”s]?\s*)?(?:([NS])\s*)?[,;\s]*(?:([EW])\s*)?(\d+)\s*[°ºd]\s*(\d+(?:\.\d+)?)\s*['′’m]\s*(?:(\d+(?:\.\d+)?)\s*["″”s]?\s*)?(?:([EW])\s*)?\s*$/i;

/**
 * Resolves the hemisphere letter for one component, which may legitimately
 * appear before the number ("N 17.38") or after it ("17.38 N") but never
 * both and never neither — requiring exactly one is what stops "17 38" from
 * being read as a hemisphere-qualified pair.
 */
function hemisphereSign(before: string | undefined, after: string | undefined): number | null {
  const letter = before ?? after;
  if (!letter || (before && after)) return null;
  const upper = letter.toUpperCase();
  return upper === "S" || upper === "W" ? -1 : 1;
}

function inRange(lat: number, lon: number): CoordinatePair | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function parseCoordinatePair(text: string): CoordinatePair | null {
  const input = text.trim();
  if (!input) return null;

  const decimal = DECIMAL_PAIR.exec(input);
  if (decimal) return inRange(Number(decimal[1]), Number(decimal[2]));

  const hemisphere = DECIMAL_HEMISPHERE.exec(input);
  if (hemisphere) {
    const latSign = hemisphereSign(hemisphere[1], hemisphere[3]);
    const lonSign = hemisphereSign(hemisphere[4], hemisphere[6]);
    if (latSign === null || lonSign === null) return null;
    return inRange(latSign * Number(hemisphere[2]), lonSign * Number(hemisphere[5]));
  }

  const dms = DEGREES_MINUTES_SECONDS.exec(input);
  if (dms) {
    const latSign = hemisphereSign(dms[1], dms[5]);
    const lonSign = hemisphereSign(dms[6], dms[10]);
    if (latSign === null || lonSign === null) return null;
    const lat = latSign * (Number(dms[2]) + Number(dms[3]) / 60 + Number(dms[4] ?? 0) / 3600);
    const lon = lonSign * (Number(dms[7]) + Number(dms[8]) / 60 + Number(dms[9] ?? 0) / 3600);
    return inRange(lat, lon);
  }

  return null;
}

export function formatCoordinateLabel(pair: CoordinatePair): string {
  return `${pair.lat.toFixed(6)}, ${pair.lon.toFixed(6)}`;
}

/**
 * Degrees/minutes/seconds rendering for the on-map coordinate readout — the
 * format aviation, marine and survey users read natively, and the one Google
 * Maps shows on a place card. Rounding is done on the seconds only, then
 * carried upward, so 59.96" becomes 1'00" rather than the invalid 60".
 */
export function formatDms(pair: CoordinatePair): string {
  const component = (value: number, positive: string, negative: string) => {
    const hemisphere = value < 0 ? negative : positive;
    const absolute = Math.abs(value);
    let degrees = Math.floor(absolute);
    let minutes = Math.floor((absolute - degrees) * 60);
    let seconds = Number((((absolute - degrees) * 60 - minutes) * 60).toFixed(1));
    if (seconds >= 60) {
      seconds = 0;
      minutes += 1;
    }
    if (minutes >= 60) {
      minutes = 0;
      degrees += 1;
    }
    return `${degrees}°${String(minutes).padStart(2, "0")}'${seconds.toFixed(1).padStart(4, "0")}"${hemisphere}`;
  };

  return `${component(pair.lat, "N", "S")} ${component(pair.lon, "E", "W")}`;
}
