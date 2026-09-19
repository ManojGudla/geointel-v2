import type { GISEvidence } from "@/types/gis";
import type { NearbyCategory } from "@/types/intel";
import { invertedScore, saturatingScore, type SuitabilityFactor } from "./spatialMath";

/**
 * Site suitability scoring, built only from data this app actually has.
 *
 * A note on honesty, because this is the feature most tempting to fake.
 * Textbook suitability models weight things like census population, land
 * price and flood risk. None of those are available from a free source at
 * point level, so none of them are here. Every factor below is derived from
 * OpenStreetMap feature counts inside the selected radius — which is a real,
 * defensible signal, and is described to the user in exactly those terms.
 * A factor labelled "Population" that was secretly counting mapped houses
 * would be worth more in a demo and would be a lie, so the label says
 * "Residential density (mapped buildings)" instead.
 *
 * Weights are the user's to change. The defaults encode ordinary planning
 * intuition (a hospital wants people nearby and few competing hospitals; a
 * warehouse wants road access and no neighbours) and nothing more.
 */

export interface SuitabilityInputs {
  evidence: GISEvidence;
  /** Count of existing facilities of the chosen type within the radius. */
  competitionCount: number;
  radiusMeters: number;
}

interface FactorSpec {
  id: string;
  label: string;
  defaultWeight: number;
  compute: (inputs: SuitabilityInputs) => { score: number; basis: string };
}

/**
 * Reference values for "plenty of this within the radius". They set where
 * each curve flattens out, and are deliberately conservative — chosen so a
 * genuinely busy urban block reaches the high 80s rather than pinning at 100
 * and making every dense area look identical.
 */
const FACTORS: Record<string, FactorSpec> = {
  residential: {
    id: "residential",
    label: "Residential density (mapped buildings)",
    defaultWeight: 30,
    compute: ({ evidence, radiusMeters }) => ({
      score: saturatingScore(evidence.counts.residential, 150),
      basis: `${evidence.counts.residential} residential buildings mapped within ${radiusMeters} m`,
    }),
  },
  footfall: {
    id: "footfall",
    label: "Everyday activity (shops & amenities)",
    defaultWeight: 20,
    compute: ({ evidence, radiusMeters }) => ({
      score: saturatingScore(evidence.counts.amenities + evidence.counts.shops, 120),
      basis: `${evidence.counts.shops} shops and ${evidence.counts.amenities} amenities within ${radiusMeters} m`,
    }),
  },
  commercial: {
    id: "commercial",
    label: "Commercial presence (offices & retail)",
    defaultWeight: 20,
    compute: ({ evidence, radiusMeters }) => ({
      score: saturatingScore(evidence.counts.offices + evidence.counts.shops, 100),
      basis: `${evidence.counts.offices} offices and ${evidence.counts.shops} shops within ${radiusMeters} m`,
    }),
  },
  transport: {
    id: "transport",
    label: "Public transport access",
    defaultWeight: 20,
    compute: ({ evidence, radiusMeters }) => ({
      score: saturatingScore(evidence.counts.transport, 25),
      basis: `${evidence.counts.transport} transport features (stops, stations) within ${radiusMeters} m`,
    }),
  },
  industrial: {
    id: "industrial",
    label: "Industrial land nearby",
    defaultWeight: 30,
    compute: ({ evidence, radiusMeters }) => ({
      score: saturatingScore(evidence.counts.industrial, 20),
      basis: `${evidence.counts.industrial} industrial features within ${radiusMeters} m`,
    }),
  },
  quiet: {
    id: "quiet",
    label: "Distance from housing (fewer objections)",
    defaultWeight: 20,
    compute: ({ evidence, radiusMeters }) => ({
      score: invertedScore(evidence.counts.residential, 200),
      basis: `${evidence.counts.residential} residential buildings within ${radiusMeters} m (fewer scores higher here)`,
    }),
  },
  competition: {
    id: "competition",
    label: "Lack of direct competition",
    defaultWeight: 25,
    compute: ({ competitionCount, radiusMeters }) => ({
      score: invertedScore(competitionCount, 8),
      basis: `${competitionCount} similar facilities already within ${radiusMeters} m (fewer scores higher)`,
    }),
  },
};

export interface SuitabilityPreset {
  id: string;
  label: string;
  /** What counts as an existing competitor, queried through /api/nearby. */
  competition: NearbyCategory;
  /** Factor id -> starting weight. */
  weights: Record<string, number>;
}

export const SUITABILITY_PRESETS: SuitabilityPreset[] = [
  { id: "hospital", label: "Hospital or clinic", competition: "hospitals", weights: { residential: 35, transport: 20, competition: 30, footfall: 15 } },
  { id: "school", label: "School", competition: "schools", weights: { residential: 40, transport: 20, competition: 25, footfall: 15 } },
  { id: "retail", label: "Retail store", competition: "shopping", weights: { footfall: 35, commercial: 25, competition: 20, transport: 20 } },
  { id: "restaurant", label: "Restaurant or café", competition: "restaurants", weights: { footfall: 40, commercial: 20, competition: 25, transport: 15 } },
  { id: "hotel", label: "Hotel", competition: "hotels", weights: { transport: 30, footfall: 25, competition: 25, commercial: 20 } },
  { id: "warehouse", label: "Warehouse or depot", competition: "petrol", weights: { industrial: 40, transport: 30, quiet: 20, competition: 10 } },
];

/** A factor's display name without computing its score — for weight sliders, which have no data to score against yet. */
export function factorLabel(id: string): string {
  return FACTORS[id]?.label ?? id;
}

/** Builds the scored factor list for a preset, using the caller's (possibly edited) weights. */
export function buildFactors(weights: Record<string, number>, inputs: SuitabilityInputs): SuitabilityFactor[] {
  return Object.entries(weights).map(([id, weight]) => {
    const spec = FACTORS[id];
    if (!spec) {
      return { id, label: id, weight, score: 0, basis: "Unknown factor" };
    }
    const { score, basis } = spec.compute(inputs);
    return { id, label: spec.label, weight, score, basis };
  });
}
