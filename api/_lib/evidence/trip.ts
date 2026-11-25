import type { ApiRequest } from "../http.js";
import type { AgentStep, EvidenceItem, TripDay, TripPlan, TripStop } from "../../../src/types/ai.js";
import { sanitizeField } from "../untrusted.js";
import { callRoute } from "./internalCall.js";
import { distanceLabel, SOURCE_TIMEOUT_MS } from "./gather.js";
import nearbyRoute from "../../_routes/nearby.js";
import gisRoute from "../../_routes/gis.js";
import routeRoute from "../../_routes/route.js";

/**
 * Make My Trip: a day-by-day plan built from real places and real routing.
 *
 * No model writes this. Stops are named places OpenStreetMap has mapped
 * near the selected place, in the interests asked for; they are put in a
 * nearest-next order from the selected place, split into days, and every
 * hop is measured by the routing provider. Time spent at each stop is this
 * app's stated assumption, never a claim about opening hours. Nothing here
 * books, prices or reserves anything.
 */

export const TRIP_INTERESTS = ["attractions", "restaurants", "cafes", "parks", "shopping"] as const;
export type TripInterest = (typeof TRIP_INTERESTS)[number];

/** Minutes at each kind of stop: this app's assumption, shown with the plan. */
export const VISIT_MINUTES: Record<string, number> = { attractions: 90, restaurants: 60, cafes: 30, parks: 45, shopping: 60, custom: 45 };

const MAX_STOPS = 9;
const SEARCH_RADIUS_M = 2_000;
/** Visits plus travel past this, in a day, is flagged as unrealistic. */
const LONG_DAY_MINUTES = 9 * 60;
const LONG_HOP_MINUTES = 60;

interface Point {
  lat: number;
  lon: number;
}

function metres(a: Point, b: Point): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest-next from the start: each stop is the closest one not yet visited. */
export function nearestNextOrder<T extends Point>(start: Point, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let here: Point = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i += 1) if (metres(here, left[i]!) < metres(here, left[best]!)) best = i;
    const next = left.splice(best, 1)[0]!;
    out.push(next);
    here = next;
  }
  return out;
}

