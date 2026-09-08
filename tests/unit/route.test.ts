import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/route";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  );
}

function query(seed: number) {
  // Each test needs its own coordinates — api/route.ts caches successful
  // responses by rounded from/to coords, and reusing the same pair across
  // tests would return a previous test's cached (and differently-shaped)
  // response instead of exercising the mock set up in this test.
  return { fromLat: `${17.385 + seed}`, fromLon: `${78.4867 + seed}`, toLat: `${17.4239 + seed}`, toLon: `${78.4738 + seed}`, mode: "car" };
}

/**
 * Regression coverage for a Feature Status audit finding: "Turn-by-turn
 * directions" was labeled live, but api/route.ts requested `steps=false`
 * from OSRM, so no maneuver instructions were ever fetched or shown — only
 * aggregate distance/duration. These tests assert the real fix: OSRM's own
 * maneuver data (a fixed, documented vocabulary) is now requested and turned
 * into real per-step instructions, never invented text.
 */
describe("api/route handler — turn-by-turn steps", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests steps=true from the routing provider", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: "Ok",
        routes: [{ distance: 100, duration: 60, geometry: { coordinates: [] }, legs: [] }],
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = fakeReqRes(query(0.001));
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("steps=true");
  });

  it("turns OSRM maneuver data into real instruction strings, in order, with no invented text", async () => {
    mockFetchOnce(200, {
      code: "Ok",
      routes: [
        {
          distance: 5000,
          duration: 600,
          geometry: { coordinates: [[78.4867, 17.385], [78.4738, 17.4239]] },
          legs: [
            {
              steps: [
                { distance: 120, duration: 30, name: "Tank Bund Road", maneuver: { type: "depart", modifier: "straight", location: [78.4867, 17.385] } },
                { distance: 800, duration: 90, name: "NH65", maneuver: { type: "turn", modifier: "right", location: [78.48, 17.4] } },
                { distance: 0, duration: 0, name: "", maneuver: { type: "arrive", location: [78.4738, 17.4239] } },
              ],
            },
          ],
        },
      ],
    });

    const result = fakeReqRes(query(0.002));
    await handler(result.req, result.res);

    expect(result.statusCode).toBe(200);
    const parsed = result.body as {
      ok: boolean;
      route: {
        steps: Array<{
          instruction: string;
          distanceMeters: number;
          durationSeconds: number;
          location: [number, number];
          type: string;
          modifier?: string;
        }>;
        options: Array<{ summary: string; steps: unknown[]; geometry: unknown[] }>;
      };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.route.steps.map((s) => ({ instruction: s.instruction, distanceMeters: s.distanceMeters }))).toEqual([
      { instruction: "Head straight ahead onto Tank Bund Road", distanceMeters: 120 },
      { instruction: "Turn right onto NH65", distanceMeters: 800 },
      { instruction: "Arrive at your destination", distanceMeters: 0 },
    ]);

    // Each step carries WHERE the manoeuvre happens and how long it takes —
    // without the coordinates, tapping a step in the panel has nowhere to fly
    // to, which is what made the old directions a printed list.
    expect(parsed.route.steps.map((s) => s.location)).toEqual([
      [78.4867, 17.385],
      [78.48, 17.4],
      [78.4738, 17.4239],
    ]);
    expect(parsed.route.steps.map((s) => s.durationSeconds)).toEqual([30, 90, 0]);
    expect(parsed.route.steps.map((s) => [s.type, s.modifier])).toEqual([
      ["depart", "straight"],
      ["turn", "right"],
      ["arrive", undefined],
    ]);

    // The primary route is always exposed as an option too, so the UI has one
    // uniform list to render whether or not alternatives came back.
    expect(parsed.route.options).toHaveLength(1);
    expect(parsed.route.options[0]!.summary).toBe("Fastest");
  });

  it("returns every alternative with an honest difference summary", async () => {
    mockFetchOnce(200, {
      code: "Ok",
      routes: [
        {
          distance: 10_000,
          duration: 900,
          geometry: { coordinates: [[78, 17], [78.1, 17.1]] },
          legs: [{ steps: [{ distance: 10_000, duration: 900, name: "A", maneuver: { type: "depart", location: [78, 17] } }] }],
        },
        {
          // 5 minutes slower, 2 km longer.
          distance: 12_000,
          duration: 1200,
          geometry: { coordinates: [[78, 17], [78.2, 17.2]] },
          legs: [{ steps: [{ distance: 12_000, duration: 1200, name: "B", maneuver: { type: "depart", location: [78, 17] } }] }],
        },
      ],
    });

    const result = fakeReqRes(query(0.004));
    await handler(result.req, result.res);

    const parsed = result.body as {
      route: { alternatives: number; options: Array<{ summary: string; durationSeconds: number; distanceMeters: number }> };
    };
    expect(parsed.route.alternatives).toBe(1);
    expect(parsed.route.options).toHaveLength(2);
    expect(parsed.route.options[0]!.summary).toBe("Fastest");
    // The summary is computed from the real numbers, never a made-up label
    // like "scenic route" that OSRM does not report.
    expect(parsed.route.options[1]!.summary).toBe("5 min slower · 2.0 km longer");
    // The primary is the fastest one, which is what the panel shows first.
    expect(parsed.route.options[0]!.durationSeconds).toBe(900);
  });

  it("drops zero-distance non-arrival steps instead of showing near-duplicate instructions", async () => {
    mockFetchOnce(200, {
      code: "Ok",
      routes: [
        {
          distance: 500,
          duration: 60,
          geometry: { coordinates: [] },
          legs: [
            {
              steps: [
                { distance: 0, name: "", maneuver: { type: "notification" } },
                { distance: 500, name: "Main Road", maneuver: { type: "depart" } },
                { distance: 0, name: "", maneuver: { type: "arrive" } },
              ],
            },
          ],
        },
      ],
    });

    const result = fakeReqRes(query(0.003));
    await handler(result.req, result.res);

    const parsed = result.body as { route: { steps: Array<{ instruction: string }> } };
    expect(parsed.route.steps).toHaveLength(2);
    expect(parsed.route.steps.map((s) => s.instruction)).toEqual(["Head onto Main Road", "Arrive at your destination"]);
  });
});
