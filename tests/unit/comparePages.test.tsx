import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  canonicalPairSlug,
  distanceKm,
  FEATURED_PAIR_PATHS,
  parsePairSlug,
} from "../../src/features/compare/comparePairs";
import { CITY_BY_SLUG } from "../../src/data/cities";

/**
 * "Hyderabad vs Bangalore" is a real, high-volume search, and it is one this
 * application can answer better than a listicle can - every figure is live and
 * dated rather than copied out of a blog post in 2019.
 *
 * Two things can quietly destroy that, and both are tested here.
 *
 * The first is duplicate content. A comparison has no natural order, people
 * link to both spellings, and two URLs with identical content compete with each
 * other and usually leave a crawler ranking neither.
 *
 * The second is invention. A table is the most authoritative-looking format
 * there is, and an empty cell in one is almost unbearable - the pull to fill it
 * so the row "works" is exactly how a page ends up stating something false
 * about a real city.
 */

vi.mock("../../src/services/intel", () => ({ fetchNearby: vi.fn(async () => []) }));
vi.mock("../../src/services/live", () => ({ fetchAirQuality: vi.fn(async () => ({ europeanAqi: null })) }));
vi.mock("../../src/services/apiClient", () => ({
  apiGet: vi.fn(async () => ({ population: null })),
  ApiUnavailableError: class extends Error {},
}));

afterEach(cleanup);

describe("parsing a comparison URL", () => {
  it("accepts a real pair in either order", () => {
    expect(parsePairSlug("hyderabad-vs-bengaluru")?.a.name).toBe("Hyderabad");
    expect(parsePairSlug("bengaluru-vs-hyderabad")?.a.name).toBe("Bengaluru");
  });

  it("gives both orderings the SAME canonical", () => {
    /*
      The whole point. Without this the two URLs split whatever authority the
      page earns, and a crawler resolving the duplicate on its own usually
      resolves it by ranking neither.
    */
    const one = parsePairSlug("hyderabad-vs-bengaluru")!;
    const two = parsePairSlug("bengaluru-vs-hyderabad")!;
    expect(one.canonicalSlug).toBe(two.canonicalSlug);
    expect(one.canonicalSlug).toBe("bengaluru-vs-hyderabad");
  });

  it("still shows the cities in the order the visitor asked for", () => {
    // Canonicalising the URL must not reorder the page. Somebody who followed
    // "hyderabad-vs-bengaluru" should see Hyderabad in the first column.
    expect(parsePairSlug("hyderabad-vs-bengaluru")!.a.slug).toBe("hyderabad");
    expect(parsePairSlug("bengaluru-vs-hyderabad")!.a.slug).toBe("bengaluru");
  });

  it("refuses anything that is not two real, different cities", () => {
    expect(parsePairSlug("hyderabad-vs-atlantis")).toBeNull();
    expect(parsePairSlug("atlantis-vs-hyderabad")).toBeNull();
    expect(parsePairSlug("hyderabad-vs-hyderabad")).toBeNull();
    expect(parsePairSlug("hyderabad")).toBeNull();
    expect(parsePairSlug("a-vs-b-vs-c")).toBeNull();
    expect(parsePairSlug("")).toBeNull();
  });

  it("sorts consistently whichever way it is called", () => {
    expect(canonicalPairSlug("mumbai", "delhi")).toBe(canonicalPairSlug("delhi", "mumbai"));
  });
});

describe("the distance between two cities", () => {
  it("is computed, and close to the real great-circle distance", () => {
    // Hyderabad to Bengaluru is about 500 km in a straight line. A transposed
    // lat/lon or a degrees/radians slip shows up here immediately.
    const d = distanceKm(CITY_BY_SLUG.get("hyderabad")!, CITY_BY_SLUG.get("bengaluru")!);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(550);
  });

  it("is symmetric and zero for the same point", () => {
    const h = CITY_BY_SLUG.get("hyderabad")!;
    const m = CITY_BY_SLUG.get("mumbai")!;
    expect(distanceKm(h, m)).toBe(distanceKm(m, h));
    expect(distanceKm(h, h)).toBe(0);
  });
});

