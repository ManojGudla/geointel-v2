import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a search engine can actually read on the home page.
 *
 * This exists because of a real report: an SEO checker scored the site zero,
 * and the site did not appear in Google. The cause was not missing keywords -
 * search engines stopped reading the keywords meta tag well over a decade ago.
 * It was that the entire body of index.html was:
 *
 *   <div id="root"></div>
 *   <script src="/recovery.js" defer></script>
 *   <script type="module" src="/src/main.tsx"></script>
 *
 * Not one word. Every visible sentence on the site is produced by JavaScript
 * after load. Google's crawler does run JavaScript, but it does so on a second,
 * slower pass, and most other crawlers and audit tools do not run it at all -
 * so to them the page was blank, and a blank page cannot rank for anything.
 *
 * The fix is a static fallback inside #root that React replaces on mount, plus
 * a ld+json block describing the application. These tests keep both from being
 * quietly removed by a later edit, and - the part most likely to be forgotten -
 * keep the fallback from breaking the blank-page recovery guard.
 */

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const recovery = readFileSync(join(root, "public", "recovery.js"), "utf8");

/** Visible words only: strip comments, scripts, styles and tags. */
function readableText(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the home page's title and description", () => {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/&amp;/g, "&");
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? "";

  it("leads with the name and what it is, short enough to show in full", () => {
    expect(title).toBe("maNOWj GeoIntel: Free AI Map, Area Report & GIS Explorer");
    // A result shows about 60 characters of a title before cutting it.
    expect(title!.length).toBeLessThanOrEqual(60);
  });

  it("is 150 to 160 characters and names the five things people search for", () => {
    expect(description.length).toBeGreaterThanOrEqual(150);
    expect(description.length).toBeLessThanOrEqual(160);
    for (const phrase of ["free ai map", "gis explorer", "area report", "radius search", "satellite history"]) {
      expect(description.toLowerCase()).toContain(phrase);
    }
  });

  it("uses no long dashes, like the rest of the site's copy", () => {
    expect(`${title} ${description}`).not.toMatch(/[—–]/);
  });
});

/**
 * "The map itself needs JavaScript, so please enable it to use the app."
 *
 * Google was quoting that sentence as the text under the search result: it
 * sat in a plain paragraph of the static page, where it was the only line
 * addressed to nobody in particular. It is now in <noscript> (never shown by a
 * browser that runs JavaScript) and inside a data-nosnippet element (never
 * quoted by Google even from the raw HTML).
 */
describe("the JavaScript notice", () => {
  const SENTENCE = "The map itself needs JavaScript";

  // Comments explain the change and quote the sentence; only markup counts.
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");

  it("is only in a noscript block, inside an element Google will not quote", () => {
    const noscript = markup.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1] ?? "";
    expect(noscript).toContain(SENTENCE);
    // data-nosnippet is honoured on span, div and section only.
    expect(noscript).toMatch(/<(span|section|div) data-nosnippet>[^<]*The map itself needs JavaScript/);
    expect(markup.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "")).not.toContain(SENTENCE);
  });

  it("stays inside the static block, which must contain no div elements for the build step", () => {
    // plugins/vite-plugin-prerender.ts replaces #prerender up to its first
    // closing div tag, and throws if the block contains another div. The raw
    // file is checked, comments included, because that is what it reads.
    const open = '<div id="prerender" class="prerender">';
    const start = html.indexOf(open);
    const inner = html.slice(start + open.length, html.indexOf("</div>", start));
    expect(inner).not.toContain("<div");
    expect(inner.replace(/<!--[\s\S]*?-->/g, "")).toContain(SENTENCE);
  });
});

