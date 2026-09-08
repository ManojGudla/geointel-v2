import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a search engine can actually read on the home page.
 *
 * This exists because of a real report: an SEO checker scored the site zero,
 * and the site did not appear in Google. The cause was not missing keywords —
 * search engines stopped reading the keywords meta tag well over a decade ago.
 * It was that the entire body of index.html was:
 *
 *   <div id="root"></div>
 *   <script src="/recovery.js" defer></script>
 *   <script type="module" src="/src/main.tsx"></script>
 *
 * Not one word. Every visible sentence on the site is produced by JavaScript
 * after load. Google's crawler does run JavaScript, but it does so on a second,
 * slower pass, and most other crawlers and audit tools do not run it at all —
 * so to them the page was blank, and a blank page cannot rank for anything.
 *
 * The fix is a static fallback inside #root that React replaces on mount, plus
 * a ld+json block describing the application. These tests keep both from being
 * quietly removed by a later edit, and — the part most likely to be forgotten —
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
   * It used to assert the opposite — that no keywords tag existed — on the
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
   * mistake — hence the tests below, which check the four places that
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
    expect(data["@type"]).toBe("WebApplication");
    expect(data.name).toBe("maNOWj GeoIntel");
    expect(data.url).toContain("www.manowj.com");
    expect(String(data.description).length).toBeGreaterThan(60);
    expect(data.isAccessibleForFree).toBe(true);
    expect(Array.isArray(data.featureList)).toBe(true);
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
    // disabled the whole blank-page recovery — the exact bug it exists to
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
 * Lighthouse reported "llms.txt does not follow recommendations — File is
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

  it("is served as itself rather than being swallowed by the SPA rewrite", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      rewrites: Array<{ source: string }>;
    };
    const rewrite = config.rewrites[0]!.source;
    expect(rewrite).toContain("llms\\.txt");

    // And prove it, by running the rewrite's own pattern against the path.
    // A file left out of the exclusion list matches, and matching means the
    // request is answered with index.html instead of the file.
    const pattern = new RegExp(`^${rewrite}$`);
    expect(pattern.test("/llms.txt"), "/llms.txt must NOT match the SPA rewrite").toBe(false);
    expect(pattern.test("/some-page"), "a normal route must still match").toBe(true);
  });

  it("describes the product rather than repeating its name", () => {
    for (const phrase of ["OpenStreetMap", "Manoj Kumar Gudla", "satellite"]) {
      expect(llms).toContain(phrase);
    }
  });
});
