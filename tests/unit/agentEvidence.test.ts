import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";

/**
 * MOCK TESTS. The data routes are replaced by stand-ins that answer with
 * fixed bodies, so these check how the agents gather and label evidence -
 * not whether any provider is right. Each route's own tests cover that.
 */
type Answer = { status: number; body: unknown } | "hang";
const routes = vi.hoisted(() => ({
  answers: {} as Record<string, Answer>,
  calls: {} as Record<string, Array<{ query: Record<string, string>; headers: Record<string, unknown> }>>,
}));

function stand(name: string) {
  return {
    default: async (req: ApiRequest, res: ApiResponse) => {
      (routes.calls[name] ??= []).push({ query: req.query as Record<string, string>, headers: req.headers as Record<string, unknown> });
      const answer = routes.answers[name] ?? { status: 503, body: { ok: false, error: `${name} not set up` } };
      if (answer === "hang") return new Promise(() => {});
      res.status(answer.status).json(answer.body);
    },
  };
}

vi.mock("../../api/_routes/reverse-geocode", () => stand("reverse-geocode"));
vi.mock("../../api/_routes/gis", () => stand("gis"));
vi.mock("../../api/_routes/weather", () => stand("weather"));
vi.mock("../../api/_routes/nearby", () => stand("nearby"));
vi.mock("../../api/_routes/route", () => stand("route"));
vi.mock("../../api/_routes/geocode", () => stand("geocode"));
vi.mock("../../api/_routes/population", () => stand("population"));

import { gatherForAgent, SOURCE_TIMEOUT_MS } from "../../api/_lib/evidence/gather";

const AT = "2026-11-25T07:30:00.000Z";
const BANJARA = { lat: 17.4177, lon: 78.4399 };

const PLACE = { status: 200, body: { ok: true, location: { name: "Banjara Hills", displayName: "Banjara Hills, Hyderabad", source: "OpenStreetMap / Nominatim", address: { suburb: "Banjara Hills", city: "Hyderabad", state: "Telangana", country: "India" } } } };
const WEATHER = { status: 200, body: { ok: true, weather: { temperatureC: 31.4, feelsLikeC: 33, condition: "Partly cloudy", humidityPct: 48, windKph: 11, precipitationMm: 0, forecast: [{ date: "2026-11-25", maxC: 32, minC: 21, condition: "Clear" }], source: "Open-Meteo", fetchedAt: AT } } };
const NEARBY = {
  status: 200,
  body: {
    ok: true,
    radiusMeters: 1000,
    fetchedAt: AT,
    items: [
      { name: "Care Clinic", category: "hospitals", distanceMeters: 350 },
      { name: "City Hospital", category: "hospitals", distanceMeters: 900 },
      { name: "Chai Point", category: "cafes", distanceMeters: 120 },
    ],
  },
};
const GIS = {
  status: 200,
  body: {
    ok: true,
    evidence: {
      trust: "verified",
      radiusMeters: 250,
      counts: { buildings: 40, shops: 12, offices: 3, residential: 25, industrial: 0, institutional: 2, amenities: 9, tourism: 0, transport: 4 },
      scores: { commercial: 41, residential: 50, industrial: 0, institutional: 5, landmark: 0, transport: 8 },
      subject: null,
      features: [],
      source: "OpenStreetMap / Overpass",
      fetchedAt: AT,
      incomplete: false,
    },
  },
};

function request(ip = "203.0.113.7") {
  const { req } = fakeReqRes({});
  (req.headers as Record<string, string>)["x-forwarded-for"] = ip;
  return req;
}

