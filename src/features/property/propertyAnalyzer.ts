import type { BuildingFacts, GISEvidence, PropertyAnalysis, PropertyClassification, PropertySite, SiteFeature } from "@/types/gis";
import { totalEvidenceCount } from "../gis/evidenceTotal.js";
import { addressFromTags, article, heightFromTags, readArea, readBuildingType, readBusiness, readName, structureKind, type Use, type UseReading } from "./buildingUse.js";

const MIN_EVIDENCE_FOR_CONFIDENCE = 6;

/*
  Said with every result, because the most expensive misreading of this panel
  is taking a tag for a legal fact. OpenStreetMap records how volunteers
  labelled a place. It is not a zoning map, a land register or a census.
*/
const OSM_IS_NOT_LEGAL_USE =
  "Based on OpenStreetMap tags, which describe how a place is mapped, not its legal zoning, ownership, value or whether it is occupied.";
const COVERAGE_VARIES = "OpenStreetMap coverage varies by area; sparse mapping can under-count what is really there.";

const EMPTY_SCORES: GISEvidence["scores"] = { commercial: 0, residential: 0, industrial: 0, institutional: 0, landmark: 0, transport: 0 };

/**
 * What kind of property is at a point. Deterministic, evidence-based, no AI.
 *
 * With `site` (from /api/property, the building at the exact point) the
 * answer comes from that building, strongest evidence first:
 *   1. the building's own type (building=office, building=apartments ...)
 *      and any business tag on it,               VERIFIED, 90% (75% if next to it)
 *   2. businesses mapped inside its footprint,   VERIFIED, 80%
 *   3. the land or site it stands on,            INFERRED, 60-70%
 *   4. a telling word in its name,               INFERRED, 45%
 *   5. otherwise Unknown: a building is there, its use is not mapped.
 * The surroundings (`evidence`, the area within the chosen radius) are shown
 * as context and never change the answer about the building.
 *
 * Without `site` (an older page, or the building lookup failed) it falls back
 * to reading the area, as it used to, and never calls that VERIFIED.
 */
export function analyzeProperty(evidence: GISEvidence | null | undefined, site?: PropertySite | null): PropertyAnalysis {
  if (site) return analyzeSite(site, evidence ?? null);
  if (!evidence) {
    return {
      classification: "Unknown",
      confidence: 0,
      trust: "unavailable",
      evidence: ["Neither the building at this point nor the area around it could be read."],
      reasoning: "The map data for this point did not load, so there is nothing to classify from yet.",
      scores: EMPTY_SCORES,
      sources: ["OpenStreetMap / Overpass"],
      retrievedAt: new Date().toISOString(),
      limitations: [OSM_IS_NOT_LEGAL_USE],
      basis: "none",
    };
  }
  return analyzeArea(evidence);
}

/* ---------------------------------------------------------------- the building at the point */

function buildingFacts(site: PropertySite): BuildingFacts | undefined {
  const b = site.building;
  if (!b) return undefined;
  const typed = readBuildingType(b.tags);
  const height = heightFromTags(b.tags);
  return {
    name: b.tags.name ?? b.tags["name:en"],
    kind: typed?.kind ?? (structureKind(b.tags) === "building" ? "building (its use is not mapped)" : structureKind(b.tags)),
    osmUrl: b.url,
    containsPoint: b.containsPoint,
    distanceMeters: b.distanceMeters,
    heightMeters: height.meters,
    heightSource: height.source,
    levels: height.levels,
    footprintM2: b.footprintM2,
    address: addressFromTags(b.tags),
  };
}