describe("the home page has content without JavaScript", () => {
  const text = readableText(html);

  it("says enough for a crawler to understand the page", () => {
    // The old page scored zero here. A hundred words is a low bar and still
    // far more than "nothing".
    expect(text.split(" ").length).toBeGreaterThan(120);
  });

  it("has exactly one h1, and it names the product", () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
    expect(h1).toHaveLength(1);
    expect(h1[0]).toContain("maNOWj GeoIntel");
  });

  it("describes what the app actually does, not just what it is called", () => {
    // A page that only repeats its own name ranks for its own name and
    // nothing else. These are the things people would search for.
    for (const phrase of ["hospitals", "weather", "population", "satellite", "directions"]) {
      expect(text.toLowerCase()).toContain(phrase);
    }
  });

  it("names its data sources in the static text", () => {
    // The product's whole claim is that answers are sourced. That claim
    // should be readable by something that cannot run the app.
    for (const source of ["OpenStreetMap", "Open-Meteo", "Wikidata", "Esri"]) {
      expect(text).toContain(source);
    }
  });

  /**
   * The keywords tag, and why this test changed its mind.
   *
   * It used to assert the opposite - that no keywords tag existed - on the
   * grounds that search engines have ignored it for well over a decade and
   * that having one "would imply the site does something about SEO that it
   * does not."
   *
   * The first half of that is still true and the tag is still worthless for
   * ranking. The second half is what stopped being true: the page now has a
   * real description, structured data, a sitemap, and several hundred words of
   * crawlable text, and Google's own PageSpeed audit scores its SEO 100/100.
   * There is no longer a false impression for the tag to create.
   *
   * So it stays, because it was asked for and it costs nothing. What must not
   * happen is the name living ONLY in that tag, which would be a real
   * mistake - hence the tests below, which check the four places that
   * actually do the work.
   */
  it("keeps the keywords tag honest about being decorative", () => {
    const keywords = html.match(/<meta\s+name=["']keywords["'][^>]*>/i);
    if (!keywords) return; // Fine to remove; nothing depends on it.
    // If it is present, the comment explaining that it does nothing must be
    // present too, so nobody later mistakes it for working SEO.
    expect(html).toMatch(/ignored <meta name="keywords"> since 2009|has ignored <meta name="keywords">/i);
  });
});

/**
 * The author's name.
 *
 * Asked for directly, and worth testing because the obvious way to do it is
 * also the useless way: putting "Gudla" in a keywords tag and nowhere else
 * would satisfy a glance at the source and do nothing whatsoever for anybody
 * searching the name.
 *
 * These four are the places that actually carry it.
 */
describe("the site says who built it", () => {
  const FULL_NAME = "Manoj Kumar Gudla";
  const text = readableText(html);

  it("names the author in a meta tag built for the purpose", () => {
    expect(html).toMatch(new RegExp(`<meta\\s+name=["']author["']\\s+content=["']${FULL_NAME}["']`, "i"));
  });

  it("names the author in the structured data, where Google reads entities", () => {
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ld).not.toBeNull();
    const data = JSON.parse(ld![1]!) as { author?: { name?: string; "@type"?: string } };
    expect(data.author?.["@type"]).toBe("Person");
    expect(data.author?.name).toBe(FULL_NAME);
  });

  it("says it in words a person can read on the page", () => {
    // The one that genuinely makes a name findable. A search engine indexes
    // visible text; it does not rank a keywords tag.
    expect(text).toContain(FULL_NAME);
  });

  it("says it in the description, which is what shows in search results", () => {
    // Matched on double quotes only. An earlier version of this pattern used
    // ["'] on both sides, which stopped dead at the apostrophe in "What's
    // here?" and reported the tag as missing the name when it was there.
    const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    expect(description?.[1]).toContain(FULL_NAME);
  });
});