describe("evidence the agents gather themselves (mock providers)", () => {
  beforeEach(() => {
    routes.answers = {};
    routes.calls = {};
  });
  afterEach(() => vi.useRealTimers());

  it("takes every fact from a provider route, with the provider and the time it answered", async () => {
    routes.answers = { "reverse-geocode": PLACE, weather: WEATHER, nearby: NEARBY };
    const g = await gatherForAgent("travel", BANJARA, request());

    const temp = g.items.find((i) => i.label === "Temperature now")!;
    expect(temp).toMatchObject({ value: "31 °C", kind: "retrieved", source: "Open-Meteo", retrievedAt: AT });
    const clinics = g.items.find((i) => i.label === "Hospitals and clinics within 1 km")!;
    expect(clinics).toMatchObject({ value: "2 (closest: Care Clinic, 350 m)", source: "OpenStreetMap via Overpass", retrievedAt: AT });
    expect(g.items.find((i) => i.label === "Place name")!.value).toBe("Banjara Hills");
    expect(g.outcomes.every((o) => o.status === "ok")).toBe(true);
  });

  it("numbers the evidence in a fixed order, whatever answered first", async () => {
    routes.answers = { "reverse-geocode": PLACE, weather: WEATHER, nearby: NEARBY };
    const g = await gatherForAgent("travel", BANJARA, request());
    expect(g.items.map((i) => i.id)).toEqual(g.items.map((_, n) => `E${n + 1}`));
    expect(g.items[0]!.label).toBe("Place name");
  });

  it("marks a failed source unavailable with its reason, and never fills it in", async () => {
    routes.answers = { "reverse-geocode": PLACE, weather: { status: 502, body: { ok: false, error: "Weather is temporarily unavailable." } }, nearby: NEARBY };
    const g = await gatherForAgent("travel", BANJARA, request());
    const weather = g.items.find((i) => i.label === "Weather now")!;
    expect(weather).toMatchObject({ value: "Unavailable", kind: "unavailable", note: "Weather is temporarily unavailable." });
    expect(g.items.some((i) => i.label === "Temperature now")).toBe(false);
    expect(g.outcomes.find((o) => o.tool === "weather")!.status).toBe("failed");
  });

  it("counts a source that does not answer in time as failed", async () => {
    vi.useFakeTimers();
    routes.answers = { "reverse-geocode": PLACE, weather: "hang", nearby: NEARBY };
    const pending = gatherForAgent("travel", BANJARA, request());
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS + 10);
    const g = await pending;
    expect(g.items.find((i) => i.label === "Weather now")!.note).toBe(`It did not answer within ${SOURCE_TIMEOUT_MS / 1000} seconds.`);
    expect(g.steps.find((s) => s.step.startsWith("Reading current weather"))!.status).toBe("failed");
  });

  it("asks Overpass once when GIS and Property both need it", async () => {
    routes.answers = { "reverse-geocode": PLACE, gis: GIS };
    const g = await gatherForAgent("property", BANJARA, request());
    expect(routes.calls.gis).toHaveLength(1);
    expect(g.items.find((i) => i.label === "Mapped shops within 250 m")!.value).toBe("12");
    const classification = g.items.find((i) => i.label === "Property classification")!;
    expect(classification.kind).toBe("computed");
    expect(classification.note).toMatch(/Not a land record/);
  });

  it("says an Overpass answer cut short may be low, and calls it partial", async () => {
    const cut = structuredClone(GIS);
    (cut.body.evidence as { incomplete: boolean }).incomplete = true;
    routes.answers = { "reverse-geocode": PLACE, gis: cut, population: { status: 200, body: { ok: true, population: null } } };
    const g = await gatherForAgent("gis", BANJARA, request());
    expect(g.items.find((i) => i.label === "Mapped shops within 250 m")!.note).toBe("Overpass stopped part-way, so this may be low.");
    expect(g.outcomes.find((o) => o.tool === "gis")!.status).toBe("partial");
  });

  it("plans nothing and asks no router when no route is set", async () => {
    routes.answers = { "reverse-geocode": PLACE };
    const g = await gatherForAgent("navigation", BANJARA, request());
    expect(routes.calls.route).toBeUndefined();
    expect(g.items.find((i) => i.label === "Route")).toMatchObject({ value: "No route planned", kind: "unavailable" });
  });

  it("passes the visitor's own address through, so per-visitor limits still apply", async () => {
    routes.answers = { "reverse-geocode": PLACE, route: { status: 200, body: { ok: true, route: { mode: "car", distanceMeters: 12400, durationSeconds: 1860, alternatives: 1, source: "OSRM" } } } };
    await gatherForAgent("navigation", { ...BANJARA, route: { fromLat: 17.44, fromLon: 78.38, toLat: 17.24, toLon: 78.43, mode: "car" } }, request("198.51.100.9"));
    expect(routes.calls.route![0]!.headers["x-forwarded-for"]).toBe("198.51.100.9");
    expect(routes.calls.route![0]!.query).toEqual({ fromLat: "17.44", fromLon: "78.38", toLat: "17.24", toLon: "78.43", mode: "car" });
  });

  it("uses the route provider's own distance and time", async () => {
    routes.answers = { "reverse-geocode": PLACE, route: { status: 200, body: { ok: true, route: { mode: "car", distanceMeters: 12400, durationSeconds: 1860, alternatives: 1, source: "OSRM" } } } };
    const g = await gatherForAgent("navigation", { ...BANJARA, route: { fromLat: 17.44, fromLon: 78.38, toLat: 17.24, toLon: 78.43, mode: "car" } }, request());
    expect(g.items.find((i) => i.label === "Route distance")).toMatchObject({ value: "12.4 km", kind: "retrieved", source: "OSRM" });
    expect(g.items.find((i) => i.label === "Route time")).toMatchObject({ value: "about 31 min", note: "From the provider's typical speeds. There is no live traffic data." });
  });

  it("re-runs the visitor's search and says how far the selected place is from the best match", async () => {
    routes.answers = {
      "reverse-geocode": PLACE,
      geocode: { status: 200, body: { ok: true, source: "OpenStreetMap / Nominatim", results: [{ name: "Banjara Hills", displayName: "Banjara Hills, Hyderabad", lat: 17.4177, lon: 78.4399 }, { name: "Banjara Hills", displayName: "Banjara Hills, Bengaluru", lat: 12.97, lon: 77.59 }] } },
    };
    const g = await gatherForAgent("search", { ...BANJARA, query: "banjara hills" }, request());
    expect(routes.calls.geocode![0]!.query.q).toBe("banjara hills");
    expect(g.items.find((i) => i.label === "Selected place vs best match")!.value).toBe("The selected place is the best match");
    expect(g.items.find((i) => i.label === "Other matches")!.value).toMatch(/^Banjara Hills, Bengaluru \(\d+(\.\d)? km from the selected place\)$/);
  });

  it("snaps an odd radius to one the GIS route accepts", async () => {
    routes.answers = { "reverse-geocode": PLACE, gis: GIS, population: { status: 200, body: { ok: true, population: null } } };
    await gatherForAgent("gis", { ...BANJARA, radiusMeters: 480 }, request());
    expect(routes.calls.gis![0]!.query.radius).toBe("500");
  });
});

