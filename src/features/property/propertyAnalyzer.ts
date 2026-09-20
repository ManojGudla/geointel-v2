import type { GISEvidence, PropertyAnalysis, PropertyClassification } from "@/types/gis";
import { totalEvidenceCount } from "@/features/gis/evidenceTotal";

const MIN_EVIDENCE_FOR_CONFIDENCE = 6;

/**
 * Deterministic, evidence-based classification - no AI involved. Runs
 * instantly client-side against the counts/scores api/gis.ts already
 * computed from real Overpass data, so changing how confidence or evidence
 * text reads never requires a second network round-trip.
 *
 * This is the same principle the audit confirmed as sound in the previous
 * project's propertyAnalyzer: never invent a classification when there's no
 * mapped evidence to support it - say so instead.
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
      reasoning: "OpenStreetMap has no recorded features here yet. This does not mean the area is empty, only that it isn't mapped in detail.",
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
  const areaClassification: PropertyClassification =
    topScore === 0 ? "Vacant / Unknown" : isMixed ? "Mixed Use" : classificationMap[topKey];

  /*
    The feature at the point wins.

    This panel is called Property Intelligence and prints a confidence figure
    against a specific address, so it has to answer "what is this property",
    not "what is this neighbourhood mostly made of". Those are different
    questions and the app was answering the second while presenting the
    first. Waverock in Hyderabad, a commercial office complex, came back
    RESIDENTIAL at 68% because forty houses within 250m outscored it.

    When a mapped feature sits on the point, it IS the property and the
    surroundings are context. A house inside a business district is still a
    house, which is the right answer and the one this rule gives.
  */
  const subject = evidence.subject ?? null;
  const classification: PropertyClassification = subject ? classificationMap[subject.category] : areaClassification;

  /*
    Confidence now means one thing: how sure are we about THIS property.

    With a subject we know what it is, and the only open question is whether
    the surroundings back it up. Without one we are inferring from the area,
    which deserves a hard ceiling no amount of nearby evidence can lift: a
    guess from context is never as good as reading the label.
  */
  const dominance = topScore === 0 ? 0 : Math.min(1, margin / topScore);
  const volumeFactor = Math.min(1, totalEvidence / MIN_EVIDENCE_FOR_CONFIDENCE);
  const areaAgrees = subject ? classificationMap[topKey] === classification : false;
  const confidence = subject
    ? Math.round(70 + (areaAgrees ? 25 : 10) * volumeFactor)
    : Math.min(60, Math.round(dominance * 0.6 * 100 + volumeFactor * 0.4 * 100));

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

  // topScore can be 0 even though totalEvidence > 0 - e.g. only generic
  // `building=yes` ways with no shop/office/amenity/tourism/transport tag
  // nearby, so every score bucket lands at 0. That's real, if unclassified,
  // evidence, not literal vacancy, so the reasoning text has to say that
  // rather than reusing the "concentrated in vacant / unknown features"
  // phrasing this used to fall into (which reads as nonsense - you can't be
  // "concentrated in" a classification that means "no classification").
  /*
    Say which question was answered.

    The old text always described the radius ("the mapped evidence within
    250m is concentrated in residential features") while the headline above
    it read as a statement about the building. Both halves were individually
    defensible and together they misled.
  */
  const subjectName = subject?.name ? `"${subject.name}"` : `a ${subject?.kind}`;
  const reasoning = subject
    ? `OpenStreetMap has ${subjectName} mapped ${subject.distanceMeters <= 5 ? "at this point" : `${subject.distanceMeters}m from this point`}, tagged as ${subject.kind}. That is what this classification describes. The ${totalEvidence} features within ${evidence.radiusMeters}m are the surrounding area, and they ${areaAgrees ? "agree with it" : `lean ${areaClassification.toLowerCase()}`}.`
    : topScore === 0
      ? `${totalEvidence} feature${totalEvidence === 1 ? " is" : "s are"} mapped within ${evidence.radiusMeters}m, but none carry a specific-enough OpenStreetMap tag (shop, office, amenity, tourism, transit, or a typed building) to classify. A bare 'building=yes' with nothing else nearby is the usual case.`
      : `Nothing is mapped at this exact point, so this describes the area rather than the building: the evidence within ${evidence.radiusMeters}m ${isMixed ? "is closely split between several use types" : `leans ${classification.toLowerCase()}`}. Click directly on a building for a reading of that building.`;

  /*
    The badge now means what it says.

    "VERIFIED" used to be awarded for totalEvidence >= 3, so it meant
    "Overpass returned at least three things nearby" and nothing at all
    about whether the classification was right. It was the strongest word on
    the panel attached to the weakest claim, and it is what turned a wrong
    answer into a confidently wrong one. It is now earned only when there is
    a named mapped feature at the point to point at.
  */
  const trust = subject ? "verified" : totalEvidence === 0 ? "unavailable" : "inferred";

  return {
    classification,
    confidence,
    trust,
    evidence: subject
      ? [
          `${subject.name ? `${subject.name}: ` : ""}${subject.kind}, mapped ${subject.distanceMeters <= 5 ? "at this point" : `${subject.distanceMeters}m away`}`,
          ...evidenceLines,
        ]
      : evidenceLines,
    reasoning,
    scores,
    sources: ["OpenStreetMap / Overpass"],
  };
}
