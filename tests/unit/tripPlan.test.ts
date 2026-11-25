import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";
import type { TripPlan } from "../../src/types/ai";

/**
 * Make My Trip plans. The ordering and picking are pure and tested directly;
 * the builder and endpoint run with MOCK providers (nearby places, sights
 * and routing are stand-ins), so these test the planning, not the data.
 */
const state = vi.hoisted(() => ({
  answers: {} as Record<string, { status: number; body: unknown } | ((q: Record<string, string>) => { status: number; body: unknown })>,
  calls: [] as Array<{ name: string; query: Record<string, string> }>,
}));

function stand(name: string) {
  return {
    default: async (req: ApiRequest, res: ApiResponse) => {
      const query = req.query as Record<string, string>;
      state.calls.push({ name, query });
      const a = state.answers[name];
      const answer = typeof a === "function" ? a(query) : a ?? { status: 503, body: { ok: false, error: `${name} unavailable` } };
      res.status(answer.status).json(answer.body);
    },
  };
}

vi.mock("../../api/_routes/nearby", () => stand("nearby"));
vi.mock("../../api/_routes/gis", () => stand("gis"));
vi.mock("../../api/_routes/route", () => stand("route"));

import { nearestNextOrder, pickStops } from "../../api/_lib/evidence/trip";
import tripHandler, { parseStops } from "../../api/_routes/ai/trip";

const CHARMINAR = { lat: 17.3616, lon: 78.4747 };
const AT = "2026-11-25T07:30:00.000Z";

const NEARBY = {
  status: 200,
  body: {
    ok: true,
    radiusMeters: 2000,
    fetchedAt: AT,
    items: [
      { name: "Nimrah Cafe", category: "cafes", lat: 17.3613, lon: 78.4743, distanceMeters: 50 },
      { name: "Shadab", category: "restaurants", lat: 17.3647, lon: 78.4722, distanceMeters: 430 },
      { name: "restaurants", category: "restaurants", lat: 17.3655, lon: 78.4733, distanceMeters: 450 },
      { name: "Laad Bazaar", category: "shopping", lat: 17.3611, lon: 78.4716, distanceMeters: 340 },
      { name: "Qutb Shahi Park", category: "parks", lat: 17.37, lon: 78.48, distanceMeters: 1100 },
    ],
  },
};
const SIGHTS = {
  status: 200,
  body: {
    ok: true,
    evidence: {
      fetchedAt: AT,
      features: [
        { lat: 17.3606, lon: 78.4736, tags: { tourism: "attraction", name: "Mecca Masjid" } },
        { lat: 17.3578, lon: 78.4717, tags: { historic: "palace", name: "Chowmahalla Palace" } },
        { lat: 17.3601, lon: 78.4745, tags: { tourism: "hotel", name: "Some Hotel" } },
        { lat: 17.3599, lon: 78.4751, tags: { tourism: "attraction" } },
      ],
    },
  },
};
const ROUTE = (q: Record<string, string>) => ({
  status: 200,
  body: { ok: true, route: { mode: q.mode, distanceMeters: 800, durationSeconds: 300, source: "OSRM" } },
});

async function post(body: Record<string, unknown>) {
  const r = fakeReqRes({});
  r.req.method = "POST";
  r.req.body = body;
  (r.req.headers as Record<string, string>)["x-forwarded-for"] = `203.0.113.${Math.floor(Math.random() * 250)}`;
  await tripHandler(r.req, r.res);
  return r;
}

const planOf = (r: { body: unknown }) => (r.body as { plan: TripPlan }).plan;

describe("ordering and picking stops", () => {
  it("visits the closest unvisited stop next", () => {
    const stops = [
      { name: "far", lat: 0, lon: 3 },
      { name: "near", lat: 0, lon: 1 },
      { name: "middle", lat: 0, lon: 2 },
    ];
    expect(nearestNextOrder({ lat: 0, lon: 0 }, stops).map((s) => s.name)).toEqual(["near", "middle", "far"]);
  });

  it("takes interests in turn, closest first, so one kind cannot fill the plan", () => {
    const candidates = {
      parks: [
        { name: "P1", category: "parks", lat: 0, lon: 0, distanceMeters: 100 },
        { name: "P2", category: "parks", lat: 0, lon: 0.1, distanceMeters: 50 },
      ],
      cafes: [{ name: "C1", category: "cafes", lat: 0, lon: 0.2, distanceMeters: 900 }],
    };
    expect(pickStops(candidates, ["parks", "cafes"], 3).map((s) => s.name)).toEqual(["P2", "C1", "P1"]);
  });
});