describe("navigation evidence beyond the fastest route (mock providers)", () => {
  beforeEach(() => {
    routes.answers = {};
    routes.calls = {};
  });

  it("lists the alternatives and the first turns exactly as the provider gave them", async () => {
    routes.answers = {
      "reverse-geocode": PLACE,
      route: {
        status: 200,
        body: {
          ok: true,
          route: {
            mode: "car",
            distanceMeters: 12400,
            durationSeconds: 1860,
            alternatives: 1,
            source: "OSRM",
            options: [
              { distanceMeters: 12400, durationSeconds: 1860, summary: "Fastest", steps: [{ instruction: "Head north on Road No. 1", distanceMeters: 400 }, { instruction: "Turn right onto Road No. 12", distanceMeters: 1200 }, { instruction: "Arrive at your destination", distanceMeters: 0 }] },
              { distanceMeters: 13100, durationSeconds: 2040, summary: "3 min slower · 0.7 km longer" },
            ],
          },
        },
      },
    };
    const g = await gatherForAgent("navigation", { ...BANJARA, route: { fromLat: 17.44, fromLon: 78.38, toLat: 17.24, toLon: 78.43, mode: "car" } }, request());
    expect(g.items.find((i) => i.label === "Alternative route 2")!.value).toBe("13.1 km, about 34 min (3 min slower · 0.7 km longer than the fastest)");
    expect(g.items.find((i) => i.label.startsWith("Turn-by-turn"))).toMatchObject({
      label: "Turn-by-turn (first 3 of 3 steps)",
      value: "Head north on Road No. 1 (400 m); Turn right onto Road No. 12 (1.2 km); Arrive at your destination",
      source: "OSRM",
    });
  });
});
