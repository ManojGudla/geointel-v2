import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/geocode";

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

describe("api/geocode handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires a query parameter", async () => {
    const result = fakeReqRes({});
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(400);
    expect((result.body as { ok: boolean }).ok).toBe(false);
  });

  it("returns an empty result set for very short queries without calling the provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = fakeReqRes({ q: "a" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    expect((result.body as { results: unknown[] }).results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps a successful Nominatim response into the DTO shape", async () => {
    mockFetchOnce(200, [
      { lat: "17.3616", lon: "78.4747", display_name: "Charminar, Hyderabad, Telangana, India", name: "Charminar", importance: 0.8 },
    ]);
    const result = fakeReqRes({ q: "Charminar Hyderabad" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(200);
    const parsed = result.body as { ok: boolean; results: Array<{ lat: number; lon: number; name: string }> };
    expect(parsed.ok).toBe(true);
    expect(parsed.results[0]).toMatchObject({ lat: 17.3616, lon: 78.4747, name: "Charminar" });
  });

  it("degrades to an 'unavailable' response instead of throwing when the provider fails", async () => {
    mockFetchOnce(503, {});
    // Deliberately a different query than the earlier test - api/geocode.ts
    // caches successful responses by query text, and a shared cache key
    // would hit that cache instead of exercising the failure path here.
    const result = fakeReqRes({ q: "Unreachable Test Query" });
    await handler(result.req, result.res);
    expect(result.statusCode).toBe(502);
    const parsed = result.body as { ok: boolean; code: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
