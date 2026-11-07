import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prerenderRoutes } from "@/seo/routeMeta";
import { CITIES } from "@/data/cities";

/**
 * Guards how URLs are answered now that there is no catch-all rewrite.
 *
 * History, because each step was a live problem on manowj.com:
 *  1. The rewrite was `/((?!api/).*)`, so a missing asset hash came back as
 *     index.html with HTTP 200 and the site rendered blank (the browser
 *     refuses HTML as a script or stylesheet, and the service worker cached
 *     it). Assets were excluded from the rewrite.
 *  2. Every other URL still got index.html, so /maps/*, /compare/* and made-up
 *     URLs all returned the homepage's HTML with HTTP 200: the homepage's
 *     canonical on every page, and "soft 404s" for URLs that do not exist.
 *  3. Now every app URL is a real file written at build time
 *     (plugins/vite-plugin-prerender.ts), and the rewrite is gone. A URL with
 *     no file gets dist/404.html with a real 404 status.
 *
 * If a catch-all rewrite comes back, these tests say what it would break.
 */

const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  rewrites?: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

/** Vercel source patterns are anchored regexes. */
function rewrites(pathname: string): boolean {
  return (config.rewrites ?? []).some((r) => new RegExp(`^${r.source}$`).test(pathname));
}

const prerendered = new Set(prerenderRoutes().map((r) => r.path));

describe("URL handling without a catch-all rewrite", () => {
  it("has a real file for every URL the app renders", () => {
    // "/" is index.html itself. Everything else App.tsx recognises must have
    // its own prerendered file, or it would now 404.
    for (const p of ["/ai-map-search", "/status", "/admin", "/privacy"]) expect(prerendered.has(p), p).toBe(true);
    for (const c of CITIES) expect(prerendered.has(`/maps/${c.slug}`), c.slug).toBe(true);
    for (const a of CITIES)
      for (const b of CITIES) if (a.slug !== b.slug) expect(prerendered.has(`/compare/${a.slug}-vs-${b.slug}`)).toBe(true);
  });

  it("lets unknown URLs fall through to a real 404", () => {
    for (const p of ["/some/deep/route", "/maps/atlantis", "/compare/hyderabad-vs-hyderabad", "/google-maps-comparison"]) {
      expect(rewrites(p), p).toBe(false);
      expect(prerendered.has(p), p).toBe(false);
    }
  });

  it("never answers an asset, a crawler file or the API with HTML", () => {
    for (const p of [
      "/assets/index-Bu0wYZql.css", // the stale hash that caused the blank-page outage
      "/assets/PlayHub-2MZ30-Gh.js",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/og-image-v3.jpg",
      "/icons/icon-192.png",
      "/googleb676b63b365dcfba.html",
      "/sw.js",
      "/recovery.js",
      "/manifest.json",
      "/api/geocode",
      "/api/ai/copilot",
    ]) {
      expect(rewrites(p), p).toBe(false);
    }
  });
});

describe("security headers", () => {
  const all = config.headers.flatMap((h) => h.headers);
  const value = (key: string) => all.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? "";

  it("keeps the headers the privacy page claims are set", () => {
    // privacyFacts.ts tells users these are in place, citing vercel.json.
    // If one is removed, that page becomes a false claim.
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(value("Content-Security-Policy")).toContain("object-src 'none'");
  });

  it("does not allow arbitrary third-party scripts", () => {
    const csp = value("Content-Security-Policy");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src *");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
