import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderRoute } from "../../plugins/vite-plugin-prerender";
import { prerenderRoutes, cityMeta, SITE_ORIGIN } from "@/seo/routeMeta";
import { CITIES } from "@/data/cities";

const root = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "public/sitemap.xml"), "utf8");
const routes = prerenderRoutes();
const byPath = new Map(routes.map((r) => [r.path, r]));

function head(html: string) {
  return {
    title: html.match(/<title>([^<]*)<\/title>/)?.[1],
    canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
    ogUrl: html.match(/<meta property="og:url" content="([^"]+)"/)?.[1],
    robots: html.match(/<meta name="robots" content="([^"]+)"/)?.[1],
    h1: html.match(/<h1>([^<]*)<\/h1>/)?.[1],
  };
}

describe("per-page HTML written at build time", () => {
  it("gives every sitemap URL its own canonical, not the homepage's", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).filter((u) => u !== `${SITE_ORIGIN}/`);
    expect(locs.length).toBeGreaterThan(10);
    for (const loc of locs) {
      const route = byPath.get(new URL(loc).pathname);
      expect(route, `no prerendered page for ${loc}`).toBeTruthy();
      const h = head(renderRoute(indexHtml, route!));
      expect(h.canonical).toBe(loc);
      expect(h.ogUrl).toBe(loc);
      expect(h.title).not.toBe("maNOWj GeoIntel");
    }
  });

  it("writes the city's own title, heading and text", () => {
    const city = CITIES[0]!;
    const html = renderRoute(indexHtml, byPath.get(`/maps/${city.slug}`)!);
    const h = head(html);
    expect(h.title).toBe(cityMeta(city).title.replace(/&/g, "&amp;"));
    expect(h.h1).toContain(city.name);
    expect(html).toContain(city.landmarks[0]!);
    // Still the same app: the entry script and root element survive.
    expect(html).toContain('<div id="root">');
    expect(html).toContain('id="prerender"');
  });

  it("points both orderings of a comparison at the alphabetical URL", () => {
    const forward = head(renderRoute(indexHtml, byPath.get("/compare/hyderabad-vs-bengaluru")!));
    const backward = head(renderRoute(indexHtml, byPath.get("/compare/bengaluru-vs-hyderabad")!));
    expect(forward.canonical).toBe(`${SITE_ORIGIN}/compare/bengaluru-vs-hyderabad`);
    expect(backward.canonical).toBe(forward.canonical);
  });

  it("keeps /admin out of search results", () => {
    expect(head(renderRoute(indexHtml, byPath.get("/admin")!)).robots).toBe("noindex, nofollow");
    expect(head(renderRoute(indexHtml, byPath.get("/maps/hyderabad")!)).robots).toContain("index, follow");
  });

  it("escapes text that reaches the HTML", () => {
    const html = renderRoute(indexHtml, {
      path: "/x",
      meta: { title: 'A "quoted" <title>', description: "a & b", url: "https://www.manowj.com/x" },
      body: "<h1>x</h1>",
    });
    expect(html).toContain("<title>A &quot;quoted&quot; &lt;title&gt;</title>");
    expect(html).toContain('content="a &amp; b"');
  });

  it("has no duplicate paths", () => {
    expect(byPath.size).toBe(routes.length);
  });
});
