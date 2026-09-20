/**
 * Plus Codes (Open Location Code), decoded locally.
 *
 * This exists because of a real complaint with a real example. A user searched
 *
 *     8VPH+PH2, Araku Valley, Kantabamsuguda, Andhra Pradesh 531149
 *
 * Google Maps found it instantly. This app returned nothing, and the user
 * concluded the maps were broken. They were not: `8VPH+PH2` is a Plus Code,
 * Google invented the format, and Nominatim - the OpenStreetMap geocoder
 * behind every search here - has no support for them whatsoever. Sending that
 * string to Nominatim will never work, no matter how the query is phrased.
 *
 * The good news is that a Plus Code is not a database lookup. It is an
 * encoding of a latitude and longitude, and the whole specification is
 * arithmetic. So this file decodes them offline, exactly as Google does, and
 * the app gains an address format it previously could not read at all.
 *
 * This matters more in India than almost anywhere. House-number addresses are
 * sparse in OpenStreetMap, so Plus Codes are what people actually share when
 * a place has no usable street address - which is precisely the situation the
 * complaining user was in.
 *
 * The format, briefly:
 *
 *   7MC48VPH+PH2      full code: locates a point anywhere on Earth
 *   8VPH+PH2          short code: the first four digits dropped, so it only
 *                     means something relative to a nearby reference place
 *
 * A short code is the common form because it is what Google displays. It is
 * ambiguous on its own: the same eight characters repeat every degree of
 * latitude and longitude. Recovering one needs a reference point, which is why
 * the string above carries "Araku Valley, Andhra Pradesh" alongside it - that
 * text IS part of the address, not decoration. See recoverNearest below.
 *
 * Specification: https://github.com/google/open-location-code
 */

/** The 20 code characters. Vowels are excluded so codes cannot spell words. */
const ALPHABET = "23456789CFGHJMPQRVWX";
const SEPARATOR = "+";
/** The separator always sits after the eighth digit in a full code. */
const SEPARATOR_POSITION = 8;
const PADDING = "0";

/**
 * Degrees covered by each successive pair of digits.
 *
 * The first pair splits the world into 20-degree cells, and each pair after it
 * divides by 20 again. Ten digits gets to about 14 metres, which is the length
 * of code people normally share.
 */
const PAIR_RESOLUTIONS: number[] = [20, 1, 0.05, 0.0025, 0.000125];

/** Digits past the tenth refine a 4-wide, 5-tall grid inside the last cell. */
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const MAX_DIGITS = 15;

export interface DecodedPlusCode {
  lat: number;
  lon: number;
  /** Height and width of the cell the code names, in degrees. */
  latPrecision: number;
  lonPrecision: number;
  /** The full code this resolved to, useful for showing the user what was read. */
  code: string;
}

/** Strips the separator and any trailing padding, leaving just the digits. */
function digitsOf(code: string): string {
  return code.toUpperCase().replace(/\+/g, "").replace(/0+$/, "");
}

/**
 * True for a syntactically valid FULL code - one that names a point on its own.
 *
 * Deliberately strict. Anything that merely looks code-shaped must fall through
 * to normal place search rather than being force-decoded into a wrong point,
 * the same rule coordinateSearch.ts follows for half-typed coordinates.
 */
export function isFullPlusCode(code: string): boolean {
  const sep = code.indexOf(SEPARATOR);
  if (sep !== SEPARATOR_POSITION) return false;
  const digits = code.toUpperCase().replace(/\+/g, "");
  if (digits.length < SEPARATOR_POSITION) return false;
  // Padding is only ever a run of zeroes at the end of the first eight digits.
  const padIndex = digits.indexOf(PADDING);
  if (padIndex !== -1) {
    if (padIndex % 2 === 1 || padIndex < 2) return false;
    if (!/^0+$/.test(digits.slice(padIndex, SEPARATOR_POSITION))) return false;
    if (digits.length > SEPARATOR_POSITION) return false;
  }
  return [...digits].every((c) => c === PADDING || ALPHABET.includes(c));
}

/** True for a shortened code: fewer than eight digits before the separator. */
export function isShortPlusCode(code: string): boolean {
  const sep = code.indexOf(SEPARATOR);
  if (sep < 0 || sep > SEPARATOR_POSITION - 2) return false;
  if (sep % 2 !== 0) return false;
  const digits = code.toUpperCase().replace(/\+/g, "");
  if (digits.length < 4 || digits.length > MAX_DIGITS) return false;
  return [...digits].every((c) => ALPHABET.includes(c));
}

/** Encodes a point as a full code. Used to build the prefix a short code needs. */
export function encodePlusCode(lat: number, lon: number, digits = 10): string {
  const clippedLat = Math.min(90, Math.max(-90, lat));
  const wrappedLon = (((lon + 180) % 360) + 360) % 360 - 180;
  // Exactly 90 belongs to no cell, so nudge it into the last one.
  let remainingLat = (clippedLat === 90 ? 90 - 1e-9 : clippedLat) + 90;
  let remainingLon = wrappedLon + 180;

  let code = "";
  for (let pair = 0; pair < digits / 2 && pair < PAIR_RESOLUTIONS.length; pair++) {
    const resolution = PAIR_RESOLUTIONS[pair]!;
    const latDigit = Math.min(19, Math.floor(remainingLat / resolution));
    remainingLat -= latDigit * resolution;
    const lonDigit = Math.min(19, Math.floor(remainingLon / resolution));
    remainingLon -= lonDigit * resolution;
    code += ALPHABET[latDigit]! + ALPHABET[lonDigit]!;
    if (code.length === SEPARATOR_POSITION) code += SEPARATOR;
  }
  return code;
}

