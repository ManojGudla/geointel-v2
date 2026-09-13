import { CITY_BY_SLUG, type City } from "@/data/cities";

/**
 * Which two cities a /compare/ URL is about, and which URL is the real one.
 *
 * The problem this file exists to solve is small and would quietly cost the
 * whole feature its ranking: a comparison of two places has no natural order.
 * "Hyderabad vs Bengaluru" and "Bengaluru vs Hyderabad" are the same page, and
 * people link to both. Served as two URLs with identical content they compete
 * with each other, split whatever authority the page earns, and give a crawler
 * a duplicate-content problem to resolve on its own — usually by ranking
 * neither.
 *
 * So both spellings work, and both declare the SAME canonical: the pair sorted
 * alphabetically. A visitor who follows "bengaluru-vs-hyderabad" sees exactly
 * what they asked for, in the order they asked for it, while the page tells
 * search engines there is one address for this comparison.
 */

export interface Pair {
  a: City;
  b: City;
  /** The one URL that represents this comparison, whatever order was requested. */
  canonicalSlug: string;
}

/** Parses "hyderabad-vs-bengaluru". Returns null for anything that is not a real pair. */
export function parsePairSlug(slug: string): Pair | null {
  const parts = slug.split("-vs-");
  if (parts.length !== 2) return null;

  const a = CITY_BY_SLUG.get(parts[0]!);
  const b = CITY_BY_SLUG.get(parts[1]!);
  if (!a || !b) return null;
  // Comparing a city with itself is not a comparison.
  if (a.slug === b.slug) return null;

  return { a, b, canonicalSlug: canonicalPairSlug(a.slug, b.slug) };
}

export function canonicalPairSlug(one: string, two: string): string {
  return [one, two].sort().join("-vs-");
}

/**
 * The pairs that go in the sitemap.
 *
 * Eight cities make twenty-eight possible comparisons. Listing all of them
 * would be exactly the programmatic bulk the brief warns against and search
 * engines discount — and most of those twenty-eight are comparisons nobody has
 * ever wanted to read. These six are ones people genuinely search for, so they
 * are the ones pushed. The other twenty-two still work, still render, and are
 * still indexable if a crawler finds them; they are simply not advertised.
 */
export const FEATURED_PAIRS: Array<[string, string]> = [
  ["hyderabad", "bengaluru"],
  ["mumbai", "delhi"],
  ["bengaluru", "chennai"],
  ["mumbai", "pune"],
  ["hyderabad", "chennai"],
  ["bengaluru", "delhi"],
];

export const FEATURED_PAIR_PATHS = FEATURED_PAIRS.map(([a, b]) => `/compare/${canonicalPairSlug(a, b)}`);

/**
 * Great-circle distance in kilometres.
 *
 * A real computed fact rather than a looked-up one, and one of the few numbers
 * on a comparison page that does not need a source: it follows from the two
 * coordinates, which are stated on the page itself.
 */
export function distanceKm(a: City, b: City): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)));
}
