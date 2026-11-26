import { describe, expect, it } from "vitest";
import { CITIES } from "../../src/data/cities";
import { appViewPath, cityAppPath, cityToolLinks, formatCityCentre, prerenderRoutes } from "../../src/seo/routeMeta";
import { decodeViewState, encodeViewState } from "../../src/features/share/viewState";
import { parseMapCommand } from "../../src/features/ai/mapCommands";
import { INFO_PATHS } from "../../src/seo/infoPaths";

/**
 * The static copy of each city page (what search engines and anyone without
 * JavaScript read) sent "Open Hyderabad" to the bare homepage, and listed the
 * example questions as plain text. Both now open the city on the map, with
 * the same links the page itself uses once it loads.
 */

describe("static city page links", () => {
  it("match the app's own link format for every city, with and without a question", () => {
    for (const city of CITIES) {
      for (const question of [undefined, city.questions[0]]) {
        expect(cityAppPath(city, question)).toBe(`/?${encodeViewState({ lat: city.lat, lon: city.lon, zoom: city.zoom, question }, { zoom: 12 })}`);
      }
    }
  });

  it("open the city instead of the bare homepage, and link the example questions", () => {
    const route = prerenderRoutes().find((r) => r.path === "/maps/hyderabad");
    expect(route).toBeTruthy();
    const body = route!.body;
    expect(body).not.toContain('<a href="/">Open');
    const hyd = CITIES.find((c) => c.slug === "hyderabad")!;
    expect(body).toContain(`href="${cityAppPath(hyd).replace(/&/g, "&amp;")}">Open Hyderabad on the map`);
    for (const q of hyd.questions) expect(body).toContain(`>${q}</a></li>`);
  });
});

describe("the tools on a city page", () => {
  it("are written in the app's own link format, whatever they carry", () => {
    const views = [
      { lat: 17.385, lon: 78.4867, zoom: 15, radiusMeters: 1000, tab: "evidence" as const },
      { lat: 17.385, lon: 78.4867, zoom: 13, question: "hospitals within 5 km" },
      { lat: 12.9716, lon: 77.5946, zoom: 11.5, basemap: "satellite" as const, section: "layers" as const },
      { lat: 19.076, lon: 72.8777, zoom: 12, section: "tools" as const },
    ];
    for (const view of views) expect(appViewPath(view)).toBe(`/?${encodeViewState(view, { zoom: 12 })}`);
  });

  it("open the city with the tool already running, and point to the page that explains it", () => {
    for (const city of CITIES) {
      const tools = cityToolLinks(city);
      expect(tools).toHaveLength(4);
      for (const tool of tools) {
        const view = decodeViewState(tool.href.slice(1));
        expect(view, tool.href).not.toBeNull();
        expect(view!.lat).toBeCloseTo(city.lat, 4);
        expect(view!.lon).toBeCloseTo(city.lon, 4);
        // A question in a link must be one the app answers itself on arrival.
        if (view!.question) expect(parseMapCommand(view!.question), view!.question).not.toBeNull();
        expect(INFO_PATHS.includes(tool.guide), tool.guide).toBe(true);
        expect(tool.label).toContain(city.name);
      }
      expect(new Set(tools.map((t) => t.guide))).toEqual(
        new Set(["/area-report", "/tools/radius-search", "/tools/satellite-history", "/tools/measure-area"])
      );
    }
  });

  it("are in the static HTML with the city's coordinates, and no figure that would go out of date", () => {
    const routes = new Map(prerenderRoutes().map((r) => [r.path, r]));
    for (const city of CITIES) {
      const body = routes.get(`/maps/${city.slug}`)!.body;
      expect(body).toContain(`City centre: ${formatCityCentre(city)} (WGS 84)`);
      for (const tool of cityToolLinks(city)) expect(body).toContain(`<a href="${tool.href.replace(/&/g, "&amp;")}">${tool.label}</a>`);
      // Population, area, air quality and height are live on the page, never baked in here.
      expect(body).not.toMatch(/population of \d|\d+ m above sea level/i);
    }
    expect(formatCityCentre({ lat: 17.385, lon: 78.4867 })).toBe("17.3850° N, 78.4867° E");
  });
});
