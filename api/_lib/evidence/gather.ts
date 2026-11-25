import type { ApiRequest } from "../http.js";
import type { AgentAnchor, AgentKind, AgentStep, EvidenceItem } from "../../../src/types/ai.js";
import type { GISEvidence } from "../../../src/types/gis.js";
import { analyzeProperty } from "../../../src/features/property/propertyAnalyzer.js";
import { sanitizeField } from "../untrusted.js";
import { callRoute, type RouteAnswer } from "./internalCall.js";
import reverseGeocodeRoute from "../../_routes/reverse-geocode.js";
import gisRoute from "../../_routes/gis.js";
import weatherRoute from "../../_routes/weather.js";
import nearbyRoute from "../../_routes/nearby.js";
import routeRoute from "../../_routes/route.js";
import geocodeRoute from "../../_routes/geocode.js";
import populationRoute from "../../_routes/population.js";
import officialsRoute from "../../_routes/officials.js";

/**
 * Evidence for the six agents, fetched by the server itself.
 *
 * The agents used to be handed whatever the browser sent - counts, weather,
 * a route, even officials marked "verified" - and to repeat it as fact. Now
 * the browser says only WHERE (an anchor), and every fact below comes from
 * this app's own API routes, run in-process (see internalCall.ts). Each fact
 * keeps its provider, the time the provider answered, and any caveat the
 * route attached. A source that fails becomes an "unavailable" item that
 * says why; nothing is filled in.
 */

export type ToolName = "place" | "gis" | "property" | "population" | "weather" | "nearby" | "route" | "search" | "officials";

export interface ToolOutcome {
  tool: ToolName;
  status: AgentStep["status"];
  /** Plain words for the confidence reason when the status is not "ok". */
  problem?: string;
}

export interface Gathered {
  items: EvidenceItem[];
  steps: AgentStep[];
  outcomes: ToolOutcome[];
  /** Where a "route to the nearest X" went, so the screen can draw it. */
  routeTarget?: { name: string; lat: number; lon: number; mode: "car" | "walk" | "bike" };
}

export interface GatherOptions {
  /** Route to the nearest place of this nearby category when no route is planned. */
  nearest?: { category: string; label: string };
}

/** Which sources each agent uses, and which of them it cannot do without. */
export const AGENT_TOOLS: Record<AgentKind, { tools: ToolName[]; required: ToolName[] }> = {
  search: { tools: ["place", "search"], required: ["place"] },
  gis: { tools: ["place", "gis", "population"], required: ["gis"] },
  property: { tools: ["place", "gis", "property"], required: ["property"] },
  navigation: { tools: ["place", "route"], required: ["route"] },
  travel: { tools: ["place", "weather", "nearby"], required: ["weather", "nearby"] },
  makeMyTrip: { tools: ["place", "nearby", "weather"], required: ["nearby"] },
};

const STEP_LABELS: Record<ToolName, string> = {
  place: "Naming the place (OpenStreetMap)",
  gis: "Counting mapped features (OpenStreetMap via Overpass)",
  property: "Classifying the property from that evidence",
  population: "Looking up population (Wikidata)",
  weather: "Reading current weather (Open-Meteo)",
  nearby: "Finding nearby places (OpenStreetMap via Overpass)",
  route: "Calculating the route (routing provider)",
  search: "Re-running the search (OpenStreetMap)",
  officials: "Looking up office holders (Wikidata)",
};

const NEARBY_LABELS: Record<string, string> = {
  restaurants: "Restaurants",
  cafes: "Cafes",
  hotels: "Hotels and guest houses",
  hospitals: "Hospitals and clinics",
  schools: "Schools",
  atms: "ATMs",
  banks: "Banks",
  petrol: "Fuel stations",
  shopping: "Shops",
  parks: "Parks and gardens",
  pharmacies: "Pharmacies",
  police: "Police stations",
  publicTransport: "Bus stops and stations",
};

