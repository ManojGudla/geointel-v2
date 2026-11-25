import type { AgentAnchor } from "../../../src/types/ai.js";

const MODES = ["car", "walk", "bike"] as const;

function finiteIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * The anchor, checked. Coordinates must be on the globe; everything else is
 * optional and dropped when malformed rather than failing the request.
 */
export function parseAnchor(raw: unknown): AgentAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const lat = finiteIn(a.lat, -90, 90);
  const lon = finiteIn(a.lon, -180, 180);
  if (lat === null || lon === null) return null;
  const anchor: AgentAnchor = { lat, lon };
  const radius = finiteIn(a.radiusMeters, 1, 5_000);
  if (radius !== null) anchor.radiusMeters = radius;
  if (typeof a.query === "string" && a.query.trim()) anchor.query = a.query.trim().slice(0, 200);
  const r = a.route as Record<string, unknown> | undefined;
  if (r && typeof r === "object") {
    const fromLat = finiteIn(r.fromLat, -90, 90);
    const fromLon = finiteIn(r.fromLon, -180, 180);
    const toLat = finiteIn(r.toLat, -90, 90);
    const toLon = finiteIn(r.toLon, -180, 180);
    const mode = MODES.find((m) => m === r.mode);
    if (fromLat !== null && fromLon !== null && toLat !== null && toLon !== null && mode) {
      anchor.route = { fromLat, fromLon, toLat, toLon, mode };
    }
  }
  return anchor;
}