describe("structured data", () => {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];

  it("is present and is valid JSON", () => {
    expect(block).toBeDefined();
    expect(() => JSON.parse(block!)).not.toThrow();
  });

  it("describes this application, with its name and its free price", () => {
    const data = JSON.parse(block!) as Record<string, unknown>;
    expect(data["@context"]).toBe("https://schema.org");
    // SoftwareApplication / UtilitiesApplication / "Web", as asked for in
    // November 2026 (it was a WebApplication filed under business software).
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.applicationCategory).toBe("UtilitiesApplication");
    expect(data.operatingSystem).toBe("Web");
    expect(data.name).toBe("maNOWj GeoIntel");
    expect(data.url).toContain("www.manowj.com");
    expect(String(data.description).length).toBeGreaterThan(60);
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers).toMatchObject({ "@type": "Offer", price: "0", priceCurrency: "INR" });
    expect(Array.isArray(data.featureList)).toBe(true);
  });

  it("uses only properties its type has", () => {
    // browserRequirements is defined on WebApplication alone; on a
    // SoftwareApplication the same fact belongs in softwareRequirements.
    const data = JSON.parse(block!) as Record<string, unknown>;
    expect(data).not.toHaveProperty("browserRequirements");
    expect(String(data.softwareRequirements)).toMatch(/JavaScript/);
  });

  it("claims no ratings or reviews, because the site has none to show", () => {
    // Google's software-app rich result wants one of these. Making them up
    // would break its rules and be untrue, so they stay absent until real
    // reviews exist.
    const data = JSON.parse(block!) as Record<string, unknown>;
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("review");
  });

  it("lists the brand's other spellings so a search for the name finds it", () => {
    const data = JSON.parse(block!) as { alternateName?: string[] };
    const names = (data.alternateName ?? []).map((n) => n.toLowerCase());
    expect(names).toContain("manowj");
  });
});

describe("the recovery guard still works with content in #root", () => {
  it("knows the static fallback is not a mounted app", () => {
    // The trap: the old guard asked whether #root had any children. The
    // fallback made that permanently false, which would have silently
    // disabled the whole blank-page recovery - the exact bug it exists to
    // catch, reintroduced by the fix for a different one.
    expect(recovery).toContain("prerender");
    expect(html).toContain('id="prerender"');
  });

  it("still treats a genuinely empty root as blank", () => {
    expect(recovery).toContain("root.children.length === 0");
  });
});

/**
 * llms.txt, and the trap it fell into.
 *
 * Lighthouse reported "llms.txt does not follow recommendations - File is
 * missing a required H1 header". That wording is the giveaway: it did not say
 * the file was absent, it said the file's CONTENT was wrong. There was no
 * llms.txt at all. The request for it fell through to the SPA rewrite and came
 * back as index.html, so the audit fetched a perfectly good HTML page, looked
 * for a Markdown "# Title" in it, and failed.
 *
 * This is exactly the failure that silently killed the blank-page recovery
 * guard: a file that is not in the rewrite's exclusion list does not 404, it
 * quietly becomes the app. Both halves are tested here, because the file
 * existing is useless if the server never serves it.
 */
describe("llms.txt", () => {
  const llms = readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8");

  it("starts with an H1, which is the thing the audit actually checks", () => {
    expect(llms.trimStart().startsWith("# ")).toBe(true);
    expect(llms).toMatch(/^#\s+maNOWj GeoIntel/m);
  });

  it("is served as itself rather than being swallowed by a rewrite", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      rewrites?: Array<{ source: string }>;
    };
    // Run every rewrite's own pattern against the path: matching would mean
    // the request is answered with index.html instead of the file.
    const swallowed = (config.rewrites ?? []).some((r) => new RegExp(`^${r.source}$`).test("/llms.txt"));
    expect(swallowed, "/llms.txt must not match any rewrite").toBe(false);
  });

  it("describes the product rather than repeating its name", () => {
    for (const phrase of ["OpenStreetMap", "Manoj Kumar Gudla", "satellite"]) {
      expect(llms).toContain(phrase);
    }
  });

  it("lists every page that has its own address", async () => {
    // It once said its list was "the whole set of crawlable paths" while
    // naming eight of twelve cities and none of the tool pages.
    const { CITIES } = await import("../../src/data/cities");
    const { INFO_PAGES } = await import("../../src/seo/infoPages");
    for (const c of CITIES) expect(llms, c.slug).toContain(`(https://www.manowj.com/maps/${c.slug})`);
    for (const p of INFO_PAGES) expect(llms, p.path).toContain(`(https://www.manowj.com${p.path})`);
    expect(llms).toContain("(https://www.manowj.com/ai-map-search)");
  });
});
