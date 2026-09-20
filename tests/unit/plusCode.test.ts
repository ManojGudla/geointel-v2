import { describe, expect, it } from "vitest";
import {
  decodePlusCode,
  encodePlusCode,
  findPlusCode,
  isFullPlusCode,
  isShortPlusCode,
  recoverPlusCode,
} from "@/features/search/plusCode";

/**
 * Plus Codes.
 *
 * This whole file exists because of one real complaint with one real example.
 * A user searched
 *
 *     8VPH+PH2, Araku Valley, Kantabamsuguda, Andhra Pradesh 531149
 *
 * Google found it. This app returned nothing, and the user concluded the maps
 * were broken. They were not: that is a Plus Code, Google's own format, and
 * Nominatim has no support for it at all.
 *
 * The risk with decoding an address format yourself is that a wrong answer is
 * worse than no answer - a pin 400 km away looks like it worked. So these
 * tests check the arithmetic against Google's published values, check the
 * user's actual failing string, and check that the ambiguity of short codes is
 * handled rather than papered over.
 */

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

describe("the arithmetic matches the specification", () => {
  it("decodes the reference code from Google's own documentation", () => {
    // 8FVC2222+22 is the worked example in the Open Location Code spec.
    const decoded = decodePlusCode("8FVC2222+22")!;
    expect(decoded.lat).toBeCloseTo(47.0000625, 6);
    expect(decoded.lon).toBeCloseTo(8.0000625, 6);
  });

  it("round-trips every point it encodes", () => {
    // The strongest available check without a network call: encode a point,
    // decode it back, and confirm the answer is inside the cell it named.
    const points: Array<[number, number]> = [
      [17.385044, 78.486671], // Hyderabad
      [18.3273, 82.8746], // Araku Valley
      [51.5074, -0.1278], // London, negative longitude
      [-33.8688, 151.2093], // Sydney, southern hemisphere
      [-22.9068, -43.1729], // Rio, both negative
      [64.1466, -21.9426], // Reykjavik, high latitude
      [0, 0], // Null Island
      [1.3521, 103.8198], // Singapore, near the equator
    ];
    for (const [lat, lon] of points) {
      const decoded = decodePlusCode(encodePlusCode(lat, lon))!;
      expect(decoded, `${lat},${lon} failed to round-trip`).toBeTruthy();
      // A ten-digit code names a cell about 14 m across, so the centre of it
      // is never more than about 10 m from the point that produced it.
      expect(km(lat, lon, decoded.lat, decoded.lon) * 1000, `${lat},${lon}`).toBeLessThan(15);
    }
  });

  it("treats a padded code as the large area it actually names", () => {
    // "8FVC0000+" is a whole degree square, not a doorstep. Reporting it with
    // false precision would put a pin somewhere nobody meant.
    const decoded = decodePlusCode("8FVC0000+")!;
    expect(decoded.latPrecision).toBe(1);
    expect(decoded.lonPrecision).toBe(1);
  });
});

describe("the user's actual failing address", () => {
  // Araku Valley, from OpenStreetMap.
  const ARAKU = { lat: 18.3273, lon: 82.8746 };

  it("finds the code and keeps the place name that locates it", () => {
    const found = findPlusCode("8VPH+PH2, Araku Valley, Kantabamsuguda, Andhra Pradesh 531149")!;
    expect(found.code).toBe("8VPH+PH2");
    expect(found.full).toBe(false);
    // The rest of the string is not noise. For a short code it is the ONLY
    // thing that says which 110 km cell was meant.
    expect(found.context).toBe("Araku Valley Kantabamsuguda Andhra Pradesh 531149");
  });

  it("resolves it to Araku Valley when given the right reference", () => {
    const decoded = recoverPlusCode("8VPH+PH2", ARAKU.lat, ARAKU.lon)!;
    expect(decoded).toBeTruthy();
    expect(km(ARAKU.lat, ARAKU.lon, decoded.lat, decoded.lon)).toBeLessThan(3);
  });

  it("lands hundreds of kilometres away from the WRONG reference, which is why context is geocoded first", () => {
    /**
     * The trap this documents. A short code repeats every degree - about
     * 110 km - so resolving it against wherever the map happens to be pointing
     * returns a real, confident, completely wrong point. Hyderabad is the
     * app's default centre, so this is the exact mistake that would have
     * shipped if the surrounding text were discarded.
     */
    const fromHyderabad = recoverPlusCode("8VPH+PH2", 17.385, 78.487)!;
    expect(km(ARAKU.lat, ARAKU.lon, fromHyderabad.lat, fromHyderabad.lon)).toBeGreaterThan(300);
  });
});

describe("what counts as a Plus Code", () => {
  it("accepts real codes in both forms", () => {
    expect(isFullPlusCode("7MC48VPH+PH2")).toBe(true);
    expect(isFullPlusCode("8FVC9G8F+6X")).toBe(true);
    expect(isShortPlusCode("8VPH+PH2")).toBe(true);
    expect(isShortPlusCode("9G8F+6X")).toBe(true); // 4 dropped digits, the common form
    // Digits come in latitude/longitude pairs, so an odd count before the
    // separator cannot be a real code.
    expect(isShortPlusCode("G8F+6X")).toBe(false);
  });

  it("rejects things that merely contain a plus sign", () => {
    // Anything ambiguous must fall through to ordinary place search rather
    // than being force-decoded into a wrong point - the same rule
    // coordinateSearch.ts already follows for half-typed coordinates.
    for (const notACode of ["a+b", "C++ tutorial", "+91 9876543210", "1+1", "Hyderabad", "17.38, 78.48", "++", "AEIOU+AEIOU"]) {
      expect(findPlusCode(notACode), notACode).toBeNull();
    }
  });

  it("rejects codes using letters the alphabet excludes", () => {
    // Vowels are deliberately absent from the alphabet so codes cannot spell
    // words. A string with them in is not a code.
    expect(isFullPlusCode("8FVC9G8A+6X")).toBe(false);
    expect(isShortPlusCode("8VPE+PH2")).toBe(false);
  });

  it("reads a bare code with no address after it", () => {
    const found = findPlusCode("7MC48VPH+PH2")!;
    expect(found.full).toBe(true);
    expect(found.context).toBe("");
  });

  it("is case-insensitive, because people paste what they are given", () => {
    const found = findPlusCode("8vph+ph2, araku valley")!;
    expect(found.code).toBe("8VPH+PH2");
  });
});
