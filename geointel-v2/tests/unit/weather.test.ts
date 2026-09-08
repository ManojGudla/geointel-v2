import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/weather";

function mockFetchOnce(ok: boolean, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }))
  );
}

describe("api/weather handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires lat/lon", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
  });

  it("maps Open-Meteo's response into the WeatherData shape", async () => {
    mockFetchOnce(true, {
      current: { temperature_2m: 28, apparent_temperature: 30, relative_humidity_2m: 60, wind_speed_10m: 12, precipitation: 0, weather_code: 1 },
      daily: {
        time: ["2026-08-31", "2026-09-01"],
        temperature_2m_max: [33, 32],
        temperature_2m_min: [24, 23],
        weather_code: [1, 2],
        sunrise: ["2026-08-31T06:00"],
        sunset: ["2026-08-31T18:30"],
      },
    });
    const result = fakeReqRes({ lat: "17.36", lon: "78.47" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { weather: { temperatureC: number; condition: string; forecast: unknown[] } };
    expect(parsed.weather.temperatureC).toBe(28);
    expect(parsed.weather.condition).toBe("Mainly clear");
    expect(parsed.weather.forecast).toHaveLength(2);
  });

  it("never throws when the provider is unreachable — reports unavailable instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    // Different coordinates than the earlier test — api/weather.ts caches
    // successful responses by rounded lat/lon, and reusing the same point
    // would hit that cache instead of exercising the failure path here.
    const result = fakeReqRes({ lat: "5.11", lon: "9.22" });
    await expect(handler(result.req, result.res)).resolves.not.toThrow();
    expect(result.statusCode).toBe(502);
    expect((result.body as { code: string }).code).toBe("PROVIDER_UNAVAILABLE");
  });
});