/** Counts readings by use, most common first. */
function tally(readings: UseReading[]): Array<[Use, number]> {
  const counts = new Map<Use, number>();
  for (const r of readings) counts.set(r.use, (counts.get(r.use) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function listInside(inside: Array<{ feature: SiteFeature; reading: UseReading }>, max = 3): string {
  const named = inside.slice(0, max).map(({ feature, reading }) => (feature.tags.name ? `${feature.tags.name} (${reading.kind})` : reading.kind));
  const more = inside.length - named.length;
  return more > 0 ? `${named.join(", ")} and ${more} more` : named.join(", ");
}

function surroundingsLine(evidence: GISEvidence | null): string | undefined {
  if (!evidence) return undefined;
  const c = evidence.counts;
  const parts: string[] = [];
  if (c.residential) parts.push(`${c.residential} residential building${c.residential === 1 ? "" : "s"}`);
  if (c.shops) parts.push(`${c.shops} shop${c.shops === 1 ? "" : "s"}`);
  if (c.offices) parts.push(`${c.offices} office${c.offices === 1 ? "" : "s"}`);
  if (c.industrial) parts.push(`${c.industrial} industrial feature${c.industrial === 1 ? "" : "s"}`);
  if (c.institutional) parts.push(`${c.institutional} public or institutional feature${c.institutional === 1 ? "" : "s"}`);
  if (!parts.length) return undefined;
  return `Around it, within ${evidence.radiusMeters} m: ${parts.join(", ")}. That describes the area, not this property.`;
}

function analyzeSite(site: PropertySite, evidence: GISEvidence | null): PropertyAnalysis {
  const b = site.building;
  const facts = buildingFacts(site);
  const links: Array<{ label: string; url: string }> = [];
  const lines: string[] = [];
  const limitations = [OSM_IS_NOT_LEGAL_USE];
  const sources = ["OpenStreetMap / Overpass"];
  const surroundings = surroundingsLine(evidence);
  const retrievedAt = site.fetchedAt;

  const done = (
    classification: PropertyClassification,
    trust: PropertyAnalysis["trust"],
    confidence: number,
    reasoning: string,
    basis: NonNullable<PropertyAnalysis["basis"]>
  ): PropertyAnalysis => ({
    classification,
    confidence: classification === "Unknown" ? 0 : confidence,
    trust: classification === "Unknown" ? "unavailable" : trust,
    evidence: surroundings ? [...lines, surroundings] : lines,
    reasoning,
    scores: evidence?.scores ?? EMPTY_SCORES,
    sources,
    retrievedAt,
    limitations: [...limitations, COVERAGE_VARIES],
    basis,
    building: facts,
    links,
    surroundings,
  });

  const landReading = site.areas.map((area) => ({ area, reading: readArea(area.tags) })).find((a) => a.reading !== null) ?? null;
  const landText = (r: NonNullable<typeof landReading>) => `${r.reading!.kind}${r.area.tags.name ? ` (${r.area.tags.name})` : ""}`;

  if (b && facts) {
    const name = facts.name ? `"${facts.name}"` : "The building here";
    const where = b.containsPoint ? "this point is inside it" : `this point is ${b.distanceMeters} m from its outline`;
    const nextToPenalty = b.containsPoint ? 0 : 15;
    links.push({ label: facts.name ? `${facts.name} on OpenStreetMap` : "This building on OpenStreetMap", url: b.url });
    lines.push(`Building: ${facts.name ? `${facts.name}, ` : ""}${facts.kind} (OpenStreetMap ${b.osmType} ${b.id}), ${b.containsPoint ? "the point is inside it" : `${b.distanceMeters} m from the point`}`);
    if (facts.heightMeters !== null) {
      lines.push(
        facts.heightSource === "mapped"
          ? `Height: ${facts.heightMeters} m, as mapped${facts.levels ? `, ${facts.levels} floors` : ""}`
          : `Height: about ${facts.heightMeters} m, worked out from ${facts.levels} floors at 3.2 m each`
      );
    } else {
      lines.push("Height: not mapped");
    }

    const typed = readBuildingType(b.tags);
    const own = readBusiness(b.tags);
    const inside = site.inside
      .map((feature) => ({ feature, reading: readBusiness(feature.tags) }))
      .filter((x): x is { feature: SiteFeature; reading: UseReading } => x.reading !== null);
    if (inside.length) {
      lines.push(`Mapped inside it: ${inside.length} (${listInside(inside, 4)})`);
      for (const { feature } of inside.slice(0, 3)) links.push({ label: `${feature.tags.name ?? readBusiness(feature.tags)!.kind} on OpenStreetMap`, url: feature.url });
    }
    if (landReading) {
      lines.push(`Land: ${landText(landReading)}`);
      links.push({ label: `${landReading.area.tags.name ?? landReading.reading!.kind} on OpenStreetMap`, url: landReading.area.url });
    }

    const businessUses = [...(own ? [own] : []), ...inside.map((x) => x.reading)];
    const commercialInside = businessUses.filter((r) => r.use === "Commercial");

    // 1. The building's own type, and any business on or in it.
    if (typed) {
      if (typed.use === "Residential" && commercialInside.length) {
        return done(
          "Mixed Use",
          "verified",
          90 - nextToPenalty,
          `${name} is mapped in OpenStreetMap as ${article(typed.kind)} ${typed.kind} (${typed.tag}), with ${commercialInside.length === 1 ? "a business" : `${commercialInside.length} businesses`} mapped in it (${listInside(inside.length ? inside : [{ feature: { osmType: b.osmType, id: b.id, url: b.url, tags: b.tags }, reading: own! }])}). Homes and businesses in one building is mixed use. ${capitalise(where)}.`,
          "building"
        );
      }
      if (own && own.use !== typed.use) {
        // The business tag says what the building is used for now.
        return done(
          own.use,
          "verified",
          85 - nextToPenalty,
          `${name} is mapped as ${article(typed.kind)} ${typed.kind} (${typed.tag}) and tagged as ${article(own.kind)} ${own.kind} (${own.tag}), which is what it is used for. ${capitalise(where)}.`,
          "building"
        );
      }
      const agreeing = businessUses.length > 0 && businessUses.every((r) => r.use === typed.use);
      return done(
        typed.use,
        "verified",
        (agreeing ? 95 : 90) - nextToPenalty,
        `${name} is mapped in OpenStreetMap as ${article(typed.kind)} ${typed.kind} (${typed.tag}), and ${where}.${agreeing ? ` The ${businessUses.length === 1 ? "business" : "businesses"} mapped in it agree.` : ""}`,
        "building"
      );
    }

    // 2. No type of its own, but businesses on it or mapped inside it.
    if (businessUses.length) {
      const ranked = tally(businessUses);
      const [topUse, topCount] = ranked[0]!;
      const share = topCount / businessUses.length;
      const what = own && !inside.length ? `it is tagged as ${article(own.kind)} ${own.kind} (${own.tag})` : `${businessUses.length === 1 ? "one business is" : `${businessUses.length} businesses are`} mapped inside it: ${listInside(inside.length ? inside : [{ feature: { osmType: b.osmType, id: b.id, url: b.url, tags: b.tags }, reading: own! }], 4)}`;
      if (share >= 0.75) {
        return done(topUse, "verified", 80 - nextToPenalty, `${name} has no type of its own on the map, but ${what}. ${capitalise(where)}.`, "inside");
      }
      return done("Mixed Use", "verified", 75 - nextToPenalty, `${name} has no type of its own on the map, and what is mapped inside it is a mix: ${listInside(inside, 4)}. ${capitalise(where)}.`, "inside");
    }

    // 3. Nothing about the building's use is mapped: the land it stands on.
    limitations.push("This building's own use is not mapped, so the answer is inferred and not checked against the building.");
    if (landReading) {
      const { reading } = landReading;
      return done(
        reading!.use,
        "inferred",
        (landReading.reading!.campus ? 70 : 60) - nextToPenalty,
        `${name} is mapped, but not what it is used for. It stands on ${landText(landReading)}, so it is most likely ${reading!.use.toLowerCase()}. ${capitalise(where)}.`,
        "land"
      );
    }

    // 4. A word in its name.
    const fromName = readName(facts.name);
    if (fromName) {
      return done(
        fromName.use,
        "inferred",
        45 - nextToPenalty,
        `${name} is mapped, but not what it is used for, and no land use is mapped around it. The word ${fromName.kind} suggests ${fromName.use.toLowerCase()}, which is a guess from the name only.`,
        "name"
      );
    }

    // 5. Honest Unknown.
    return done(
      "Unknown",
      "unavailable",
      0,
      `A ${facts.kind === "building (its use is not mapped)" ? "building" : facts.kind} is mapped here, but nothing on the map says what it is used for: no type, no businesses inside it and no land use around it.${surroundings ? " The surroundings are listed below as context only." : ""} If you know it, it can be added on OpenStreetMap.`,
      "none"
    );
  }

  // No building at or next to the point.
  limitations.push("No building is mapped at this exact point, so this is not a reading of a building.");
  if (landReading) {
    lines.push(`No building is mapped at this point. Land: ${landText(landReading)}`);
    links.push({ label: `${landReading.area.tags.name ?? landReading.reading!.kind} on OpenStreetMap`, url: landReading.area.url });
    return done(
      landReading.reading!.use,
      "inferred",
      50,
      `No building is mapped at this exact point. The land here is mapped as ${landText(landReading)}. Tap directly on a building to read that building.`,
      "land"
    );
  }

  if (evidence && totalEvidenceCount(evidence.counts) > 0) {
    const area = analyzeArea({ ...evidence, subject: null });
    if (area.classification !== "Unknown") {
      return {
        ...area,
        confidence: Math.min(area.confidence, 40),
        reasoning: `No building is mapped at this exact point, and the land use is not mapped either, so this only describes the surroundings: ${area.reasoning.replace(/^Nothing is mapped at this exact point, so this describes the area rather than the building: /, "")}`,
        limitations: [...limitations, ...area.limitations.filter((l) => l !== OSM_IS_NOT_LEGAL_USE)],
        basis: "area",
        links,
        surroundings,
        retrievedAt,
      };
    }
  }

  lines.push("No building, business or land use is mapped at this point.");
  return done(
    "Unknown",
    "unavailable",
    0,
    "Nothing is mapped at this exact point: no building, no business and no land use. This does not mean it is empty, only that it is not mapped in detail. Tap directly on a building to read that building.",
    "none"
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/* ---------------------------------------------------------------- the area (fallback) */

/**
 * The area around the point: the old reading, kept for when the building at
 * the point cannot be checked. It is never VERIFIED any more. It was, when a
 * classified feature's centre lay within 35 m, and that is how an office
 * tower came back "RESIDENTIAL, VERIFIED, 95%": the area endpoint snaps the
 * point by up to about 55 m for caching, and the nearest centre was a house.
 */
function analyzeArea(evidence: GISEvidence): PropertyAnalysis {
  const { scores, counts } = evidence;
  const totalEvidence = totalEvidenceCount(counts);

  if (totalEvidence === 0) {
    return {
      classification: "Unknown",
      confidence: 0,
      trust: "unavailable",
      evidence: ["No mapped buildings, shops, offices, amenities, tourism features, or transit infrastructure were found within this radius."],
      reasoning: "OpenStreetMap has no recorded features here yet. This does not mean the area is empty, only that it isn't mapped in detail.",
      scores,
      sources: ["OpenStreetMap / Overpass"],
      retrievedAt: evidence.fetchedAt,
      limitations: [OSM_IS_NOT_LEGAL_USE, COVERAGE_VARIES],
      basis: "none",
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
  const areaClassification: PropertyClassification = topScore === 0 ? "Unknown" : isMixed ? "Mixed Use" : classificationMap[topKey];

  const subject = evidence.subject ?? null;
  const classification: PropertyClassification = subject ? classificationMap[subject.category] : areaClassification;

  const dominance = topScore === 0 ? 0 : Math.min(1, margin / topScore);
  const volumeFactor = Math.min(1, totalEvidence / MIN_EVIDENCE_FOR_CONFIDENCE);
  const areaAgrees = subject ? classificationMap[topKey] === classification : false;
  // Without the building check, nothing here is more than an inference.
  const confidence = Math.min(60, subject ? Math.round(45 + (areaAgrees ? 15 : 5) * volumeFactor) : Math.round(dominance * 0.6 * 100 + volumeFactor * 0.4 * 100));

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

  const subjectName = subject?.name ? `"${subject.name}"` : `a ${subject?.kind}`;
  const reasoning = subject
    ? `OpenStreetMap has ${subjectName} mapped near this spot, tagged as ${subject.kind}, but the building at the exact point could not be checked, so this is an inference. The ${totalEvidence} features within ${evidence.radiusMeters}m are the surrounding area, and they ${areaAgrees ? "agree with it" : `lean ${areaClassification.toLowerCase()}`}.`
    : topScore === 0
      ? `${totalEvidence} feature${totalEvidence === 1 ? " is" : "s are"} mapped within ${evidence.radiusMeters}m, but none carry a specific-enough OpenStreetMap tag (shop, office, amenity, tourism, transit, or a typed building) to classify. A bare 'building=yes' with nothing else nearby is the usual case.`
      : `Nothing is mapped at this exact point, so this describes the area rather than the building: the evidence within ${evidence.radiusMeters}m ${isMixed ? "is closely split between several use types" : `leans ${classification.toLowerCase()}`}. Click directly on a building for a reading of that building.`;

  const unclassified = classification === "Unknown";
  const trust = unclassified ? "unavailable" : "inferred";

  const limitations = [OSM_IS_NOT_LEGAL_USE];
  limitations.push(
    subject
      ? "The building at the exact point could not be checked, so this reads a feature near the spot and the surrounding area."
      : "Nothing is mapped at the exact point, so this describes the surrounding area, not a specific building."
  );
  limitations.push(COVERAGE_VARIES);

  return {
    classification,
    confidence: unclassified ? 0 : confidence,
    trust,
    evidence: subject ? [`${subject.name ? `${subject.name}: ` : ""}${subject.kind}, mapped near this spot`, ...evidenceLines] : evidenceLines,
    reasoning,
    scores,
    sources: ["OpenStreetMap / Overpass"],
    retrievedAt: evidence.fetchedAt,
    limitations,
    basis: subject ? "area" : topScore === 0 ? "none" : "area",
  };
}