/** Takes stops from each interest in turn, closest first, so one interest cannot fill the day. */
export function pickStops(candidates: Record<string, Array<TripStop & { distanceMeters: number }>>, interests: string[], count: number): TripStop[] {
  const queues = interests.map((i) => [...(candidates[i] ?? [])].sort((a, b) => a.distanceMeters - b.distanceMeters));
  const picked: TripStop[] = [];
  const seen = new Set<string>();
  while (picked.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      while (q.length) {
        const next = q.shift()!;
        const key = `${next.name.toLowerCase()}|${next.lat.toFixed(4)}|${next.lon.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push({ name: next.name, category: next.category, lat: next.lat, lon: next.lon });
        break;
      }
      if (picked.length >= count) break;
    }
  }
  return picked;
}

export interface TripRequest {
  start: Point;
  interests: TripInterest[];
  days: number;
  stopsPerDay: number;
  mode: "car" | "walk" | "bike";
  /** The visitor's own ordered stops, when they edited a plan. Kept in their order. */
  stops?: TripStop[];
}

async function findCandidates(trip: TripRequest, req: ApiRequest, items: EvidenceItem[], steps: AgentStep[]) {
  const candidates: Record<string, Array<TripStop & { distanceMeters: number }>> = {};
  const wantsPlaces = trip.interests.some((i) => i !== "attractions");
  const wantsSights = trip.interests.includes("attractions");
  const started = Date.now();
  const [nearby, gis] = await Promise.all([
    wantsPlaces ? callRoute<{ items: Array<{ name: string; category: string; lat: number; lon: number; distanceMeters: number }>; fetchedAt?: string; radiusMeters?: number }>(nearbyRoute, { lat: trip.start.lat, lon: trip.start.lon, radius: SEARCH_RADIUS_M }, req, SOURCE_TIMEOUT_MS) : null,
    wantsSights ? callRoute<{ evidence: { features: Array<{ lat: number; lon: number; tags: Record<string, string> }>; fetchedAt?: string } }>(gisRoute, { lat: trip.start.lat, lon: trip.start.lon, radius: SEARCH_RADIUS_M }, req, SOURCE_TIMEOUT_MS) : null,
  ]);

  if (nearby) {
    const ok = nearby.status === 200 && Array.isArray(nearby.body?.items);
    steps.push({ step: "Finding food, parks and shops nearby (OpenStreetMap via Overpass)", status: ok ? "ok" : "failed", ms: Date.now() - started });
    if (ok) {
      for (const it of nearby.body!.items) {
        if (!trip.interests.includes(it.category as TripInterest) || !it.name || it.name === it.category) continue;
        (candidates[it.category] ??= []).push({ name: sanitizeField(it.name, 80), category: it.category, lat: it.lat, lon: it.lon, distanceMeters: it.distanceMeters });
      }
      items.push({ id: "", label: `Named places found within ${distanceLabel(nearby.body!.radiusMeters ?? SEARCH_RADIUS_M)}`, value: String(Object.values(candidates).reduce((n, l) => n + l.length, 0)), kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: nearby.body!.fetchedAt, note: "Only places with a name can be stops. At most the 60 closest places are fetched." });
    } else {
      items.push({ id: "", label: "Nearby places", value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: "The nearby search did not answer." });
    }
  }
  if (gis) {
    const ok = gis.status === 200 && Array.isArray(gis.body?.evidence?.features);
    steps.push({ step: "Finding sights nearby (OpenStreetMap via Overpass)", status: ok ? "ok" : "failed", ms: Date.now() - started });
    if (ok) {
      const sights = gis.body!.evidence.features.filter((f) => ["museum", "gallery", "attraction", "theme_park", "zoo", "aquarium"].includes(f.tags.tourism ?? "") || (f.tags.historic && f.tags.name));
      candidates.attractions = sights
        .filter((f) => f.tags.name)
        .map((f) => ({ name: sanitizeField(f.tags.name, 80), category: "attractions", lat: f.lat, lon: f.lon, distanceMeters: Math.round(metres(trip.start, f)) }));
      items.push({ id: "", label: `Named sights found within ${distanceLabel(SEARCH_RADIUS_M)}`, value: String(candidates.attractions.length), kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: gis.body!.evidence.fetchedAt, note: "Museums, galleries, attractions, zoos and historic places that have a name." });
    } else {
      items.push({ id: "", label: "Nearby sights", value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: "The map evidence search did not answer." });
    }
  }
  return candidates;
}

export async function buildTrip(trip: TripRequest, req: ApiRequest): Promise<TripPlan> {
  const items: EvidenceItem[] = [];
  const steps: AgentStep[] = [];
  const wanted = Math.min(MAX_STOPS, trip.days * trip.stopsPerDay);

  let ordered: TripStop[];
  let order: TripPlan["order"];
  if (trip.stops?.length) {
    ordered = trip.stops.slice(0, MAX_STOPS);
    order = "yours";
    steps.push({ step: "Keeping your order of stops", status: "ok", ms: 0 });
  } else {
    const candidates = await findCandidates(trip, req, items, steps);
    const t = Date.now();
    ordered = nearestNextOrder(trip.start, pickStops(candidates, trip.interests, wanted));
    order = "nearest-next";
    steps.push({ step: `Choosing ${ordered.length} stops and ordering them nearest-next`, status: ordered.length ? (ordered.length < wanted ? "partial" : "ok") : "failed", ms: Date.now() - t });
  }

  // Days in the given order; each day starts from the selected place.
  const perDay = Math.max(1, Math.ceil(ordered.length / trip.days));
  const dayStops: TripStop[][] = [];
  for (let i = 0; i < ordered.length; i += perDay) dayStops.push(ordered.slice(i, i + perDay));

  const t = Date.now();
  const legs = await Promise.all(
    dayStops.flatMap((stops) =>
      stops.map((stop, i) => {
        const from = i === 0 ? trip.start : stops[i - 1]!;
        return callRoute<{ route: { distanceMeters: number; durationSeconds: number; source?: string } }>(
          routeRoute,
          { fromLat: from.lat, fromLon: from.lon, toLat: stop.lat, toLon: stop.lon, mode: trip.mode },
          req,
          SOURCE_TIMEOUT_MS
        );
      })
    )
  );
  const failedLegs = legs.filter((l) => l.status !== 200 || !l.body?.route).length;
  steps.push({ step: `Measuring ${legs.length} hops with the routing provider`, status: failedLegs === 0 ? "ok" : failedLegs < legs.length ? "partial" : "failed", ms: Date.now() - t });

  let n = 0;
  const days: TripDay[] = dayStops.map((stops, d) => {
    const warnings: string[] = [];
    let total = 0;
    const out = stops.map((stop, i) => {
      const leg = legs[n++]!;
      const route = leg.status === 200 ? leg.body?.route : undefined;
      const visitMinutes = VISIT_MINUTES[stop.category] ?? VISIT_MINUTES.custom!;
      total += visitMinutes;
      const from = i === 0 ? "the selected place" : stops[i - 1]!.name;
      if (!route) {
        warnings.push(`Travel time from ${from} to ${stop.name} is unknown: the routing provider did not answer.`);
        return { ...stop, visitMinutes, leg: null };
      }
      const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
      total += minutes;
      if (minutes > LONG_HOP_MINUTES) warnings.push(`${from} to ${stop.name} takes about ${minutes} min.`);
      return { ...stop, visitMinutes, leg: { distanceMeters: route.distanceMeters, minutes, source: sanitizeField(route.source, 40) || "OSRM" } };
    });
    if (total > LONG_DAY_MINUTES) warnings.push(`Day ${d + 1} adds up to about ${Math.round(total / 60)} hours: too much for one day. Remove a stop or add a day.`);
    return { day: d + 1, stops: out, totalMinutes: total, warnings };
  });

  if (ordered.length < wanted && order === "nearest-next") {
    items.push({ id: "", label: "Stops found", value: `${ordered.length} of the ${wanted} asked for`, kind: "computed", source: "maNOWj", note: "Fewer named places of these kinds are mapped nearby." });
  }

  return {
    days,
    order,
    mode: trip.mode,
    assumptions: [
      `Time at each stop is this app's assumption, not opening hours: ${Object.entries(VISIT_MINUTES)
        .filter(([k]) => k !== "custom")
        .map(([k, v]) => `${k} ${v} min`)
        .join(", ")}.`,
      "Travel times are the routing provider's typical speeds, with no live traffic.",
      "No prices, tickets or bookings: this plan has no price data and books nothing.",
    ],
    evidence: items.map((item, i) => ({ ...item, id: `E${i + 1}` })),
    steps,
    generatedAt: new Date().toISOString(),
  };
}
