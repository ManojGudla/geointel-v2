import { buildingHeight } from "../../src/lib/buildingHeight.js";

/**
 * A building's height in metres for 3D extrusion, from the shared rules in
 * src/lib/buildingHeight.ts (so the 3D view and the property panel always
 * agree). `explicit` is true only for a mapped height or mapped floors:
 * anything else is an estimate, and the map colours it as one.
 *
 * Since 28 November 2026 (owner's rule) a building with no height, floors
 * or telling type is one floor, 3.2 m; it used to be drawn at 7 m.
 */
export function estimateBuildingHeight(tags: Record<string, string>): { meters: number; explicit: boolean } {
  const h = buildingHeight(tags);
  return { meters: h.meters, explicit: h.source === "mapped" || h.source === "floors" };
}
