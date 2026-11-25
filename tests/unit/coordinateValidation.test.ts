import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeReqRes } from "./testUtils";
import { getNumberParam, readLatLon } from "../../api/_lib/http";
import gis from "../../api/_routes/gis";
import reverseGeocode from "../../api/_routes/reverse-geocode";
import weather from "../../api/_routes/weather";
import live from "../../api/_routes/live";
import route from "../../api/_routes/route";
import population from "../../api/_routes/population";
import imagery from "../../api/_routes/imagery";
import site from "../../api/_routes/site";
import nearby from "../../api/_routes/nearby";
import buildings from "../../api/_routes/buildings";
import type { ApiHandler } from "../../api/_lib/http";
import { wrapLongitude } from "@/features/map/geo";

/**
 * Coordinates that are not on the globe used to reach the providers.
 *
 * Several routes checked only Number.isFinite, so ?lat=500 was sent on to
 * Open-Meteo, Overpass or the routing server. Their refusal then came back
 * as "the service is unavailable", which is the wrong story, and every such
 * request spent a share of a rate-limited provider. A blank value was worse:
 * Number("") is 0, so ?lat=&lon= quietly analysed the sea off West Africa.
 *
 * Every case below must be refused with 400 before any provider is called.
 */

function stubFetch() {
  const fetchMock = vi.fn(async () => {
    throw new Error("a provider was called for an invalid coordinate");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function call(handler: ApiHandler, query: Record<string, string>) {
  const result = fakeReqRes(query);
  await handler(result.req, result.res);
  return result;
}

const POINT_ROUTES: Array<[string, ApiHandler, Record<string, string>]> = [
  ["gis", gis, {}],
  ["reverse-geocode", reverseGeocode, {}],
  ["weather", weather, {}],
  ["live air quality", live, { layer: "air-quality" }],
  ["population", population, {}],
  ["imagery", imagery, {}],
  ["site", site, {}],
  ["nearby", nearby, {}],
];

describe("routes refuse coordinates that are not on the globe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(POINT_ROUTES)("%s: latitude 500 is a 400, and no provider is asked", async (_name, handler, extra) => {
    const fetchMock = stubFetch();
    const result = await call(handler, { ...extra, lat: "500", lon: "78.47" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(POINT_ROUTES)("%s: longitude -181 is a 400", async (_name, handler, extra) => {
    const fetchMock = stubFetch();
    const result = await call(handler, { ...extra, lat: "17.38", lon: "-181" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(POINT_ROUTES)("%s: blank values are missing, not the point 0,0", async (_name, handler, extra) => {
    const fetchMock = stubFetch();
    const result = await call(handler, { ...extra, lat: "", lon: "" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route: an end point off the globe is a 400", async () => {
    const fetchMock = stubFetch();
    const result = await call(route, { fromLat: "17.44", fromLon: "78.38", toLat: "95", toLon: "78.43" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("route: a blank start is missing", async () => {
    const fetchMock = stubFetch();
    const result = await call(route, { fromLat: "", fromLon: "", toLat: "17.24", toLon: "78.43" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("buildings: a box that reaches past the pole is a 400", async () => {
    const fetchMock = stubFetch();
    const result = await call(buildings, { south: "89.99", west: "78.40", north: "90.01", east: "78.41" });
    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still accepts the extremes themselves", () => {
    const { req } = fakeReqRes({ lat: "-90", lon: "180" });
    expect(readLatLon(req)).toEqual({ ok: true, lat: -90, lon: 180 });
  });
});

describe("getNumberParam / readLatLon", () => {
  it("reads a plain number, with surrounding spaces", () => {
    const { req } = fakeReqRes({ lat: " 17.385 " });
    expect(getNumberParam(req, "lat")).toBe(17.385);
  });

  it("treats absent, blank and non-numeric values as missing", () => {
    const { req } = fakeReqRes({ blank: "   ", words: "north", inf: "Infinity" });
    expect(getNumberParam(req, "absent")).toBeNull();
    expect(getNumberParam(req, "blank")).toBeNull();
    expect(getNumberParam(req, "words")).toBeNull();
    expect(getNumberParam(req, "inf")).toBeNull();
  });

  it("a map click on a repeated copy of the world is wrapped before any request", () => {
    // New York clicked on the copy to the east, and Fiji just past 180:
    // the server refuses 286 and 181.5, so the map must send -74 and -178.5.
    expect(wrapLongitude(286)).toBeCloseTo(-74, 9);
    expect(wrapLongitude(181.5)).toBeCloseTo(-178.5, 9);
    expect(wrapLongitude(-181)).toBeCloseTo(179, 9);
    expect(wrapLongitude(-540)).toBe(-180);
    expect(wrapLongitude(78.47)).toBe(78.47);
    expect(wrapLongitude(180)).toBe(180);
  });

  it("says whether a pair is missing or out of range", () => {
    expect(readLatLon(fakeReqRes({ lat: "17" }).req)).toEqual({ ok: false, problem: "missing" });
    expect(readLatLon(fakeReqRes({ lat: "91", lon: "0" }).req)).toEqual({ ok: false, problem: "out_of_range" });
    expect(readLatLon(fakeReqRes({ fromLat: "1", fromLon: "2" }).req, "fromLat", "fromLon")).toEqual({ ok: true, lat: 1, lon: 2 });
  });
});
