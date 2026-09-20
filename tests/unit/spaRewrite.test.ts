import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the vercel.json SPA rewrite.
 *
 * This test exists because of a live outage on manowj.com. The rewrite was
 * `/((?!api/).*)` - everything except /api/ - which meant a request for an
 * asset hash that no longer existed returned index.html with HTTP 200 and
 * content-type text/html. The browser refuses HTML as a stylesheet or a
 * module, so the site rendered a completely blank page, and the service
 * worker cached that HTML under the asset's URL, making it permanent.
 *
 * A missing asset must 404. That is diagnosable and self-healing; a 200 of
 * the wrong content type is neither. If someone widens this rewrite again,
 * these tests fail before it ships.
 */

const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

/** Vercel source patterns are anchored regexes. */
function rewrites(pathname: string): boolean {
  return config.rewrites.some((r) => new RegExp(`^${r.source}$`).test(pathname));
}

describe("SPA rewrite", () => {
  it("sends real app routes to index.html", () => {
    for (const p of ["/", "/status", "/admin", "/some/deep/route"]) {
      expect(rewrites(p)).toBe(true);
    }
  });

  it("does NOT swallow build assets - a missing one must 404", () => {
    for (const p of [
      "/assets/index-CQOnuD4P.js",
      "/assets/index-D6-G6fe5.css",
      "/assets/PlayHub-2MZ30-Gh.js",
      "/assets/index-Bu0wYZql.css", // the stale hash that caused the outage
    ]) {
      expect(rewrites(p)).toBe(false);
    }
  });

  it("does not swallow the files crawlers and social scrapers fetch", () => {
    // A rewrite that answers /og-image.png with index.html gives every
    // scraper an HTML page where an image should be - the link preview then
    // renders with no picture and nothing explains why. Same for robots and
    // the sitemap: Google would read HTML as a directives file.
    for (const p of ["/robots.txt", "/sitemap.xml", "/og-image.jpg", "/icons/icon-192.png"]) {
      expect(rewrites(p)).toBe(false);
    }
  });

  it("does not swallow a search-engine verification file", () => {
    // Google Search Console fetches /google<hash>.html and expects the exact
    // one line that file contains. Answered with index.html it reads as a
    // wrong file, verification fails, and the reason is invisible - the URL
    // returns HTTP 200, so nothing looks broken. Vercel serves real static
    // files ahead of rewrites anyway; this makes that independent of ordering.
    expect(rewrites("/googleb676b63b365dcfba.html")).toBe(false);
    // The pattern must cover any such file, not only today's one.
    expect(rewrites("/google0123456789abcdef.html")).toBe(false);
    // ...without becoming a hole for ordinary app routes that start "google".
    expect(rewrites("/google-maps-comparison")).toBe(true);
  });

  it("does not swallow the service worker or the manifest", () => {
    // A rewritten sw.js would serve index.html as the worker script, which
    // fails registration and silently kills installability.
    expect(rewrites("/sw.js")).toBe(false);
    expect(rewrites("/manifest.json")).toBe(false);
  });

  it("does not swallow API calls", () => {
    for (const p of ["/api/geocode", "/api/route", "/api/ai/copilot"]) {
      expect(rewrites(p)).toBe(false);
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
