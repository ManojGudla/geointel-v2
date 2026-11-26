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

/** The nodes of a page's @graph. */
function nodes(data: Record<string, unknown>): Array<Record<string, unknown>> {
  expect(data["@context"]).toBe("https://schema.org");
  return data["@graph"] as Array<Record<string, unknown>>;
}

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
      // One @graph per page; its WebPage node is the page itself.
      const webPage = nodes(route!.jsonLd!.data).find((n) => n["@type"] === "WebPage");
      expect(webPage, `${page.path} has no WebPage node`).toBeTruthy();
      expect(webPage!.url).toBe(`https://www.manowj.com${page.path}`);
      expect(sitemap, `${page.path} is not in the sitemap`).toContain(`<loc>https://www.manowj.com${page.path}</loc>`);
    }
  });

  it("answers real questions on every tool page and the area report, in the static HTML too", () => {
    for (const page of INFO_PAGES.filter((p) => p.group !== "Solutions")) {
      expect(page.faq, `${page.path} has no questions`).toBeTruthy();
      expect(page.faq!.items.length, page.path).toBeGreaterThanOrEqual(3);
      const body = routes.get(page.path)!.body;
      expect(body).toContain(`<h2>${page.faq!.heading}</h2>`);
      for (const { q, a } of page.faq!.items) {
        // Escaped the way the build step escapes it.
        const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        expect(body, `${page.path}: "${q}"`).toContain(`<h3>${esc(q)}</h3><p>${esc(a)}</p>`);
      }
    }
  });

  it("marks up exactly the questions and steps the page shows, and nothing else", () => {
    for (const page of INFO_PAGES) {
      const graph = nodes(routes.get(page.path)!.jsonLd!.data);

      const faq = graph.find((n) => n["@type"] === "FAQPage");
      if (page.faq) {
        const marked = (faq!.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>).map((m) => ({
          q: m.name,
          a: m.acceptedAnswer.text,
        }));
        expect(marked, page.path).toEqual(page.faq.items);
      } else {
        expect(faq, `${page.path} claims questions it does not show`).toBeUndefined();
      }

      const howTo = graph.find((n) => n["@type"] === "HowTo");
      const shown = page.sections.find((s) => s.steps && s.steps.length > 0);
      if (shown) {
        expect(howTo?.name, page.path).toBe(shown.heading);
        const steps = (howTo!.step as Array<{ position: number; text: string }>).map((s) => s.text);
        expect(steps, page.path).toEqual(shown.steps);
        expect((howTo!.step as Array<{ position: number }>).map((s) => s.position)).toEqual(shown.steps!.map((_, i) => i + 1));
      } else {
        expect(howTo, `${page.path} claims steps it does not show`).toBeUndefined();
      }
    }
  });

  it("points at the app's own entry in the homepage's structured data, by its type and id", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const app = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!) as Record<string, string>;
    for (const page of INFO_PAGES) {
      const webPage = nodes(routes.get(page.path)!.jsonLd!.data).find((n) => n["@type"] === "WebPage")!;
      expect(webPage.about).toMatchObject({ "@type": app["@type"], "@id": app["@id"] });
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

  it("uses the titles asked for in November 2026, trimmed only where a result would cut them", () => {
    const title = (p: string) => INFO_PAGES.find((page) => page.path === p)!.title;
    expect(title("/tools/satellite-history")).toBe("Free Historical Satellite Imagery & Capture Dates | maNOWj");
    expect(title("/tools/radius-search")).toBe("Free Map Radius Tool: Count Hospitals, Schools & Amenities");
    expect(title("/tools/measure-area")).toBe("Measure Land Area & Distance on Satellite Map | maNOWj");
    expect(title("/area-report")).toBe("Free Neighbourhood & Locality Report by Address | maNOWj");
  });

  it("describes the satellite history the app really has, not only NASA's", () => {
    // The page was written when the time slider was NASA's 250 m imagery
    // alone. The app has since gained sharp past versions (Esri Wayback); a
    // page that leaves them out undersells the feature, and one that calls
    // their dates capture dates would overstate it.
    const page = INFO_PAGES.find((p) => p.path === "/tools/satellite-history")!;
    const text = JSON.stringify(page);
    expect(text).toContain("Wayback");
    expect(text).toContain("since 2014");
    expect(page.limits.join(" ")).toMatch(/date Esri published it, not the date its photos were taken/);

    // The steps quote the app's own labels, so they have to still be the app's labels.
    const ui = fs.readFileSync(path.join(root, "src/features/timeline/TimelinePanel.tsx"), "utf8");
    const panel = fs.readFileSync(path.join(root, "src/features/shell/SidePanel.tsx"), "utf8");
    const steps = page.sections.find((s) => s.steps)!.steps!.join(" ");
    for (const label of ["Historical imagery", "Sharp, since 2014", "NASA daily, since 2012", "Blend with current map"]) {
      expect(steps, label).toContain(label);
      expect(ui, label).toContain(label);
    }
    expect(steps).toContain("Time travel");
    expect(panel).toContain(">Time travel<");
  });
});
