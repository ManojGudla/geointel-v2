import type { ApiHandler } from "../../_lib/http.js";
import { withMaintenanceGuard } from "../../_lib/maintenance.js";
import { ok, err, getClientIp } from "../../_lib/http.js";
import { RateLimiter } from "../../_lib/cache.js";
import { parseAnchor } from "../../_lib/evidence/anchor.js";
import { buildTrip, TRIP_INTERESTS, type TripInterest } from "../../_lib/evidence/trip.js";
import type { TripStop } from "../../../src/types/ai.js";

/**
 * Make My Trip's plan builder: POST { anchor, interests, days, stopsPerDay,
 * mode, stops? }. No model is called (see api/_lib/evidence/trip.ts). With
 * `stops`, the visitor's own edited order is kept and only re-measured.
 */
const limiter = new RateLimiter(60_000, 10);
const MODES = ["car", "walk", "bike"] as const;

function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function parseStops(raw: unknown): TripStop[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const stops: TripStop[] = [];
  for (const s of raw.slice(0, 9)) {
    if (!s || typeof s !== "object") continue;
    const { name, category, lat, lon } = s as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const cat = typeof category === "string" && (TRIP_INTERESTS as readonly string[]).includes(category) ? category : "custom";
    stops.push({ name: name.trim().slice(0, 80), category: cat, lat, lon });
  }
  return stops;
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") return err(res, 405, "Use POST.");
  const rate = limiter.check(getClientIp(req));
  if (!rate.allowed) return err(res, 429, "Too many trip plans. Please wait a minute.", "RATE_LIMITED");

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (JSON.stringify(body).length > 20_000) return err(res, 413, "Too much data sent with this request.");
  const anchor = parseAnchor(body.anchor);
  if (!anchor) return err(res, 400, "Pick a place on the map first: the trip starts there.", "ANCHOR_REQUIRED");

  const interests = Array.isArray(body.interests) ? (body.interests.filter((i) => (TRIP_INTERESTS as readonly unknown[]).includes(i)) as TripInterest[]) : [];
  const stops = parseStops(body.stops);
  if (body.stops !== undefined && !stops?.length) return err(res, 400, "None of the stops sent is a valid named place.");
  const mode = MODES.find((m) => m === body.mode) ?? "car";

  const plan = await buildTrip(
    {
      start: { lat: anchor.lat, lon: anchor.lon },
      interests: interests.length ? [...new Set(interests)] : ["attractions", "restaurants", "parks"],
      days: int(body.days, 1, 3, 1),
      stopsPerDay: int(body.stopsPerDay, 2, 4, 3),
      mode,
      stops,
    },
    req
  );
  ok(res, { plan });
};

export default withMaintenanceGuard(handler);
