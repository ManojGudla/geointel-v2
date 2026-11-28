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
 *   5. what the neighbourhood suggests,          INFERRED, 35% at most
 *   6. land use mapped within 800 m,             INFERRED, 25-30%
 *   7. otherwise Residential, as a default:      INFERRED, 10-30% by size.
 *      The owner's rule (28 November 2026): research further when nothing
 *      describes the building, and if still nothing does, answer
 *      residential rather than Unknown. Most buildings are homes, so it is
 *      the likeliest answer; it is labelled as a default, never a finding,
 *      and held lower for large footprints, which are less often homes.
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
  const parts = surroundingsParts(evidence);
  if (!evidence || !parts.length) return undefined;
  return `Around it, within ${evidence.radiusMeters} m: ${parts.join(", ")}. That describes the area, not this property.`;
}

function surroundingsParts(evidence: GISEvidence | null): string[] {
  if (!evidence) return [];
  const c = evidence.counts;
  const parts: string[] = [];
  if (c.residential) parts.push(`${c.residential} residential building${c.residential === 1 ? "" : "s"}`);
  if (c.shops) parts.push(`${c.shops} shop${c.shops === 1 ? "" : "s"}`);
  if (c.offices) parts.push(`${c.offices} office${c.offices === 1 ? "" : "s"}`);
  if (c.industrial) parts.push(`${c.industrial} industrial feature${c.industrial === 1 ? "" : "s"}`);
  if (c.institutional) parts.push(`${c.institutional} public or institutional feature${c.institutional === 1 ? "" : "s"}`);
  return parts;
}

/** "Nearest mapped places: Nayara (fuel station), 47 m; Ratnadeep (supermarket shop), 90 m." */
function nearbyLine(site: PropertySite): string | undefined {
  const places = site.nearby ?? [];
  if (!places.length) return undefined;
  const label = (tags: Record<string, string>) => {
    const kind = readBusiness(tags)?.kind ?? Object.entries(tags).find(([k]) => /^(shop|office|amenity|craft|healthcare|tourism|leisure|historic)$/.test(k))?.[1]?.replace(/_/g, " ");
    const shown = kind === "fuel" ? "fuel station" : kind;
    return tags.name ? `${tags.name}${shown ? ` (${shown})` : ""}` : (shown ?? "a mapped place");
  };
  return `Nearest mapped places: ${places.map((p) => `${label(p.tags)}, ${p.distanceMeters} m`).join("; ")}.`;
}

