import type { GISEvidence, PropertyAnalysis, PropertyClassification } from "@/types/gis";

const MIN_EVIDENCE_FOR_CONFIDENCE = 6;

/**
 * Deterministic, evidence-based classification — no AI involved. Runs
 * instantly client-side against the counts/scores api/gis.ts already
 * computed from real Overpass data, so changing how confidence or evidence
 * text reads never requires a second network round-trip.
 *
 * This is the same principle the audit confirmed as sound in the previous
 * project's propertyAnalyzer: never invent a classification when there's no
 * mapped evidence to support it — say so instead.
 */
export function analyzeProperty(evidence: GISEvidence): PropertyAnalysis {
  const { scores, counts } = evidence;
  const totalEvidence = counts.buildings + counts.shops + counts.offices + counts.amenities;

  if (totalEvidence === 0) {
    return {
      classification: "Vacant / Unknown",
      confidence: 0,
      trust: "unavailable",
      evidence: ["No mapped buildings, shops, offices or amenities were found within this radius."],
      reasoning: "OpenStreetMap has no recorded features here yet. This does not mean the area is empty — only that it isn't mapped in detail.",
      scores,
      sources: ["OpenStreetMap / Overpass"],
    };
  }

  const ranked = (Object.entries(scores) as Array<[keyof typeof scores, number]>).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = ranked[0]!;
  const [, secondScore] = ranked[1] ?? ["", 0];

  const classificationMap: Record<keyof typeof scores, PropertyClassification> = {
    commercial: "Commercial",
    residential: "Residential",
    industrial: "Industrial",
    institutional: "Institutional",
  };

  const margin = topScore - secondScore;
  const isMixed = topScore > 0 && margin < topScore * 0.25;
  const classification: PropertyClassification = topScore === 0 ? "Vacant / Unknown" : isMixed ? "Mixed Use" : classificationMap[topKey];

  // Confidence blends how dominant the top category is over the runner-up
  // with how much evidence exists overall — a 2-vs-0 feature count and a
  // 40-vs-5 feature count shouldn't read as equally confident.
  const dominance = topScore === 0 ? 0 : Math.min(1, margin / topScore);
  const volumeFactor = Math.min(1, totalEvidence / MIN_EVIDENCE_FOR_CONFIDENCE);
  const confidence = Math.round(dominance * 0.6 * 100 + volumeFactor * 0.4 * 100);

  const evidenceLines: string[] = [];
  if (counts.shops) evidenceLines.push(`${counts.shops} mapped shop${counts.shops === 1 ? "" : "s"}`);
  if (counts.offices) evidenceLines.push(`${counts.offices} office${counts.offices === 1 ? "" : "s"}`);
  if (counts.residential) evidenceLines.push(`${counts.residential} residential building${counts.residential === 1 ? "" : "s"}`);
  if (counts.industrial) evidenceLines.push(`${counts.industrial} industrial feature${counts.industrial === 1 ? "" : "s"}`);
  if (counts.institutional) evidenceLines.push(`${counts.institutional} institutional feature${counts.institutional === 1 ? "" : "s"}`);
  if (counts.amenities) evidenceLines.push(`${counts.amenities} amenities`);
  evidenceLines.push(`${counts.buildings} mapped buildings total within ${evidence.radiusMeters}m`);

  const reasoning = isMixed
    ? `The mapped evidence within ${evidence.radiusMeters}m is closely split between multiple use types, with no single category clearly dominant.`
    : `The mapped evidence within ${evidence.radiusMeters}m is concentrated in ${classification.toLowerCase()} features relative to other categories.`;

  return {
    classification,
    confidence,
    trust: totalEvidence < 3 ? "inferred" : "verified",
    evidence: evidenceLines,
    reasoning,
    scores,
    sources: ["OpenStreetMap / Overpass"],
  };
}
