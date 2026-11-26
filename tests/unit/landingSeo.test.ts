import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LANDING_META, LANDING_SCHEMA_ID, landingSchema, prerenderRoutes } from "../../src/seo/routeMeta";
import { LANDING_FAQ, LANDING_FAQ_HEADING } from "../../src/seo/landingContent";
import { renderRoute } from "../../plugins/vite-plugin-prerender";

/**
 * /ai-map-search, the AI map search page.
 *
 * Its six questions and answers used to exist only inside the React page, so
 * the static HTML the build writes for it (what anything without JavaScript
 * reads) had none, and their FAQPage structured data appeared only after the
 * app loaded. They now come from one list for all three.
 */

const root = path.resolve(__dirname, "../..");
const route = prerenderRoutes().find((r) => r.path === "/ai-map-search")!;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("the AI map search page", () => {
  it("has the title asked for, short enough to show in full", () => {
    expect(LANDING_META.title).toBe("AI Map Search: Ask Questions About Any Location | maNOWj");
    expect(LANDING_META.title.length).toBeLessThanOrEqual(60);
    expect(LANDING_META.description.length).toBeLessThanOrEqual(160);
    expect(`${LANDING_META.title} ${LANDING_META.description}`).not.toMatch(/[—–]/);
  });

  it("leads its heading with the phrase people search for, in the static HTML and the page", () => {
    expect(route.body).toContain("<h1>AI map search with sources</h1>");
    const page = fs.readFileSync(path.join(root, "src/features/landing/LandingPage.tsx"), "utf8");
    const h1 = page.match(/<h1 className="ln-h1">([\s\S]*?)<\/h1>/)![1]!.replace(/<br \/>/g, " ").replace(/\s+/g, " ").trim();
    expect(h1).toBe("AI map search with sources.");
  });

  it("shows every question and answer in the static HTML", () => {
    expect(route.body).toContain(`<h2>${esc(LANDING_FAQ_HEADING)}</h2>`);
    for (const { q, a } of LANDING_FAQ) expect(route.body).toContain(`<h3>${esc(q)}</h3><p>${esc(a)}</p>`);
  });

  it("marks up exactly those questions, in its own block rather than the homepage's", () => {
    expect(route.jsonLd?.id).toBe(LANDING_SCHEMA_ID);
    const graph = (landingSchema()["@graph"] as Array<Record<string, unknown>>) ?? [];
    expect(graph.find((n) => n["@type"] === "WebPage")?.url).toBe(LANDING_META.url);
    const faq = graph.find((n) => n["@type"] === "FAQPage")!;
    const marked = (faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>).map((m) => ({
      q: m.name,
      a: m.acceptedAnswer.text,
    }));
    expect(marked).toEqual(LANDING_FAQ);

    // In the built file, the page's block replaces the homepage's
    // SoftwareApplication block, under the id the page adopts on load.
    const html = renderRoute(fs.readFileSync(path.join(root, "index.html"), "utf8"), route);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]![0]).toContain(`data-schema-id="${LANDING_SCHEMA_ID}"`);
    expect(blocks[0]![1]).toContain('"FAQPage"');
  });

  it("renders its FAQ section from the shared list, not a copy of it", () => {
    const page = fs.readFileSync(path.join(root, "src/features/landing/LandingPage.tsx"), "utf8");
    expect(page).toContain('from "@/seo/landingContent"');
    expect(page).toContain("{LANDING_FAQ_HEADING}");
    // No second, hand-kept list of the same answers.
    expect(page).not.toMatch(/const FAQ = \[/);
    for (const { a } of LANDING_FAQ) expect(page).not.toContain(a);
  });
});
