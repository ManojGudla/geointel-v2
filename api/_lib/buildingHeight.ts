/**
 * Estimates a building's height in meters for 3D extrusion. Real explicit
 * data (an OSM `height` or `building:levels` tag) is used whenever present;
 * otherwise this falls back to a rough by-type default - the same
 * estimate-when-untagged approach every 3D map product (Google, Apple,
 * Mapbox) uses, since most OSM buildings simply have no height data. This is
 * never presented as measured fact: api/buildings.ts reports
 * `hasExplicitHeight` alongside it so the frontend can show "estimated"
 * where relevant, keeping with this project's no-fabricated-precision rule.
 */
const METERS_PER_LEVEL = 3.2;

const TYPE_DEFAULT_METERS: Record<string, number> = {
  house: 6,
  detached: 6,
  residential: 6,
  terrace: 7,
  apartments: 15,
  commercial: 12,
  retail: 9,
  office: 14,
  industrial: 8,
  warehouse: 8,
  hospital: 16,
  school: 9,
  college: 10,
  university: 12,
  hotel: 18,
  church: 12,
  civic: 10,
  government: 12,
};

const DEFAULT_METERS = 7;

export function estimateBuildingHeight(tags: Record<string, string>): { meters: number; explicit: boolean } {
  const heightTag = tags.height ?? tags["building:height"];
  if (heightTag) {
    const parsed = parseFloat(heightTag);
    if (Number.isFinite(parsed) && parsed > 0) return { meters: parsed, explicit: true };
  }

  const levelsTag = tags["building:levels"] ?? tags.levels;
  if (levelsTag) {
    const levels = parseFloat(levelsTag);
    if (Number.isFinite(levels) && levels > 0) return { meters: levels * METERS_PER_LEVEL, explicit: true };
  }

  const type = tags.building && tags.building !== "yes" ? tags.building : undefined;
  const fallback = (type && TYPE_DEFAULT_METERS[type]) || DEFAULT_METERS;
  return { meters: fallback, explicit: false };
}
