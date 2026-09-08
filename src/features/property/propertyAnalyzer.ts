import type { GISEvidence, PropertyAnalysis, PropertyClassification } from "@/types/gis";
import { totalEvidenceCount } from "@/features/gis/evidenceTotal";

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
  const totalEvidence = totalEvidenceCount(counts);

  if (totalEvidence === 0) {
    return {
      classification: "Vacant / Unknown",
      confidence: 0,
      trust: "unavailable",
      evidence: ["No mapped buildings, shops, offices, amenities, tourism features, or transit infrastructure were found within this radius."],
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
    landmark: "Landmark",
    transport: "Transport",
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
  if (counts.tourism) evidenceLines.push(`${counts.tourism} tourism/landmark feature${counts.tourism === 1 ? "" : "s"}`);
  if (counts.transport) evidenceLines.push(`${counts.transport} transit feature${counts.transport === 1 ? "" : "s"}`);
  evidenceLines.push(`${counts.buildings} mapped buildings total within ${evidence.radiusMeters}m`);

  // topScore can be 0 even though totalEvidence > 0 — e.g. only generic
  // `building=yes` ways with no shop/office/amenity/tourism/transport tag
  // nearby, so every score bucket lands at 0. That's real, if unclassified,
  // evidence, not literal vacancy, so the reasoning text has to say that
  // rather than reusing the "concentrated in vacant / unknown features"
  // phrasing this used to fall into (which reads as nonsense — you can't be
  // "concentrated in" a classification that means "no classification").
  const reasoning =
    topScore === 0
      ? `${totalEvidence} feature${totalEvidence === 1 ? " is" : "s are"} mapped within ${evidence.radiusMeters}m, but none carry a specific-enough OpenStreetMap tag (shop, office, amenity, tourism, transit, or a typed building) to classify — for example a bare 'building=yes' with nothing else nearby.`
      : isMixed
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