describe("the sitemap", () => {
  const sitemap = readFileSync(join(process.cwd(), "public", "sitemap.xml"), "utf8");

  it("lists every featured pair", () => {
    for (const path of FEATURED_PAIR_PATHS) {
      expect(sitemap, path).toContain(`https://www.manowj.com${path}`);
    }
  });

  it("lists each pair once, in its canonical ordering only", () => {
    // Listing both orderings would advertise the duplicate this design exists
    // to avoid.
    const locs = [...sitemap.matchAll(/<loc>[^<]*\/compare\/([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(new Set(locs).size).toBe(locs.length);
    for (const slug of locs) {
      const pair = parsePairSlug(slug)!;
      expect(pair.canonicalSlug, slug).toBe(slug);
    }
  });

  it("advertises only a small fraction of the possible pairs", () => {
    /*
      The number of pairs grows as the square of the number of cities, so a
      fixed cap goes stale the moment a city is added. What must stay true is
      the ratio: the sitemap promotes the handful of comparisons people
      actually search, not the combinatorial set.
    */
    const cityCount = CITY_BY_SLUG.size;
    const possiblePairs = (cityCount * (cityCount - 1)) / 2;
    const locs = [...sitemap.matchAll(/\/compare\//g)];

    expect(locs.length).toBeLessThan(possiblePairs / 4);
    // And an absolute ceiling, so this cannot be satisfied by adding cities.
    expect(locs.length).toBeLessThanOrEqual(12);
  });
});

describe("a rendered comparison", () => {
  function renderPair(slug: string) {
    const pair = parsePairSlug(slug)!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return import("../../src/features/compare/ComparePage").then(({ ComparePage }) =>
      render(
        <QueryClientProvider client={client}>
          <ComparePage pair={pair} />
        </QueryClientProvider>
      )
    );
  }

  it("declares the canonical URL, not the one that was requested", async () => {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = "https://www.manowj.com/";
    document.head.appendChild(link);

    const view = await renderPair("hyderabad-vs-bengaluru");
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      "https://www.manowj.com/compare/bengaluru-vs-hyderabad"
    );
    view.unmount();
    link.remove();
  });

  it("says a figure is not published rather than showing a zero", async () => {
    /*
      With every source mocked empty, no cell may contain a number. "Hyderabad
      0, Bengaluru 4,300,000" read as a fact is a straightforwardly false claim
      about a real place, and a table is the format most likely to be believed.
    */
    await renderPair("mumbai-vs-delhi");
    expect(screen.getAllByText("Not published").length).toBeGreaterThan(4);
    expect(document.querySelector(".cmp__table")?.textContent).not.toMatch(/\b0\b/);
  });

  it("states the distance between the two cities", async () => {
    await renderPair("hyderabad-vs-bengaluru");
    expect(document.body.textContent).toMatch(/\d+ km/);
  });

  it("links to both city pages, so the set stays crawlable", async () => {
    await renderPair("mumbai-vs-pune");
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/maps/mumbai");
    expect(hrefs).toContain("/maps/pune");
  });

  it("emits structured data naming both cities, and removes it again", async () => {
    const view = await renderPair("bengaluru-vs-chennai");
    const el = document.querySelector('script[data-schema-id="compare-bengaluru-vs-chennai"]');
    expect(el).not.toBeNull();
    const schema = JSON.parse(el!.textContent!);
    expect(schema.about).toHaveLength(2);
    expect(schema.about.map((c: { name: string }) => c.name).sort()).toEqual(["Bengaluru", "Chennai"]);

    view.unmount();
    expect(document.querySelector('script[data-schema-id="compare-bengaluru-vs-chennai"]')).toBeNull();
  });

  it("puts the table in its own scroll container", async () => {
    // The only element on this site allowed to scroll sideways. Three columns
    // of figures cannot fit 360px without truncating a number, and the page
    // body must never scroll instead.
    await renderPair("hyderabad-vs-chennai");
    expect(document.querySelector(".cmp__scroll")).not.toBeNull();
    expect(document.querySelector(".cmp__scroll .cmp__table")).not.toBeNull();
  });
});
