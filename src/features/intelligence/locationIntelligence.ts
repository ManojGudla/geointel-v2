import type { GISEvidence, GISFeature } from "@/types/gis";
import { bucketFeature } from "@/features/gis/layerBuckets";
import { saturatingScore } from "@/features/analysis/spatialMath";

/**
 * The Location Intelligence score: one headline number for a place, built
 * from dimensions that each state their own evidence.
 *
 * The hard part of a feature like this is not the arithmetic - it is
 * refusing to fill the gaps. A seven-dimension score card looks far more
 * impressive with seven numbers in it than with five numbers and two honest
 * "not enough data" cards, and every one of those invented numbers would be
 * indistinguishable from a real one to the person reading it. So:
 *
 *  - Risk is scored ONLY when a real air-quality reading is loaded. There is
 *    no free flood, seismic or crime dataset behind this app, so without
 *    that reading the card says so.
 *  - Competition is not scored at all here, because "competition" is
 *    meaningless until you say competition FOR WHAT. It points at the
 *    suitability tool, where you choose a use and it becomes answerable.
 *  - The overall score is the weighted mean of the dimensions that actually
 *    have data, and the card says how many contributed - so a score built
 *    from four dimensions can't be mistaken for one built from six.
 *
 * Everything else comes from counts api/gis.ts already computed from real
 * Overpass data, so opening this panel costs no additional network request.
 */

export type DimensionState = "scored" | "insufficient" | "needs-choice";

export interface IntelligenceDimension {
  id: string;
  label: string;
  state: DimensionState;
  /** 0-100. Only meaningful when state === "scored". */
  score: number | null;
  /** Relative importance in the overall score. Ignored unless scored. */
  weight: number;
  /** The raw evidence this number came from, or why there isn't any. */
  basis: string;
  /** What this dimension means, in plain language. */
  hint: string;
}

export interface LocationIntelligence {
  /** 0-100, or null when too few dimensions could be scored to mean anything. */
  overall: number | null;
  band: "Strong" | "Good" | "Moderate" | "Limited" | null;
  dimensions: IntelligenceDimension[];
  /** How many dimensions contributed to `overall`. */
  scoredCount: number;
  /** Overall data confidence, derived from coverage - never a fabricated percentage. */
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  sources: string[];
}

/**
 * Below this many scored dimensions, an overall number would be an average
 * of almost nothing wearing the authority of a single figure.
 */
const MIN_DIMENSIONS_FOR_OVERALL = 3;

function countFeaturesInLayer(features: GISFeature[], layer: string): number {
  return features.filter((f) => bucketFeature(f).includes(layer as never)).length;
}

function band(score: number): LocationIntelligence["band"] {
  if (score >= 80) return "Strong";
  if (score >= 62) return "Good";
  if (score >= 42) return "Moderate";
  return "Limited";
}

export interface IntelligenceInputs {
  evidence: GISEvidence;
  /** European AQI for the point, when the live air-quality reading has loaded. */
  europeanAqi?: number | null;
}

