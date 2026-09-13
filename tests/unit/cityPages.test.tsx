import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CITIES, CITY_BY_SLUG, CITY_PATHS } from "../../src/data/cities";
import { FEATURED_PAIR_PATHS } from "../../src/features/compare/comparePairs";

/**
 * These pages exist for one reason: before them, the site had two indexable
 * URLs, so somebody searching "hospitals near Hyderabad" had no way to find
 * this application without already knowing the brand — which for a new product
 * means no way in at all.
 *
 * The risk in fixing that is the fix being worse than the problem. Generated
 * pages that differ only in a name are what search engines have spent fifteen
 * years learning to discount, and they pull down the pages that would otherwise
 * have ranked. So the tests that matter here are not "does it render" — they
 * are the ones that keep these pages honest and distinct.
 */

vi.mock("../../src/services/intel", () => ({ fetchNearby: vi.fn(async () => []) }));
vi.mock("../../src/services/live", () => ({ fetchAirQuality: vi.fn(async () => ({ europeanAqi: null })) }));
vi.mock("../../src/services/apiClient", () => ({
  apiGet: vi.fn(async () => ({ population: null })),
  ApiUnavailableError: class extends Error {},
}));

afterEach(cleanup);

describe("the city data itself", () => {
  it("carries no numbers at all", () => {
    /*
      The rule this whole feature rests on.

      A hardcoded population is wrong the day it ships and gets more wrong every
      year, silently, inside a page whose job is to look authoritative. This
      app's entire claim is that every answer shows where it came from and when.
      So no figure lives in the data file: population, area and air quality are
      all fetched live with their source attached.

      This test reads the source rather than the parsed objects, because the
      point is that nobody can add "population: 10847000" later without the
      suite objecting.
    */
    const source = readFileSync(join(process.cwd(), "src", "data", "cities.ts"), "utf8");
    const body = source.slice(source.indexOf("export const CITIES"));
    // Coordinates and zoom are the only numbers allowed, and they are named.
    const numericFields = [...body.matchAll(/^\s{4}(\w+):\s*-?\d/gm)].map((m) => m[1]);
    expect([...new Set(numericFields)].sort()).toEqual(["lat", "lon", "zoom"]);
  });

  it("gives every city its own hand-written geography", () => {
    // Eight paragraphs that differ only in a name would be a doorway page
    // whatever the values are.
    const texts = CITIES.map((c) => c.geography);
    expect(new Set(texts).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(c.geography.length).toBeGreaterThan(180);
      expect(c.landmarks.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("only offers questions the parser can actually run", async () => {
    /*
      The worst possible SEO page is one that ranks and then disappoints. Every
      prompt listed on a city page opens the map and runs — so each one is
      checked against the real parser, not a list of nice-sounding strings.
    */
    const { parseMapCommand } = await import("../../src/features/ai/mapCommands");
    for (const city of CITIES) {
      for (const q of city.questions) {
        expect(parseMapCommand(q), `${city.name}: "${q}"`).toBeTruthy();
      }
    }
  });

  it("has plausible coordinates inside India", () => {
    // A transposed lat/lon would put a city in the ocean and nobody would
    // notice until a page was live.
    for (const c of CITIES) {
      expect(c.lat, c.name).toBeGreaterThan(6);
      expect(c.lat, c.name).toBeLessThan(36);
      expect(c.lon, c.name).toBeGreaterThan(68);
      expect(c.lon, c.name).toBeLessThan(98);
    }
  });

  it("has unique slugs that match the paths and the lookup", () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
    expect(CITY_PATHS).toEqual(CITIES.map((c) => `/maps/${c.slug}`));
    for (const c of CITIES) expect(CITY_BY_SLUG.get(c.slug)).toBe(c);
  });
});

describe("the sitemap and the routes agree", () => {
  const sitemap = readFileSync(join(process.cwd(), "public", "sitemap.xml"), "utf8");

  it("lists every city page", () => {
    for (const c of CITIES) {
      expect(sitemap, c.slug).toContain(`https://www.manowj.com/maps/${c.slug}`);
    }
  });

  it("lists nothing that is not a real page", () => {
    // A sitemap entry for a URL that 404s or that disowns itself via canonical
    // is a contradiction a crawler resolves by trusting neither.
    const locs = [...sitemap.matchAll(/<loc>https:\/\/www\.manowj\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1]!);
    // Comparison pages were added after this test and it failed, which is the
    // whole reason it exists: a URL reaches the sitemap only once somebody has
    // stated, here, that it is a real page.
    const known = new Set(["/", "/ai-map-search", ...CITY_PATHS, ...FEATURED_PAIR_PATHS]);
    for (const loc of locs) expect(known.has(loc), loc).toBe(true);
  });

  it("gives every entry a lastmod", () => {
    const locs = sitemap.match(/<loc>/g) ?? [];
    const mods = sitemap.match(/<lastmod>/g) ?? [];
    expect(mods.length).toBe(locs.length);
  });
});

describe("a rendered city page", () => {
  function renderCity(slug: string) {
    const city = CITY_BY_SLUG.get(slug)!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return import("../../src/features/city/CityPage").then(({ CityPage }) =>
      render(
        <QueryClientProvider client={client}>
          <CityPage city={city} />
        </QueryClientProvider>
      )
    );
  }

  it("claims its own canonical URL rather than the home page's", async () => {
    /*
      The single tag that decides whether any of this works.

      index.html hard-codes rel=canonical to "/". Left alone on a city page it
      tells Google this page is a duplicate of the home page, which is grounds
      for dropping it from the index entirely. A page that disowns itself cannot
      rank no matter how good it is.
    */
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = "https://www.manowj.com/";
    document.head.appendChild(link);

    const view = await renderCity("hyderabad");
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      "http://localhost:3000/maps/hyderabad"
    );

    // And it must hand the tag back, or navigating away leaves the whole app
    // claiming to be Hyderabad.
    view.unmount();
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://www.manowj.com/");
    link.remove();
  });

  it("sets a title that leads with the place, not the brand", async () => {
    // Nobody searches for a brand they have never heard of. That is the whole
    // premise of building these pages.
    await renderCity("bengaluru");
    expect(document.title.startsWith("Bengaluru")).toBe(true);
  });

  it("emits structured data describing a city, and removes it again", async () => {
    const view = await renderCity("mumbai");
    const el = document.querySelector('script[data-schema-id="city-mumbai"]');
    expect(el).not.toBeNull();
    const schema = JSON.parse(el!.textContent!);
    expect(schema["@type"]).toBe("WebPage");
    expect(schema.about["@type"]).toBe("City");
    expect(schema.about.name).toBe("Mumbai");
    expect(schema.breadcrumb.itemListElement).toHaveLength(2);

    // Two pages' schemas on one document give a crawler contradictory claims.
    view.unmount();
    expect(document.querySelector('script[data-schema-id="city-mumbai"]')).toBeNull();
  });

  it("never claims an FAQ it does not display", async () => {
    /*
      FAQPage schema needs the questions AND their answers visible on the page.
      These prompts run a live query — the answer does not exist until somebody
      clicks — so marking them up as an FAQ would be a structured-data claim the
      page cannot back, which earns a manual action rather than a rich result.
    */
    await renderCity("delhi");
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? "");
    expect(schemas.some((s) => s.includes("FAQPage"))).toBe(false);
  });

  it("shows no figure without saying where it came from", async () => {
    await renderCity("chennai");
    // With every source mocked as empty, the page must say so rather than
    // showing a zero. "0 hospitals in Chennai" is a wrong answer someone could
    // act on; "not published" is an honest one.
    expect(screen.getAllByText(/Not published|Unavailable/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("OpenStreetMap");
  });

  it("links to every other city, so the set is crawlable from any one of them", async () => {
    await renderCity("pune");
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    for (const c of CITIES.filter((c) => c.slug !== "pune")) {
      expect(hrefs, c.slug).toContain(`/maps/${c.slug}`);
    }
  });
});