describe("building a trip (mock providers)", () => {
  beforeEach(() => {
    state.answers = { nearby: NEARBY, gis: SIGHTS, route: ROUTE };
    state.calls = [];
  });

  it("uses only named places in the interests asked for, and never a hotel as a sight", async () => {
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["attractions", "restaurants", "shopping"], days: 1, stopsPerDay: 4 }));
    const names = plan.days.flatMap((d) => d.stops.map((s) => s.name));
    expect(names.sort()).toEqual(["Chowmahalla Palace", "Laad Bazaar", "Mecca Masjid", "Shadab"]);
    expect(plan.order).toBe("nearest-next");
  });

  it("measures every hop with the routing provider, each day starting at the selected place", async () => {
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["attractions", "restaurants", "shopping", "cafes"], days: 2, stopsPerDay: 2, mode: "walk" }));
    const routeCalls = state.calls.filter((c) => c.name === "route");
    expect(routeCalls).toHaveLength(4);
    expect(routeCalls.every((c) => c.query.mode === "walk")).toBe(true);
    const day2First = plan.days[1]!.stops[0]!;
    expect(routeCalls.some((c) => c.query.fromLat === String(CHARMINAR.lat) && c.query.toLat === String(day2First.lat))).toBe(true);
    expect(plan.days[0]!.stops[0]!.leg).toEqual({ distanceMeters: 800, minutes: 5, source: "OSRM" });
  });

  it("adds the assumed visit time and the measured travel time for each day", async () => {
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["cafes", "shopping"], days: 1, stopsPerDay: 2 }));
    // cafe 30 + shop 60 assumed, plus two 5-minute hops.
    expect(plan.days[0]!.totalMinutes).toBe(100);
    expect(plan.assumptions[0]).toMatch(/^Time at each stop is this app's assumption, not opening hours/);
    expect(plan.assumptions[2]).toBe("No prices, tickets or bookings: this plan has no price data and books nothing.");
  });

  it("says when a hop could not be measured, rather than guessing a time", async () => {
    let n = 0;
    state.answers.route = (q) => (n++ === 1 ? { status: 502, body: { ok: false, error: "down" } } : ROUTE(q));
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["cafes", "shopping"], days: 1, stopsPerDay: 2 }));
    const unknown = plan.days[0]!.stops.find((s) => s.leg === null)!;
    expect(unknown).toBeDefined();
    expect(plan.days[0]!.warnings[0]).toMatch(/is unknown: the routing provider did not answer\.$/);
    expect(plan.steps.find((s) => s.step.startsWith("Measuring"))!.status).toBe("partial");
  });

  it("flags a day too full to be realistic", async () => {
    state.answers.route = () => ({ status: 200, body: { ok: true, route: { distanceMeters: 90_000, durationSeconds: 7200, source: "OSRM" } } });
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["attractions", "restaurants", "shopping"], days: 1, stopsPerDay: 3 }));
    expect(plan.days[0]!.warnings.some((w) => /too much for one day/.test(w))).toBe(true);
    expect(plan.days[0]!.warnings.some((w) => /takes about 120 min/.test(w))).toBe(true);
  });

  it("keeps the visitor's own order when they edited it, and only re-measures", async () => {
    const stops = [
      { name: "Laad Bazaar", category: "shopping", lat: 17.3611, lon: 78.4716 },
      { name: "Nimrah Cafe", category: "cafes", lat: 17.3613, lon: 78.4743 },
    ];
    const plan = planOf(await post({ anchor: CHARMINAR, stops, days: 1 }));
    expect(plan.order).toBe("yours");
    expect(plan.days[0]!.stops.map((s) => s.name)).toEqual(["Laad Bazaar", "Nimrah Cafe"]);
    expect(state.calls.some((c) => c.name === "nearby" || c.name === "gis")).toBe(false);
  });

  it("says when fewer stops were found than asked for", async () => {
    const plan = planOf(await post({ anchor: CHARMINAR, interests: ["parks"], days: 1, stopsPerDay: 3 }));
    expect(plan.days[0]!.stops).toHaveLength(1);
    expect(plan.evidence.find((e) => e.label === "Stops found")!.value).toBe("1 of the 3 asked for");
  });
});

describe("the trip endpoint's input", () => {
  it("needs a selected place", async () => {
    const r = await post({ interests: ["parks"] });
    expect(r.statusCode).toBe(400);
  });

  it("drops stops that are not real named places, and refuses a list with none left", async () => {
    expect(parseStops([{ name: "", lat: 1, lon: 1 }, { name: "Ok", lat: 95, lon: 1 }, { name: "Fine", lat: 1, lon: 1, category: "parks" }])).toEqual([{ name: "Fine", category: "parks", lat: 1, lon: 1 }]);
    const r = await post({ anchor: CHARMINAR, stops: [{ name: "", lat: 1, lon: 1 }] });
    expect(r.statusCode).toBe(400);
  });
});
