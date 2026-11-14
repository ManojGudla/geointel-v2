import { describe, expect, it } from "vitest";
import { CITIES } from "../../src/data/cities";
import { cityAppPath, prerenderRoutes } from "../../src/seo/routeMeta";
import { encodeViewState } from "../../src/features/share/viewState";

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