function analyzeSite(site: PropertySite, evidence: GISEvidence | null): PropertyAnalysis {
  const b = site.building;
  const facts = buildingFacts(site);
  const links: Array<{ label: string; url: string }> = [];
  const lines: string[] = [];
  const limitations = [OSM_IS_NOT_LEGAL_USE];
  const sources = ["OpenStreetMap / Overpass"];
  const surroundings = surroundingsLine(evidence);
  const nearby = nearbyLine(site);
  const retrievedAt = site.fetchedAt;
  /*
    A cut-short answer can be missing anything, so an absence in it is not
    evidence: every reading that rests on "nothing is mapped" says so.
  */
  const cutShort = site.incomplete ? " The map server's answer was cut short just now, so something mapped here may be missing: try again." : "";
  if (site.incomplete) limitations.push("The map server's answer was cut short, so something mapped here may be missing from it.");

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
    // The nearest places are context for a building that says nothing itself, noise for one that does.
    evidence: [...lines, ...(nearby && basis !== "building" && basis !== "inside" ? [nearby] : []), ...(surroundings ? [surroundings] : [])],
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
  /*
    A zone drawn over a whole neighbourhood says less about one building than
    a plot-sized outline does, so a large one costs ten points. The Abids zone
    that prompted this is 0.6 km². Size is known only for land read from its
    outline; the area index gives none, and those keep the plain figure.
  */
  const LARGE_ZONE_M2 = 250_000;
  const isLargeZone = (r: NonNullable<typeof landReading>) => !r.reading!.campus && (r.area.areaM2 ?? 0) > LARGE_ZONE_M2;
  const landSize = (r: NonNullable<typeof landReading>) => (r.area.areaM2 ? formatArea(r.area.areaM2) : null);
  const landLine = (r: NonNullable<typeof landReading>) =>
    `${landText(r)}${landSize(r) ? `, ${landSize(r)}` : ""} (OpenStreetMap ${r.area.osmType} ${r.area.id}, ${r.reading!.tag})`;

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
      lines.push(`Land: ${landLine(landReading)}`);
      links.push({ label: `${landReading.area.tags.name ?? capitalise(landReading.reading!.kind)} on OpenStreetMap`, url: landReading.area.url });
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
      const large = isLargeZone(landReading);
      return done(
        reading!.use,
        "inferred",
        (landReading.reading!.campus ? 70 : large ? 50 : 60) - nextToPenalty,
        `${name} is mapped, but not what it is used for. It stands on ${landText(landReading)}${landSize(landReading) ? ` (one area of ${landSize(landReading)} on the map)` : ""}, so it is most likely ${reading!.use.toLowerCase()}.${large ? " That area covers a whole neighbourhood, so it describes the area this building is in more than the building itself." : ""} ${capitalise(where)}.`,
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

    const nothingOnIt = `${facts.kind === "building (its use is not mapped)" ? "A building" : capitalise(article(facts.kind))} is mapped here, but nothing on the map says what it is used for: no type, no businesses inside it and no land use around it.`;

    /*
      5. The neighbourhood, as a guess. Reported 26 November 2026: a tap on
      open ground beside a building gave a reading from the surroundings,
      and a tap on the building itself gave "Unknown", so the more precise
      tap said less. Now both give it, and on a building it is held lower
      (35% at most, against 40%) and called what it is: a guess from what is
      mapped around it, never a reading of the building.
    */
    if (evidence && totalEvidenceCount(evidence.counts) > 0) {
      const area = analyzeArea({ ...evidence, subject: null });
      if (area.classification !== "Unknown") {
        const parts = surroundingsParts(evidence);
        return done(
          area.classification,
          "inferred",
          Math.max(5, Math.min(area.confidence, 35)),
          `${nothingOnIt} Going only by what is mapped within ${evidence.radiusMeters} m${parts.length ? ` (${parts.join(", ")})` : ""}, it is probably ${area.classification === "Mixed Use" ? "mixed use" : area.classification.toLowerCase()}. That is a guess from the neighbourhood, not a reading of this building.${cutShort}`,
          "area"
        );
      }
    }

    // 6. Land use further out.
    const wider = widerLandReading(site);
    if (wider) {
      return done(
        wider.use,
        "inferred",
        wider.confidence,
        `${nothingOnIt} Looking further out, ${wider.text}, so it is probably ${wider.use.toLowerCase()}. That is a guess from the wider area, not a reading of this building.${cutShort}`,
        "wider"
      );
    }

    // 7. The default.
    const fallback = residentialDefault(facts.footprintM2 ?? site.building?.footprintM2);
    return done(
      "Residential",
      "inferred",
      fallback.confidence,
      `${nothingOnIt} Nothing mapped around it settles it either, so it is shown as residential by default: most buildings are homes${fallback.note}. This is a default, not a finding.${surroundings || nearby ? " What is mapped nearby is listed below as context only." : ""} If you know what it is, it can be added on OpenStreetMap.${cutShort}`,
      "default"
    );
  }

  // No building at or next to the point.
  limitations.push("No building is mapped at this exact point, so this is not a reading of a building.");
  if (landReading) {
    lines.push(`No building is mapped at this point. Land: ${landLine(landReading)}`);
    links.push({ label: `${landReading.area.tags.name ?? capitalise(landReading.reading!.kind)} on OpenStreetMap`, url: landReading.area.url });
    const open = landReading.reading!.use === "Agricultural" || landReading.reading!.use === "Open Space";
    return done(
      landReading.reading!.use,
      "inferred",
      isLargeZone(landReading) ? 40 : 50,
      `No building is mapped at this exact point. The land here is mapped as ${landText(landReading)}${landSize(landReading) ? ` (one area of ${landSize(landReading)})` : ""}.${open ? "" : " Tap directly on a building to read that building."}`,
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

  const wider = widerLandReading(site);
  if (wider) {
    return done(
      wider.use,
      "inferred",
      Math.min(wider.confidence, 25),
      `No building, business or land use is mapped at this exact point. Looking further out, ${wider.text}, so this is probably ${wider.use.toLowerCase()} land. Tap directly on a building to read that building.${cutShort}`,
      "wider"
    );
  }

  lines.push("No building, business or land use is mapped at this point.");
  return done(
    "Residential",
    "inferred",
    10,
    `Nothing is mapped at this exact point: no building, no business and no land use, and nothing mapped further out settles it. It is shown as residential by default, since most built-up land is homes; treat it as a default, not a finding. Tap directly on a building to read that building.${cutShort}`,
    "default"
  );
}

/**
 * Land use mapped within the wider radius, weighted by size. Parks and
 * farmland say little about what a building is used for, so only built-up
 * land counts, and one huge zone is capped so it cannot decide alone. A
 * clear lead (at least 40% of that land) is needed for an answer.
 */
export function widerLandReading(site: PropertySite): { use: PropertyClassification; confidence: number; text: string } | null {
  const totals = new Map<PropertyClassification, { area: number; count: number; kind: string }>();
  let all = 0;
  for (const f of site.widerLand ?? []) {
    const reading = readArea(f.tags);
    if (!reading || reading.use === "Open Space" || reading.use === "Agricultural") continue;
    const area = Math.min(f.areaM2 ?? 0, 400_000);
    if (area <= 0) continue;
    all += area;
    const t = totals.get(reading.use) ?? { area: 0, count: 0, kind: reading.kind };
    t.area += area;
    t.count += 1;
    totals.set(reading.use, t);
  }
  if (!all) return null;
  const [use, top] = [...totals.entries()].sort((a, b) => b[1].area - a[1].area)[0]!;
  const share = top.area / all;
  if (share < 0.4) return null;
  return {
    use,
    confidence: share >= 0.7 ? 30 : 25,
    text: `about ${Math.round(share * 100)}% of the built-up land mapped within ${site.widerRadiusMeters ?? 800} m is ${top.kind} (${top.count} area${top.count === 1 ? "" : "s"})`,
  };
}

/** How much a residential default is worth, by the size of the building's footprint. */
export function residentialDefault(footprintM2: number | undefined): { confidence: number; note: string } {
  if (!footprintM2) return { confidence: 20, note: "" };
  if (footprintM2 <= 400) return { confidence: 30, note: `, and at ${formatArea(footprintM2)} this one is house-sized` };
  if (footprintM2 <= 2500) return { confidence: 25, note: `, and at ${formatArea(footprintM2)} this one is the size of a house or an apartment block` };
  if (footprintM2 <= 8000) return { confidence: 15, note: `, though at ${formatArea(footprintM2)} this one is larger than most homes` };
  return { confidence: 10, note: `, though at ${formatArea(footprintM2)} this one is very large for a home, so the default is weak here` };
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "2,400 m²" for a plot, "0.62 km²" for a zone. */
function formatArea(m2: number): string {
  if (m2 < 100_000) return `${(Math.round(m2 / 10) * 10).toLocaleString("en-US")} m²`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}

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
