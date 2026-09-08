import type { GISEvidence } from "@/types/gis";

/**
 * How much real evidence Overpass actually returned, across EVERY bucket
 * classifyFeatures() (api/gis.ts) tracks — not a hand-picked subset. Shared
 * by propertyAnalyzer.ts and GISEvidencePanel.tsx so "is there any evidence
 * at all" is computed exactly once on the client, mirroring
 * totalEvidenceCount() in api/gis.ts on the server (client code can't import
 * a server function from api/, so that one is a deliberate duplicate — keep
 * both in sync when a new count bucket is added).
 *
 * This is the fix for a real bug: a landmark like the Eiffel Tower is
 * tagged tourism=attraction with no building/shop/office/amenity tag of its
 * own, so a sum that only covered those 4 buckets read it as zero evidence
 * — "Vacant / Unknown" and "No mapped features found" — despite Overpass
 * returning real data for exactly the thing being looked up.
 */
export function totalEvidenceCount(counts: GISEvidence["counts"]): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