const GIS_COUNT_LABELS: Record<keyof GISEvidence["counts"], string> = {
  buildings: "buildings",
  shops: "shops",
  offices: "offices",
  residential: "homes and residential areas",
  industrial: "industrial sites",
  institutional: "schools, hospitals and offices of government",
  amenities: "amenities",
  tourism: "tourism places",
  transport: "transport stops and stations",
};

/** Seconds each source gets. Overpass is the slow one; past this, it is "did not answer". */
export const SOURCE_TIMEOUT_MS = 8_000;
const NEARBY_RADIUS_M = 1_000;
const ALLOWED_RADII = [100, 250, 500, 1000, 2000, 5000];

export function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1).replace(/\.0$/, "")} km`;
}

function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Why a route call produced nothing, in words a visitor can act on. */
function failureReason(answer: RouteAnswer<unknown>): string {
  if (answer.status === 0) return `It did not answer within ${SOURCE_TIMEOUT_MS / 1000} seconds.`;
  if (answer.status === 429) return "Too many requests just now. Try again in a minute.";
  const said = typeof answer.body?.error === "string" ? sanitizeField(answer.body.error, 160) : "";
  return said || `It answered with an error (${answer.status}).`;
}

class EvidenceBook {
  readonly items: EvidenceItem[] = [];
  add(item: Omit<EvidenceItem, "id">): string {
    const id = `E${this.items.length + 1}`;
    this.items.push({ id, ...item, label: sanitizeField(item.label, 120), value: sanitizeField(item.value, 300) });
    return id;
  }
}

export function snapRadius(radius: number | undefined): number {
  if (!radius || !Number.isFinite(radius)) return 250;
  return ALLOWED_RADII.reduce((best, r) => (Math.abs(r - radius) < Math.abs(best - radius) ? r : best), 250);
}

type GisAnswer = RouteAnswer<{ evidence: GISEvidence & { source: string; fetchedAt: string; incomplete?: boolean } }>;
type NearbyAnswer = RouteAnswer<{ items: Array<{ name: string; category: string; distanceMeters: number; lat: number; lon: number }>; radiusMeters: number; widened?: boolean; stale?: boolean; fetchedAt?: string; source?: string }>;
type PlaceAnswer = RouteAnswer<{ location: { name?: string; displayName?: string; source?: string; address?: Record<string, string | undefined> } }>;

interface ToolContext {
  anchor: AgentAnchor;
  req: ApiRequest;
  book: EvidenceBook;
  /**
   * Shared by one run's tools, so a provider is asked once: the GIS answer
   * (GIS and Property) and the place answer (Place and Officials).
   */
  shared: { gis?: Promise<GisAnswer>; place?: Promise<PlaceAnswer>; nearby?: Promise<NearbyAnswer>; routeTarget?: Gathered["routeTarget"] };
  options: GatherOptions;
}

type Tool = (ctx: ToolContext) => Promise<Omit<ToolOutcome, "tool">>;

function fetchPlace(ctx: ToolContext): Promise<PlaceAnswer> {
  ctx.shared.place ??= callRoute(reverseGeocodeRoute, { lat: ctx.anchor.lat, lon: ctx.anchor.lon }, ctx.req, SOURCE_TIMEOUT_MS);
  return ctx.shared.place;
}

const place: Tool = async (ctx) => {
  const { book } = ctx;
  const answer = await fetchPlace(ctx);
  const location = answer.status === 200 ? answer.body?.location : undefined;
  const source = location?.source || "OpenStreetMap Nominatim";
  if (!location || !(location.name || location.displayName)) {
    book.add({ label: "Place name", value: "Unavailable", kind: "unavailable", source, note: failureReason(answer) });
    return { status: "failed", problem: "The place name lookup did not answer." };
  }
  const at = new Date().toISOString();
  book.add({ label: "Place name", value: location.name || location.displayName || "", kind: "retrieved", source, retrievedAt: at });
  const a = location.address ?? {};
  const area = [a.suburb, a.city ?? a.district, a.state, a.country].filter(Boolean).join(", ");
  if (area) book.add({ label: "Area", value: area, kind: "retrieved", source, retrievedAt: at });
  return { status: "ok" };
};

function fetchGis(ctx: ToolContext): Promise<GisAnswer> {
  ctx.shared.gis ??= callRoute(gisRoute, { lat: ctx.anchor.lat, lon: ctx.anchor.lon, radius: snapRadius(ctx.anchor.radiusMeters) }, ctx.req, SOURCE_TIMEOUT_MS);
  return ctx.shared.gis;
}

const gis: Tool = async (ctx) => {
  const answer = await fetchGis(ctx);
  const evidence = answer.status === 200 ? answer.body?.evidence : undefined;
  const radius = snapRadius(ctx.anchor.radiusMeters);
  if (!evidence) {
    ctx.book.add({ label: `Mapped features within ${distanceLabel(radius)}`, value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: failureReason(answer) });
    return { status: "failed", problem: "OpenStreetMap (Overpass) did not answer, so there are no counts." };
  }
  const within = `within ${distanceLabel(evidence.radiusMeters)}`;
  const caveat = evidence.incomplete ? "Overpass stopped part-way, so this may be low." : undefined;
  for (const [key, label] of Object.entries(GIS_COUNT_LABELS) as Array<[keyof GISEvidence["counts"], string]>) {
    const count = finite(evidence.counts?.[key]);
    if (count === null) continue;
    ctx.book.add({
      label: `Mapped ${label} ${within}`,
      value: String(count),
      kind: "retrieved",
      source: "OpenStreetMap via Overpass",
      retrievedAt: evidence.fetchedAt,
      note: caveat ?? (count === 0 ? "Zero can mean nothing is there or that nobody has mapped it yet." : undefined),
    });
  }
  const scores = Object.entries(evidence.scores ?? {})
    .filter(([, v]) => finite(v) !== null)
    .sort((x, y) => (y[1] as number) - (x[1] as number))
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  if (scores) {
    ctx.book.add({
      label: `Distance-weighted scores ${within}`,
      value: scores,
      kind: "computed",
      source: "maNOWj, from OpenStreetMap features",
      retrievedAt: evidence.fetchedAt,
      note: "Each mapped feature counts more the closer it is to the point; higher means stronger evidence for that use.",
    });
  }
  if (evidence.subject) {
    const s = evidence.subject;
    ctx.book.add({
      label: "Mapped feature at the point",
      value: `${s.name ? `${s.name}, ` : ""}${s.kind} (${s.category}), ${distanceLabel(s.distanceMeters)} away`,
      kind: "retrieved",
      source: "OpenStreetMap via Overpass",
      retrievedAt: evidence.fetchedAt,
    });
  }
  return evidence.incomplete ? { status: "partial", problem: "Overpass stopped part-way, so counts may be low." } : { status: "ok" };
};

const property: Tool = async (ctx) => {
  const answer = await fetchGis(ctx);
  const evidence = answer.status === 200 ? answer.body?.evidence : undefined;
  if (!evidence) {
    ctx.book.add({ label: "Property classification", value: "Unavailable", kind: "unavailable", source: "maNOWj property analyzer", note: failureReason(answer) });
    return { status: "failed", problem: "There is no mapped evidence to classify from." };
  }
  const analysis = analyzeProperty(evidence);
  const method = "From the share of distance-weighted OpenStreetMap features around the point. Not a land record, zoning or ownership check.";
  if (analysis.trust === "unavailable") {
    ctx.book.add({ label: "Property classification", value: "Not enough mapped evidence to classify", kind: "unavailable", source: "maNOWj property analyzer", retrievedAt: evidence.fetchedAt, note: analysis.limitations.join(" ") });
    return { status: "failed", problem: "Too little is mapped here to classify the property." };
  }
  ctx.book.add({
    label: "Property classification",
    value: analysis.classification,
    kind: "computed",
    source: "maNOWj property analyzer",
    retrievedAt: evidence.fetchedAt,
    note: `${method} ${sanitizeField(analysis.reasoning, 400)}`.trim(),
  });
  ctx.book.add({
    label: "Classification confidence",
    value: `${Math.round(analysis.confidence)}%`,
    kind: "computed",
    source: "maNOWj property analyzer",
    retrievedAt: evidence.fetchedAt,
    note: analysis.limitations.join(" "),
  });
  return evidence.incomplete ? { status: "partial", problem: "Overpass stopped part-way, so the classification rests on partial counts." } : { status: "ok" };
};

const population: Tool = async ({ anchor, req, book }) => {
  const answer = await callRoute<{ population: { place: string; population: number; year: number | null; areaKm2: number | null; densityPerKm2: number | null; source: string; sourceUrl: string | null } | null }>(
    populationRoute,
    { lat: anchor.lat, lon: anchor.lon },
    req,
    SOURCE_TIMEOUT_MS
  );
  if (answer.status !== 200) {
    book.add({ label: "Population", value: "Unavailable", kind: "unavailable", source: "Wikidata", note: failureReason(answer) });
    return { status: "failed", problem: "Population sources did not answer." };
  }
  const p = answer.body?.population;
  if (!p || finite(p.population) === null) {
    book.add({ label: "Population", value: "No published figure for this area", kind: "unavailable", source: "Wikidata and OpenStreetMap" });
    return { status: "ok" };
  }
  const at = new Date().toISOString();
  const source = sanitizeField(p.source, 80) || "Wikidata";
  book.add({ label: `Population of ${p.place}`, value: `${p.population.toLocaleString("en-US")}${p.year ? ` (${p.year})` : ""}`, kind: "retrieved", source, retrievedAt: at, note: p.sourceUrl ? `Check it: ${p.sourceUrl}` : undefined });
  if (finite(p.areaKm2) !== null) book.add({ label: `Area of ${p.place}`, value: `${Number(p.areaKm2!.toFixed(1)).toLocaleString("en-US")} km²`, kind: "retrieved", source, retrievedAt: at });
  if (finite(p.densityPerKm2) !== null) {
    book.add({ label: `Population density of ${p.place}`, value: `${Math.round(p.densityPerKm2!).toLocaleString("en-US")} people per km²`, kind: "computed", source, retrievedAt: at, note: "Population divided by area, for the whole place named, not this exact spot." });
  }
  return { status: "ok" };
};

const weather: Tool = async ({ anchor, req, book }) => {
  const answer = await callRoute<{ weather: { temperatureC?: number | null; feelsLikeC?: number | null; condition?: string; humidityPct?: number | null; windKph?: number | null; precipitationMm?: number | null; forecast?: Array<{ date: string; maxC: number; minC: number; condition: string }>; source?: string; fetchedAt?: string } }>(
    weatherRoute,
    { lat: anchor.lat, lon: anchor.lon },
    req,
    SOURCE_TIMEOUT_MS
  );
  const w = answer.status === 200 ? answer.body?.weather : undefined;
  if (!w) {
    book.add({ label: "Weather now", value: "Unavailable", kind: "unavailable", source: "Open-Meteo", note: failureReason(answer) });
    return { status: "failed", problem: "The weather service did not answer." };
  }
  const base = { kind: "retrieved" as const, source: w.source || "Open-Meteo", retrievedAt: w.fetchedAt };
  const t = finite(w.temperatureC);
  const feels = finite(w.feelsLikeC);
  const humidity = finite(w.humidityPct);
  const wind = finite(w.windKph);
  const rain = finite(w.precipitationMm);
  if (t !== null) book.add({ ...base, label: "Temperature now", value: `${Math.round(t)} °C` });
  if (feels !== null) book.add({ ...base, label: "Feels like", value: `${Math.round(feels)} °C` });
  if (w.condition) book.add({ ...base, label: "Conditions now", value: w.condition });
  if (humidity !== null) book.add({ ...base, label: "Humidity", value: `${Math.round(humidity)}%` });
  if (wind !== null) book.add({ ...base, label: "Wind", value: `${Math.round(wind)} km/h` });
  if (rain !== null) book.add({ ...base, label: "Rain in the last hour", value: `${rain} mm` });
  for (const day of (w.forecast ?? []).slice(0, 2)) {
    if (finite(day.maxC) === null || finite(day.minC) === null) continue;
    book.add({ ...base, label: `Forecast for ${day.date}`, value: `${Math.round(day.maxC)} °C high, ${Math.round(day.minC)} °C low, ${day.condition}` });
  }
  return t === null && !w.condition ? { status: "partial", problem: "The weather service answered without current readings." } : { status: "ok" };
};

function fetchNearby(ctx: ToolContext): Promise<NearbyAnswer> {
  ctx.shared.nearby ??= callRoute(nearbyRoute, { lat: ctx.anchor.lat, lon: ctx.anchor.lon, radius: NEARBY_RADIUS_M }, ctx.req, SOURCE_TIMEOUT_MS);
  return ctx.shared.nearby;
}

const nearby: Tool = async (ctx) => {
  const { book } = ctx;
  const answer = await fetchNearby(ctx);
  const body = answer.status === 200 ? answer.body : null;
  if (!body || !Array.isArray(body.items)) {
    book.add({ label: `Places within ${distanceLabel(NEARBY_RADIUS_M)}`, value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: failureReason(answer) });
    return { status: "failed", problem: "OpenStreetMap (Overpass) did not answer with nearby places." };
  }
  const within = `within ${distanceLabel(body.radiusMeters || NEARBY_RADIUS_M)}`;
  const capped = body.items.length >= 60;
  const notes = [
    capped ? "Only the 60 closest places were fetched, so this is a sample, not a full count." : "",
    body.widened ? "The search was widened because little was mapped closer." : "",
    body.stale ? "Overpass did not answer, so this is an older saved copy." : "",
  ].filter(Boolean);
  const byCategory = new Map<string, Array<{ name: string; distanceMeters: number }>>();
  for (const item of body.items) {
    const list = byCategory.get(item.category) ?? [];
    list.push({ name: item.name, distanceMeters: item.distanceMeters });
    byCategory.set(item.category, list);
  }
  if (byCategory.size === 0) {
    book.add({ label: `Places ${within}`, value: "None mapped", kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: body.fetchedAt, note: "Nothing in the tracked categories is mapped here. That can mean it is not mapped yet." });
  }
  for (const [category, list] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const closest = list[0]!;
    const named = closest.name && closest.name !== category ? `${closest.name}, ` : "";
    book.add({
      label: `${NEARBY_LABELS[category] ?? category} ${within}`,
      value: `${list.length} (closest: ${named}${distanceLabel(closest.distanceMeters)})`,
      kind: "retrieved",
      source: "OpenStreetMap via Overpass",
      retrievedAt: body.fetchedAt,
      note: notes.join(" ") || undefined,
    });
  }
  return body.stale ? { status: "partial", problem: "Nearby places come from an older saved copy." } : { status: "ok" };
};

/**
 * For "route to the nearest X": the closest mapped place of that category,
 * from the same nearby answer the Nearby tool reads. Its distance here is in
 * a straight line; the route that follows gives the real one.
 */
async function nearestTarget(ctx: ToolContext): Promise<AgentAnchor["route"] | undefined> {
  const wanted = ctx.options.nearest;
  if (!wanted) return undefined;
  const answer = await fetchNearby(ctx);
  const items = answer.status === 200 && Array.isArray(answer.body?.items) ? answer.body!.items : null;
  if (!items) {
    ctx.book.add({ label: `Nearest ${wanted.label}`, value: "Unavailable", kind: "unavailable", source: "OpenStreetMap via Overpass", note: failureReason(answer) });
    return undefined;
  }
  const match = items.filter((i) => i.category === wanted.category && Number.isFinite(i.lat) && Number.isFinite(i.lon)).sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
  if (!match) {
    ctx.book.add({ label: `Nearest ${wanted.label}`, value: `None mapped within ${distanceLabel(answer.body!.radiusMeters || NEARBY_RADIUS_M)}`, kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: answer.body!.fetchedAt, note: "None may be mapped yet; that is not proof there is none." });
    return undefined;
  }
  const name = match.name && match.name !== match.category ? match.name : `Unnamed ${wanted.label}`;
  ctx.book.add({ label: `Nearest ${wanted.label}`, value: `${name}, ${distanceLabel(match.distanceMeters)} away in a straight line`, kind: "computed", source: "maNOWj, from OpenStreetMap via Overpass", retrievedAt: answer.body!.fetchedAt, note: "Closest mapped place of this kind within the nearby search." });
  ctx.shared.routeTarget = { name, lat: match.lat, lon: match.lon, mode: "car" };
  return { fromLat: ctx.anchor.lat, fromLon: ctx.anchor.lon, toLat: match.lat, toLon: match.lon, mode: "car" };
}

const route: Tool = async (ctx) => {
  const { anchor, req, book } = ctx;
  const r = anchor.route ?? (await nearestTarget(ctx));
  if (!r && ctx.options.nearest) return { status: "failed", problem: `No ${ctx.options.nearest.label} was found to route to.` };
  if (!r) {
    book.add({ label: "Route", value: "No route planned", kind: "unavailable", source: "Directions panel", note: "Choose a start and an end in Directions first." });
    return { status: "failed", problem: "No route is planned yet." };
  }
  const answer = await callRoute<{
    route: {
      mode: string;
      distanceMeters: number;
      durationSeconds: number;
      alternatives?: number;
      source?: string;
      steps?: Array<{ instruction?: string; distanceMeters?: number }>;
      options?: Array<{ distanceMeters: number; durationSeconds: number; summary?: string; steps?: Array<{ instruction?: string; distanceMeters?: number }> }>;
    };
  }>(
    routeRoute,
    { fromLat: r.fromLat, fromLon: r.fromLon, toLat: r.toLat, toLon: r.toLon, mode: r.mode },
    req,
    SOURCE_TIMEOUT_MS
  );
  const found = answer.status === 200 ? answer.body?.route : undefined;
  if (!found || finite(found.distanceMeters) === null) {
    book.add({ label: "Route", value: "Unavailable", kind: "unavailable", source: "Routing provider", note: failureReason(answer) });
    return { status: "failed", problem: "The routing provider found no route or did not answer." };
  }
  const base = { kind: "retrieved" as const, source: sanitizeField(found.source, 60) || "OSRM", retrievedAt: new Date().toISOString() };
  const modeLabel = { car: "Driving", walk: "Walking", bike: "Cycling" }[r.mode] ?? r.mode;
  book.add({ ...base, label: "Travel mode", value: modeLabel });
  book.add({ ...base, label: "Route distance", value: distanceLabel(found.distanceMeters) });
  if (finite(found.durationSeconds) !== null) {
    book.add({ ...base, label: "Route time", value: `about ${Math.max(1, Math.round(found.durationSeconds / 60))} min`, note: "From the provider's typical speeds. There is no live traffic data." });
  }
  book.add({ ...base, label: "Straight-line distance", value: distanceLabel(metresBetween({ lat: r.fromLat, lon: r.fromLon }, { lat: r.toLat, lon: r.toLon })), kind: "computed", source: "maNOWj", note: "As the crow flies, for comparison with the route." });
  if (finite(found.alternatives) !== null) book.add({ ...base, label: "Other routes offered", value: String(found.alternatives) });
  // Each alternative the provider offered, as the provider measured it.
  (found.options ?? []).slice(1, 3).forEach((option, i) => {
    if (finite(option.distanceMeters) === null || finite(option.durationSeconds) === null) return;
    book.add({
      ...base,
      label: `Alternative route ${i + 2}`,
      value: `${distanceLabel(option.distanceMeters)}, about ${Math.max(1, Math.round(option.durationSeconds / 60))} min${option.summary ? ` (${sanitizeField(option.summary, 60)} than the fastest)`.replace(" (About the same than the fastest)", " (about the same as the fastest)") : ""}`,
    });
  });
  // The first turns, from the provider's own turn-by-turn list.
  const steps = (found.options?.[0]?.steps ?? found.steps ?? []).filter((step) => typeof step?.instruction === "string" && step.instruction.trim());
  if (steps.length) {
    book.add({
      ...base,
      label: `Turn-by-turn (first ${Math.min(3, steps.length)} of ${steps.length} steps)`,
      value: steps
        .slice(0, 3)
        .map((step) => `${sanitizeField(step.instruction, 80)}${finite(step.distanceMeters) !== null && step.distanceMeters! > 0 ? ` (${distanceLabel(step.distanceMeters!)})` : ""}`)
        .join("; "),
    });
  }
  return { status: "ok" };
};

const search: Tool = async ({ anchor, req, book }) => {
  const query = anchor.query?.trim();
  if (!query) {
    book.add({ label: "Search", value: "Nothing typed in search", kind: "unavailable", source: "Search box", note: "This agent explains a search; with none, it can only describe the selected place." });
    return { status: "failed", problem: "Nothing was searched for." };
  }
  book.add({ label: "Searched for", value: query, kind: "retrieved", source: "Your search box" });
  const answer = await callRoute<{ results: Array<{ name: string; displayName: string; lat: number; lon: number }>; source?: string; approximate?: boolean; matchedQuery?: string }>(
    geocodeRoute,
    { q: query.slice(0, 200), lat: anchor.lat, lon: anchor.lon },
    req,
    SOURCE_TIMEOUT_MS
  );
  const body = answer.status === 200 ? answer.body : null;
  if (!body || !Array.isArray(body.results)) {
    book.add({ label: "Search matches", value: "Unavailable", kind: "unavailable", source: "OpenStreetMap search", note: failureReason(answer) });
    return { status: "failed", problem: "The search service did not answer." };
  }
  const source = sanitizeField(body.source, 60) || "OpenStreetMap search";
  const at = new Date().toISOString();
  book.add({ label: "Matches found", value: String(body.results.length), kind: "retrieved", source, retrievedAt: at, note: body.approximate ? `No exact match: these are the closest matches for "${sanitizeField(body.matchedQuery, 80)}".` : undefined });
  const [best, ...others] = body.results;
  if (best) {
    const away = metresBetween(anchor, best);
    book.add({ label: "Best match", value: best.displayName, kind: "retrieved", source, retrievedAt: at });
    book.add({
      label: "Selected place vs best match",
      value: away < 150 ? "The selected place is the best match" : `The selected place is ${distanceLabel(away)} from the best match`,
      kind: "computed",
      source: "maNOWj",
    });
  }
  if (others.length) {
    book.add({
      label: "Other matches",
      value: others.slice(0, 4).map((o) => `${o.displayName} (${distanceLabel(metresBetween(anchor, o))} from the selected place)`).join("; "),
      kind: "retrieved",
      source,
      retrievedAt: at,
    });
  }
  return { status: "ok" };
};

/**
 * Current office holders for the place's country, state, district and city,
 * from the officials route (Wikidata). The browser used to send this list
 * with each entry already marked "verified"; now the server asks for it.
 */
const officials: Tool = async (ctx) => {
  const placeAnswer = await fetchPlace(ctx);
  const address = placeAnswer.status === 200 ? placeAnswer.body?.location?.address : undefined;
  if (!address?.countryCode) {
    ctx.book.add({ label: "Office holders", value: "Unavailable", kind: "unavailable", source: "Wikidata", note: "The place's country could not be identified, so office holders were not looked up." });
    return { status: "failed", problem: "Office holders could not be looked up without the place's country." };
  }
  const query: Record<string, string> = { countryCode: address.countryCode };
  for (const key of ["country", "state", "stateCode", "district", "city"] as const) {
    const value = address[key];
    if (value) query[key] = value;
  }
  const answer = await callRoute<{ officials: Array<{ levelLabel: string; role: string; name: string | null; status: "verified" | "unavailable"; since: string | null; sourceUrl: string | null; sourceLabel: string; note?: string }>; fetchedAt?: string }>(
    officialsRoute,
    query,
    ctx.req,
    SOURCE_TIMEOUT_MS
  );
  const list = answer.status === 200 ? answer.body?.officials : undefined;
  if (!Array.isArray(list)) {
    ctx.book.add({ label: "Office holders", value: "Unavailable", kind: "unavailable", source: "Wikidata", note: failureReason(answer) });
    return { status: "failed", problem: "Wikidata did not answer for office holders." };
  }
  for (const o of list.slice(0, 20)) {
    const label = `${o.levelLabel} ${o.role}`;
    if (o.status === "verified" && o.name) {
      ctx.book.add({
        label,
        value: o.name,
        kind: "retrieved",
        source: sanitizeField(o.sourceLabel, 80) || "Wikidata",
        retrievedAt: answer.body?.fetchedAt,
        note: [o.since ? `In office since ${o.since}.` : "", o.sourceUrl ? `Check it: ${o.sourceUrl}` : ""].filter(Boolean).join(" ") || undefined,
      });
    } else {
      ctx.book.add({ label, value: "Unable to verify", kind: "unavailable", source: "Wikidata", note: o.note ? sanitizeField(o.note, 200) : undefined });
    }
  }
  return { status: "ok" };
};

const TOOLS: Record<ToolName, Tool> = { place, gis, property, population, weather, nearby, route, search, officials };

/**
 * Runs an agent's sources in parallel and returns everything they found,
 * with one real step per source for the timeline. Items are numbered in a
 * fixed order (the agent's tool order), not in the order sources answered,
 * so the same evidence always gets the same ids.
 */
export function gatherForAgent(kind: AgentKind, anchor: AgentAnchor, req: ApiRequest): Promise<Gathered> {
  return gatherTools(AGENT_TOOLS[kind].tools, anchor, req);
}

/** Runs any set of sources in parallel; used by the agents, the Copilot and the orchestrator. */
export async function gatherTools(tools: ToolName[], anchor: AgentAnchor, req: ApiRequest, options: GatherOptions = {}): Promise<Gathered> {
  const shared: ToolContext["shared"] = {};
  const results = await Promise.all(
    tools.map(async (tool) => {
      const book = new EvidenceBook();
      const started = Date.now();
      let outcome: Omit<ToolOutcome, "tool">;
      try {
        outcome = await TOOLS[tool]({ anchor, req, book, shared, options });
      } catch (error) {
        console.error(`[evidence] ${tool} failed`, error);
        book.add({ label: STEP_LABELS[tool], value: "Unavailable", kind: "unavailable", source: "maNOWj", note: "This step failed unexpectedly." });
        outcome = { status: "failed", problem: `${STEP_LABELS[tool]} failed.` };
      }
      return { tool, book, outcome, ms: Date.now() - started };
    })
  );

  const items: EvidenceItem[] = [];
  for (const r of results) {
    for (const item of r.book.items) items.push({ ...item, id: `E${items.length + 1}` });
  }
  return {
    items,
    steps: results.map((r) => ({ step: STEP_LABELS[r.tool], status: r.outcome.status, ms: r.ms })),
    outcomes: results.map((r) => ({ tool: r.tool, ...r.outcome })),
    routeTarget: shared.routeTarget,
  };
}