/** Decodes a full code to the centre of the cell it names. */
export function decodePlusCode(code: string): DecodedPlusCode | null {
  if (!isFullPlusCode(code)) return null;
  const digits = digitsOf(code);
  if (digits.length === 0) return null;

  let lat = -90;
  let lon = -180;
  let latPrecision = PAIR_RESOLUTIONS[0]!;
  let lonPrecision = PAIR_RESOLUTIONS[0]!;

  const pairDigits = Math.min(digits.length, 10);
  for (let i = 0; i < pairDigits; i += 2) {
    const resolution = PAIR_RESOLUTIONS[i / 2]!;
    latPrecision = resolution;
    lonPrecision = resolution;
    lat += ALPHABET.indexOf(digits[i]!) * resolution;
    if (i + 1 < pairDigits) lon += ALPHABET.indexOf(digits[i + 1]!) * resolution;
    else lonPrecision = PAIR_RESOLUTIONS[Math.max(0, i / 2 - 1)]!;
  }

  // Digits eleven onwards subdivide the last cell into a 4x5 grid each time.
  if (digits.length > 10) {
    let gridLat = PAIR_RESOLUTIONS[4]!;
    let gridLon = PAIR_RESOLUTIONS[4]!;
    for (let i = 10; i < Math.min(digits.length, MAX_DIGITS); i++) {
      gridLat /= GRID_ROWS;
      gridLon /= GRID_COLUMNS;
      const value = ALPHABET.indexOf(digits[i]!);
      if (value < 0) break;
      lat += Math.floor(value / GRID_COLUMNS) * gridLat;
      lon += (value % GRID_COLUMNS) * gridLon;
    }
    latPrecision = gridLat;
    lonPrecision = gridLon;
  }

  return {
    // The centre of the cell, not its corner - a corner would put the pin on
    // the boundary between two codes.
    lat: lat + latPrecision / 2,
    lon: lon + lonPrecision / 2,
    latPrecision,
    lonPrecision,
    code: code.toUpperCase(),
  };
}

/**
 * Turns a short code into a point, using a nearby reference.
 *
 * A short code has had its leading digits removed, and those digits are what
 * said which part of the world it was in. Recovering them means taking the
 * reference point's own code, borrowing its first few digits, and then
 * checking whether the result landed in the neighbouring cell instead - which
 * happens whenever the reference sits near a cell boundary.
 *
 * The reference has to be genuinely nearby. Four missing digits means the code
 * repeats every 1 degree, roughly 110 km, so a reference on the other side of
 * the country recovers a real point that is simply the wrong one. That is why
 * the caller should prefer geocoding the place name written alongside the code
 * over using wherever the map happens to be pointing.
 */
export function recoverPlusCode(shortCode: string, refLat: number, refLon: number): DecodedPlusCode | null {
  if (!isShortPlusCode(shortCode)) return null;
  const upper = shortCode.toUpperCase();
  const missingDigits = SEPARATOR_POSITION - upper.indexOf(SEPARATOR);
  const resolution = Math.pow(20, 2 - missingDigits / 2);
  const half = resolution / 2;

  const prefix = encodePlusCode(refLat, refLon).replace(/\+/g, "").slice(0, missingDigits);
  const decoded = decodePlusCode(prefix + upper);
  if (!decoded) return null;

  let { lat, lon } = decoded;
  // The borrowed prefix can be one cell off when the reference is near an edge.
  if (refLat + half < lat && lat - resolution >= -90) lat -= resolution;
  else if (refLat - half > lat && lat + resolution <= 90) lat += resolution;
  if (refLon + half < lon) lon -= resolution;
  else if (refLon - half > lon) lon += resolution;

  return { ...decoded, lat, lon };
}

export interface PlusCodeQuery {
  code: string;
  full: boolean;
  /** Everything else in the query - the place name that locates a short code. */
  context: string;
}

/**
 * Pulls a Plus Code out of a typed query, along with whatever else was typed.
 *
 * People paste the whole thing Google gave them, code and address together:
 *
 *     "8VPH+PH2, Araku Valley, Kantabamsuguda, Andhra Pradesh 531149"
 *
 * The trailing text is not noise to be stripped. For a short code it is the
 * only thing that says which 110 km cell is meant, so it is returned as
 * `context` for the caller to geocode first.
 */
export function findPlusCode(query: string): PlusCodeQuery | null {
  const trimmed = query.trim();
  if (!trimmed.includes(SEPARATOR)) return null;

  // Codes are whitespace- and comma-delimited in real pasted addresses.
  const token = trimmed.split(/[\s,]+/).find((part) => part.includes(SEPARATOR));
  if (!token) return null;

  const full = isFullPlusCode(token);
  if (!full && !isShortPlusCode(token)) return null;

  const context = trimmed
    .replace(token, " ")
    .replace(/[\s,]+/g, " ")
    .trim();

  return { code: token.toUpperCase(), full, context };
}
