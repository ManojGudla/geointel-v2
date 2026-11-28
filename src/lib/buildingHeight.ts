/**
 * Building heights, one set of rules for the 3D view, the property panel
 * and the agents, so the same building is never one height in one place
 * and another height somewhere else.
 *
 * Strongest first: a mapped height; otherwise the mapped number of floors
 * at 3.2 m each; otherwise an estimate. The estimate is the owner's rule of
 * 28 November 2026: no height mapped means one floor, 3.2 m. A building
 * mapped with a type that is never one floor (an apartment block, a
 * hospital) keeps the usual height for that type instead, because one
 * floor would be plainly wrong for it. An estimate is always said to be
 * one, never shown as measured.
 */
export const METRES_PER_FLOOR = 3.2;

/** One floor: what a building with no height, floors or telling type is taken to be. */
export const SINGLE_STOREY_METRES = METRES_PER_FLOOR;

/** Usual heights by building type, for a typed building with no height or floors mapped. */
export const TYPE_DEFAULT_METRES: Record<string, number> = {
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

export type HeightSource = "mapped" | "floors" | "type" | "assumed";

export interface BuildingHeight {
  meters: number;
  source: HeightSource;
  /** Floors as mapped; null when not mapped (never the assumed one). */
  levels: number | null;
}

/** Metres from a height tag: "28.8", "28.8 m", "95 ft", "95'". Null when it cannot be read. */
export function parseHeight(raw: string | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  const feet = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"))?$/.exec(text);
  if (feet) return Number(feet[1]) * 0.3048 + (feet[2] ? Number(feet[2]) * 0.0254 : 0);
  const metres = /^(\d+(?:\.\d+)?)\s*(?:m|metres|meters)?$/.exec(text);
  if (metres) return Number(metres[1]);
  return null;
}

export function buildingHeight(tags: Record<string, string>): BuildingHeight {
  const levelsRaw = Number(tags["building:levels"] ?? tags.levels);
  const levels = Number.isFinite(levelsRaw) && levelsRaw > 0 ? Math.round(levelsRaw * 10) / 10 : null;
  const mapped = parseHeight(tags.height ?? tags["building:height"]);
  if (mapped !== null && mapped > 0 && mapped < 1000) return { meters: Math.round(mapped * 10) / 10, source: "mapped", levels };
  if (levels !== null) return { meters: Math.round(levels * METRES_PER_FLOOR * 10) / 10, source: "floors", levels };
  const type = tags.building && tags.building !== "yes" ? tags.building : undefined;
  const byType = type ? TYPE_DEFAULT_METRES[type] : undefined;
  if (byType) return { meters: byType, source: "type", levels: null };
  return { meters: SINGLE_STOREY_METRES, source: "assumed", levels: null };
}
