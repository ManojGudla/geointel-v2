import { describe, expect, it, vi, afterEach } from "vitest";
import { relaxedQueries } from "../../api/_lib/photon";
import { fakeReqRes } from "./testUtils";
import handler from "../../api/_routes/geocode";

describe("relaxedQueries (addresses Nominatim can't parse)", () => {
  it("drops house, flat and plot numbers and 'near' landmarks, then peels parts off", () => {
    const out = relaxedQueries("H.No 12-3-45, Flat 302, Sai Residency, near Bus Stop, Ameerpet, Hyderabad");
    expect(out[0]).toBe("Sai Residency, Ameerpet, Hyderabad");
    expect(out).toContain("Ameerpet, Hyderabad");
    expect(out.every((q) => !/H\.No|Flat|near/i.test(q))).toBe(true);
  });

  it("gives nothing extra for a one-part query", () => {
    expect(relaxedQueries("Charminar")).toEqual([]);
  });
});

describe("api/geocode fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to Photon when Nominatim finds nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("nominatim")) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            features: [{ geometry: { coordinates: [78.4446, 17.4355] }, properties: { name: "Ameerpet Metro Interchange", locality: "Srinivas Nagar", state: "Telangana", country: "India" } }],
          }),
        };
      })
    );
    const res = fakeReqRes({ q: "amerpet metro stn" });
    await handler(res.req, res.res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { results: Array<{ name: string }>; source: string };
    expect(body.results[0]!.name).toBe("Ameerpet Metro Interchange");
    expect(body.source).toMatch(/Photon/);
  });

  it("labels a shortened-address result as the closest match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("nominatim")) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
        const q = new URL(u).searchParams.get("q") ?? "";
        const hit = q === "Sai Residency, Ameerpet, Hyderabad";
        return {
          ok: true,
          status: 200,
          json: async () => ({ features: hit ? [{ geometry: { coordinates: [78.44, 17.43] }, properties: { name: "Sai Residency", locality: "Ameerpet", city: "Hyderabad" } }] : [] }),
        };
      })
    );
    const res = fakeReqRes({ q: "H.No 12-3-45, Flat 302, Sai Residency, Ameerpet, Hyderabad" });
    await handler(res.req, res.res);
    const body = res.body as { results: Array<{ displayName: string }>; approximate?: boolean };
    expect(body.approximate).toBe(true);
    expect(body.results[0]!.displayName).toMatch(/^Closest match: Sai Residency/);
  });
});

describe("closest match must be in the same area", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects a same-named building in a different area and falls back to the area", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("nominatim")) return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
        const q = new URL(u).searchParams.get("q") ?? "";
        const features =
          q === "Sai Residency, Yousufguda, Hyderabad"
            ? [{ geometry: { coordinates: [78.5, 17.4] }, properties: { name: "Sri Sai Tirumala Residency", locality: "Chikkadpally", city: "Hyderabad" } }]
            : q === "Yousufguda, Hyderabad"
              ? [{ geometry: { coordinates: [78.43, 17.43] }, properties: { name: "Yousufguda", city: "Hyderabad", state: "Telangana" } }]
              : [];
        return { ok: true, status: 200, json: async () => ({ features }) };
      })
    );
    const res = fakeReqRes({ q: "H.No 8-3-228, Flat 201, Sai Residency, Yousufguda, Hyderabad" });
    await handler(res.req, res.res);
    const body = res.body as { results: Array<{ displayName: string }> };
    expect(body.results[0]!.displayName).toMatch(/^Closest match: Yousufguda/);
  });
});
