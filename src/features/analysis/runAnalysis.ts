import type { AnalysisPoint, AnalysisResult } from "@/stores/analysisStore";
import type { NearbyCategory } from "@/types/intel";
import { fetchNearby } from "@/services/intel";
import { fetchGISEvidence } from "@/services/gis";
import { formatDistance } from "@/features/measure/measureMath";
import { bearingDegrees, compassPoint, nearest, scoreBand, weightedScore, within } from "./spatialMath";
import { buildFactors, SUITABILITY_PRESETS } from "./suitability";
import { categoryLabel } from "./categories";

/**
 * The single implementation of every spatial operation.
 *
 * Both entry points go through here — the Tools panel's controls and the AI
 * command bar — so a question asked in words and the same question asked
 * with dropdowns cannot produce different answers. That mattered enough to
 * be worth the indirection: "hospitals within 5 km" typed into the AI box
 * and selected from the panel are the same query, and a user who tried both
 * and got two answers would rightly stop trusting either.
 */
export interface AnalysisRequest {
  operation: "buffer" | "within" | "nearest" | "suitability";
  origin: { lat: number; lon: number };
  radiusMeters: number;
  category?: NearbyCategory;
  presetId?: string;
  /** Suitability only. Falls back to the preset's defaults. */
  weights?: Record<string, number>;
}

/** Distance the "nearest" search is willing to look before reporting nothing found. */
const NEAREST_SEARCH_RADIUS_METERS = 10_000;

function toPoints(items: Awaited<ReturnType<typeof fetchNearby>>): AnalysisPoint[] {
  return items.map((item) => ({
    id: item.id,
    lat: item.lat,
    lon: item.lon,
    label: item.name,
    distanceMeters: item.distanceMeters,
  }));
}

export async function runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
  const { origin, radiusMeters } = request;

  if (request.operation === "buffer") {
    const items = await fetchNearby(origin.lat, origin.lon, radiusMeters);
    const inside = within(toPoints(items), radiusMeters);

    const byCategory = new Map<string, number>();
    for (const item of items) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);

    return {
      kind: "buffer",
      title: `${formatDistance(radiusMeters)} buffer`,
      origin,
      bufferMeters: radiusMeters,
      points: inside,
      stats: [
        { label: "Places inside", value: String(inside.length) },
        { label: "Radius", value: formatDistance(radiusMeters) },
        { label: "Categories present", value: String(byCategory.size) },
        ...[...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, count]) => ({ label: categoryLabel(cat as NearbyCategory), value: String(count) })),
      ],
      note: "Counts are mapped OpenStreetMap features inside the ring, not a census. Coverage varies by area.",
    };
  }

  if (request.operation === "within") {
    const category = request.category ?? "hospitals";
    const items = await fetchNearby(origin.lat, origin.lon, radiusMeters, category);
    const inside = within(toPoints(items), radiusMeters);

    return {
      kind: "within",
      title: `${categoryLabel(category)} within ${formatDistance(radiusMeters)}`,
      origin,
      bufferMeters: radiusMeters,
      points: inside,
      stats: [
        { label: "Found", value: String(inside.length) },
        { label: "Closest", value: inside[0] ? formatDistance(inside[0].distanceMeters) : "—" },
        { label: "Furthest", value: inside.length ? formatDistance(inside[inside.length - 1]!.distanceMeters) : "—" },
      ],
      note: "Results are features tagged in OpenStreetMap. Somewhere unmapped will not appear here.",
    };
  }

  if (request.operation === "nearest") {
    const category = request.category ?? "hospitals";
    const items = await fetchNearby(origin.lat, origin.lon, NEAREST_SEARCH_RADIUS_METERS, category);
    const closest = nearest(toPoints(items));
    const label = categoryLabel(category).toLowerCase();

    if (!closest) {
      return {
        kind: "nearest",
        title: `Nearest ${label}`,
        origin,
        points: [],
        stats: [{ label: "Found", value: `None within ${formatDistance(NEAREST_SEARCH_RADIUS_METERS)}` }],
        note: "Nothing of this kind is mapped within 10 km in OpenStreetMap. That may mean none exists, or that it isn't mapped yet.",
      };
    }

    const bearing = bearingDegrees(origin, closest);
    return {
      kind: "nearest",
      title: `Nearest ${label}`,
      origin,
      points: [closest],
      connector: [
        [origin.lon, origin.lat],
        [closest.lon, closest.lat],
      ],
      stats: [
        { label: "Name", value: closest.label },
        { label: "Straight-line distance", value: formatDistance(closest.distanceMeters) },
        { label: "Direction", value: `${compassPoint(bearing)} (${Math.round(bearing)}°)` },
      ],
      note: "Straight-line distance, not travel distance — use Directions for a road route.",
    };
  }

  const preset = SUITABILITY_PRESETS.find((p) => p.id === request.presetId) ?? SUITABILITY_PRESETS[0]!;
  const [evidence, competitors] = await Promise.all([
    fetchGISEvidence(origin.lat, origin.lon, radiusMeters),
    fetchNearby(origin.lat, origin.lon, radiusMeters, preset.competition),
  ]);

  const factors = buildFactors(request.weights ?? preset.weights, { evidence, competitionCount: competitors.length, radiusMeters });
  const score = weightedScore(factors);

  return {
    kind: "suitability",
    title: `${preset.label} suitability`,
    origin,
    bufferMeters: radiusMeters,
    points: toPoints(competitors),
    stats: [
      { label: "Assessment radius", value: formatDistance(radiusMeters) },
      { label: "Existing similar facilities", value: String(competitors.length) },
      { label: "Mapped features considered", value: String(evidence.features.length) },
    ],
    suitability: { score, band: scoreBand(score), factors },
    note: "Scored from OpenStreetMap feature density within the radius. It does not include population statistics, land price or flood risk — no free source provides those at this level, so they are not modelled rather than guessed.",
  };
}

/** Zoom that frames a radius reasonably, so results never land off-screen. */
export function zoomForRadius(radiusMeters: number): number {
  if (radiusMeters > 8000) return 11;
  if (radiusMeters > 4000) return 12;
  if (radiusMeters > 1500) return 13.5;
  return 15;
}
