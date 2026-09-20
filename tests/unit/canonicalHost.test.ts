import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every public URL the site publishes about itself must name the SAME host,
 * and it must be the host the site actually serves from.
 *
 * This is checked because the site had it wrong. It serves from
 * www.manowj.com - that is what the browser reports as the page's origin, and
 * the address Search Console was verified against - but index.html's canonical
 * link, the Open Graph url and image, the sitemap's entries and robots.txt all
 * named the bare manowj.com. None of those are cosmetic:
 *
 *   - A sitemap whose URLs are outside the verified property is rejected by
 *     Search Console, so nothing gets submitted.
 *   - A canonical pointing at a different host tells Google to index that
 *     host instead - the one that may not answer.
 *   - An og:image on a host that doesn't resolve is why a shared link shows
 *     a title with no picture.
 *
 * Each of those fails silently. Nothing in the app breaks; the site is simply
 * invisible or unshareable, which is much harder to notice.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const SOURCES = {
  "index.html": read("index.html"),
  "public/sitemap.xml": read("public/sitemap.xml"),
  "public/robots.txt": read("public/robots.txt"),
};

/** The host the site is actually served from. */
const CANONICAL_HOST = "www.manowj.com";

/** Every absolute URL naming this project's domain, wherever it appears. */
function projectUrls(text: string): string[] {
  return text.match(/https?:\/\/[a-z0-9.-]*manowj\.com[^\s"'<)]*/gi) ?? [];
}

describe("public URLs", () => {
  it("all use the host the site is actually served from", () => {
    const wrong: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const url of projectUrls(text)) {
        if (new URL(url).host !== CANONICAL_HOST) wrong.push(`${file}: ${url}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("never derives a canonical URL from the host that served the page", () => {
    /*
      The runtime half of the same rule, and the half that was missing.

      The checks above read static files. But the canonical tag on a city page
      is set at runtime by usePageMeta, and CityPage used to build the URL from
      `window.location.origin`. This app answers on at least two hosts -
      www.manowj.com and the manowj-geointel.vercel.app address Vercel keeps
      live - so a crawler reaching a city page on the second one was told that
      the vercel.app URL was the canonical version of it. Two hosts then
      compete as duplicates of each other on precisely the pages this site is
      trying to rank.

      Naming the single preferred host is the whole job of rel=canonical.
      Deriving it from wherever the request happened to land defeats it.
    */
    const pages = ["src/features/city/CityPage.tsx", "src/features/compare/ComparePage.tsx"];
    for (const path of pages) {
      const source = read(path)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        /*
          Line comments, but not the "//" in a URL. A naive /\/\/.*$/ turns
          `url: "https://www.manowj.com/"` into `url: "https:` and then this
          test reports that the file never names the canonical host - which is
          exactly what it did on the first run.
        */
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(source, `${path} derives its canonical from the current origin`).not.toMatch(/window\.location\.origin/);
      expect(source, `${path} does not name the canonical host`).toContain(`https://${CANONICAL_HOST}`);
    }
  });

  it("actually found URLs to check", () => {
    // Otherwise the test above passes on an empty list - and this rule only
    // matters because these URLs exist.
    const total = Object.values(SOURCES).reduce((n, t) => n + projectUrls(t).length, 0);
    expect(total).toBeGreaterThanOrEqual(6);
  });

  it("declares the canonical link and the sitemap's own address", () => {
    expect(SOURCES["index.html"]).toContain(`<link rel="canonical" href="https://${CANONICAL_HOST}/" />`);
    expect(SOURCES["public/robots.txt"]).toContain(`Sitemap: https://${CANONICAL_HOST}/sitemap.xml`);
  });

  it("keeps og:image absolute, which is the only form scrapers accept", () => {
    // A relative og:image is silently ignored by every scraper - the card
    // then renders as text with an empty space where the picture should be.
    const og = /<meta property="og:image" content="([^"]+)"/.exec(SOURCES["index.html"])?.[1];
    expect(og).toBeDefined();
    expect(og!.startsWith(`https://${CANONICAL_HOST}/`)).toBe(true);
  });
});
