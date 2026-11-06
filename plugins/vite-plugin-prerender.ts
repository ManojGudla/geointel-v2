import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { prerenderRoutes, type PrerenderRoute } from "../src/seo/routeMeta";

/**
 * Writes one HTML file per page URL into the build output, each a copy of
 * index.html with that page's own title, description, canonical URL, social
 * tags and readable text. See src/seo/routeMeta.ts for why.
 *
 * Output: dist/maps/hyderabad/index.html and so on. Vercel serves a static
 * file before it applies vercel.json's rewrites, so these take over from the
 * single index.html for their URLs with no configuration change; any other
 * URL still falls through to index.html exactly as before.
 *
 * The app itself is unchanged: the same script tags load and the same React
 * tree mounts and replaces the #prerender block, as it already did on "/".
 */

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setAttr(html: string, pattern: RegExp, value: string, label: string): string {
  if (!pattern.test(html)) throw new Error(`[prerender] index.html has no ${label} to replace`);
  return html.replace(pattern, (_m, before: string, after: string) => `${before}${esc(value)}${after}`);
}

/** Pure: index.html in, one route's HTML out. Exported for tests. */
export function renderRoute(html: string, route: PrerenderRoute): string {
  const { meta } = route;
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  out = setAttr(out, /(<meta name="description" content=")[^"]*(")/, meta.description, "meta description");
  out = setAttr(out, /(<link rel="canonical" href=")[^"]*(")/, meta.url, "canonical link");
  out = setAttr(out, /(<meta property="og:url" content=")[^"]*(")/, meta.url, "og:url");
  out = setAttr(out, /(<meta property="og:title" content=")[^"]*(")/, meta.title, "og:title");
  out = setAttr(out, /(<meta property="og:description" content=")[^"]*(")/, meta.description, "og:description");
  out = setAttr(out, /(<meta name="twitter:title" content=")[^"]*(")/, meta.title, "twitter:title");
  out = setAttr(out, /(<meta name="twitter:description" content=")[^"]*(")/, meta.description, "twitter:description");
  if (route.robots) out = setAttr(out, /(<meta name="robots" content=")[^"]*(")/, route.robots, "robots meta");

  const block = /(<div id="prerender" class="prerender">)([\s\S]*?)(<\/div>)/;
  const match = out.match(block);
  if (!match) throw new Error("[prerender] index.html has no #prerender block");
  // The replacement relies on the block containing no nested <div>.
  if (match[2]!.includes("<div")) throw new Error("[prerender] #prerender block must not contain nested <div> elements");
  out = out.replace(block, (_m, open: string, _inner: string, close: string) => `${open}\n${route.body}\n${close}`);
  return out;
}

export default function prerenderPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "geointel-prerender",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const html = fs.readFileSync(indexPath, "utf8");
      const routes = prerenderRoutes();
      for (const route of routes) {
        const file = path.join(outDir, route.path.replace(/^\//, ""), "index.html");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, renderRoute(html, route));
      }
      // For a future vercel.json change that lets unknown URLs return a real
      // 404 status instead of 200 (see SEO_AUDIT.md). Harmless until then.
      fs.writeFileSync(
        path.join(outDir, "404.html"),
        renderRoute(html, {
          path: "/404",
          meta: { title: "Page not found | maNOWj GeoIntel", description: "This page does not exist.", url: "https://www.manowj.com/" },
          robots: "noindex, follow",
          body: `<h1>Page not found</h1><p><a href="/">Open the map</a></p>`,
        })
      );
      console.log(`[prerender] wrote ${routes.length} pages + 404.html`);
    },
  };
}