export function computeLocationIntelligence({ evidence, europeanAqi }: IntelligenceInputs): LocationIntelligence {
  const { counts, features, radiusMeters } = evidence;
  const within = `within ${radiusMeters} m`;

  const parks = countFeaturesInLayer(features, "parks");
  const water = countFeaturesInLayer(features, "water");
  const green = parks + water;

  const dimensions: IntelligenceDimension[] = [
    {
      id: "accessibility",
      label: "Accessibility",
      state: "scored",
      score: saturatingScore(counts.transport, 25),
      weight: 20,
      basis: `${counts.transport} public transport features (stops, stations, platforms) mapped ${within}. Road-network connectivity is not included. Road geometry isn't fetched at this scale.`,
      hint: "How well served this area is by mapped public transport.",
    },
    {
      id: "business",
      label: "Business activity",
      state: "scored",
      score: saturatingScore(counts.shops + counts.offices, 110),
      weight: 20,
      basis: `${counts.shops} shops and ${counts.offices} offices mapped ${within}.`,
      hint: "How much commercial activity is mapped around this point.",
    },
    {
      id: "amenities",
      label: "Amenities",
      state: "scored",
      score: saturatingScore(counts.amenities, 90),
      weight: 18,
      basis: `${counts.amenities} amenities (food, health, education, civic and similar) mapped ${within}.`,
      hint: "Everyday services and facilities within reach.",
    },
    {
      id: "builtform",
      label: "Built form",
      state: "scored",
      score: saturatingScore(counts.buildings, 300),
      weight: 15,
      basis: `${counts.buildings} buildings mapped ${within}, of which ${counts.residential} are residential.`,
      hint: "How densely built up the surrounding area is.",
    },
    {
      id: "environment",
      label: "Environment",
      state: green > 0 ? "scored" : "insufficient",
      score: green > 0 ? saturatingScore(green, 12) : null,
      weight: 12,
      basis:
        green > 0
          ? `${parks} parks and ${water} water features mapped ${within}.`
          : `No parks or water features are mapped ${within}. That may mean none exist, or that they aren't mapped here yet. The two can't be told apart from this data.`,
      hint: "Green space and water in the surrounding area.",
    },
    {
      id: "risk",
      label: "Air quality risk",
      state: typeof europeanAqi === "number" ? "scored" : "insufficient",
      // The European AQI runs 0 (clean) to 100+ (extremely poor), so a good
      // environment must invert it to score highly here.
      score: typeof europeanAqi === "number" ? Math.max(0, Math.min(100, Math.round(100 - europeanAqi))) : null,
      weight: 15,
      basis:
        typeof europeanAqi === "number"
          ? `European AQI of ${Math.round(europeanAqi)} at this point, from a modelled coarse grid.`
          : "No air-quality reading is loaded for this point. Flood, seismic and crime risk are not scored at all. This app has no free data source for any of them, so they are left out rather than estimated.",
      hint: "Environmental risk, from measured air quality only.",
    },
    {
      id: "competition",
      label: "Competition",
      state: "needs-choice",
      score: null,
      weight: 0,
      basis: "Competition depends entirely on what you'd be competing with. Pick a use in Analyze → Suitability and it becomes a real number.",
      hint: "How crowded this area already is for a particular use.",
    },
  ];

  const scored = dimensions.filter((d) => d.state === "scored" && d.score !== null);
  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  const overall =
    scored.length >= MIN_DIMENSIONS_FOR_OVERALL && totalWeight > 0
      ? Math.round(scored.reduce((sum, d) => sum + (d.score as number) * d.weight, 0) / totalWeight)
      : null;

  // Confidence describes COVERAGE - how much of the picture the data fills -
  // not how correct the arithmetic is. A precise number here would imply a
  // statistical basis that doesn't exist.
  const totalMapped = counts.buildings + counts.shops + counts.offices + counts.amenities + counts.transport;
  let confidence: LocationIntelligence["confidence"] = "Low";
  let confidenceReason = "";
  if (totalMapped >= 150 && scored.length >= 5) {
    confidence = "High";
    confidenceReason = `${totalMapped.toLocaleString()} mapped features and ${scored.length} of ${dimensions.length - 1} dimensions scored.`;
  } else if (totalMapped >= 30 && scored.length >= 4) {
    confidence = "Medium";
    confidenceReason = `${totalMapped.toLocaleString()} mapped features ${within}. Some dimensions could not be scored.`;
  } else {
    confidence = "Low";
    confidenceReason =
      totalMapped === 0
        ? `Nothing is mapped ${within} in OpenStreetMap, so there is almost nothing to score.`
        : `Only ${totalMapped.toLocaleString()} features are mapped ${within}, which is thin coverage, so treat these scores as indicative.`;
  }

  const sources = ["OpenStreetMap / Overpass"];
  if (typeof europeanAqi === "number") sources.push("Open-Meteo Air Quality (CAMS)");

  return {
    overall,
    band: overall === null ? null : band(overall),
    dimensions,
    scoredCount: scored.length,
    confidence,
    confidenceReason,
    sources,
  };
}

/**
 * The "Why this score?" breakdown: each scored dimension's contribution to
 * the overall figure, expressed as points above or below the midpoint.
 *
 * Signed contributions rather than raw scores because that is the question
 * being asked - not "how did each dimension do" but "what pushed this number
 * up and what pulled it down". A dimension scoring 50 is pulling neither way
 * and should read as roughly zero, which a raw score cannot express.
 */
export interface Contribution {
  label: string;
  points: number;
  basis: string;
}

export function scoreContributions(intelligence: LocationIntelligence): Contribution[] {
  const scored = intelligence.dimensions.filter((d) => d.state === "scored" && d.score !== null);
  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return [];

  return scored
    .map((d) => ({
      label: d.label,
      points: Math.round((((d.score as number) - 50) * d.weight) / totalWeight),
      basis: d.basis,
    }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}
