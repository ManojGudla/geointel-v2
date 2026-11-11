import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { INFO_PAGES } from "../../src/seo/infoPages";
import { INFO_PATHS } from "../../src/seo/infoPaths";
import { prerenderRoutes } from "../../src/seo/routeMeta";
import { decodeViewState } from "../../src/features/share/viewState";
import { parseMapCommand } from "../../src/features/ai/mapCommands";
import { CITIES } from "../../src/data/cities";

const root = path.resolve(__dirname, "../..");
const sitemap = fs.readFileSync(path.join(root, "public/sitemap.xml"), "utf8");
const routes = new Map(prerenderRoutes().map((r) => [r.path, r]));

describe("the written pages (area report, tools, solutions)", () => {
  it("has the same URLs in the shell's list as in the content", () => {
    // The shell decides 404-or-not from infoPaths.ts without loading the text.
    expect([...INFO_PATHS].sort()).toEqual(INFO_PAGES.map((p) => p.path).sort());
  });

  it("gives every page its own static HTML, structured data and sitemap entry", () => {
    for (const page of INFO_PAGES) {
      const route = routes.get(page.path);
      expect(route, `${page.path} is not prerendered`).toBeTruthy();
      expect(route!.meta.url).toBe(`https://www.manowj.com${page.path}`);
      expect(route!.body).toContain(`<h1>`);
      expect(route!.jsonLd?.data["@type"]).toBe("WebPage");
      expect(sitemap, `${page.path} is not in the sitemap`).toContain(`<loc>https://www.manowj.com${page.path}</loc>`);
    }
  });

  it("keeps titles and descriptions inside what a search result shows", () => {
    for (const page of INFO_PAGES) {
      expect(page.title.length, page.path).toBeLessThanOrEqual(60);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
      expect(page.description.length, page.path).toBeGreaterThan(90);
    }
  });

  it("has real content on every page, including what it cannot tell you", () => {
    for (const page of INFO_PAGES) {
      const words = routes.get(page.path)!.body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      expect(words, `${page.path} is thin`).toBeGreaterThan(250);
      expect(page.limits.length, `${page.path} states no limits`).toBeGreaterThan(0);
      expect(page.examples.length, `${page.path} has nothing to try`).toBeGreaterThan(0);
    }
  });

  it("only links to pages that exist", () => {
    const known = new Set<string>([...INFO_PATHS, ...routes.keys()]);
    for (const page of INFO_PAGES) {
      for (const related of page.related) expect(known.has(related), `${page.path} links to missing ${related}`).toBe(true);
    }
  });

  it("only uses example links the app can actually open", () => {
    const citySlugs = new Set(CITIES.map((c) => c.slug));
    for (const page of INFO_PAGES) {
      for (const example of page.examples) {
        if (example.href.startsWith("/compare/")) {
          const [a, b] = example.href.slice("/compare/".length).split("-vs-");
          expect(citySlugs.has(a!) && citySlugs.has(b!), example.href).toBe(true);
          continue;
        }
        expect(example.href.startsWith("/?"), example.href).toBe(true);
        const view = decodeViewState(example.href.slice(1));
        expect(view, `${example.href} does not decode`).not.toBeNull();
        // A question in a link must be one the app answers itself on arrival.
        if (view!.question) expect(parseMapCommand(view!.question), `"${view!.question}" is not a map command`).not.toBeNull();
      }
    }
  });

  it("does not use long dashes in its text", () => {
    for (const page of INFO_PAGES) expect(JSON.stringify(page)).not.toMatch(/[—–]/);
  });
});
