import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Social preview tags.
 *
 * These exist because the site had none: a link shared on WhatsApp, LinkedIn
 * or X rendered as a bare grey URL with no title, image or description. The
 * app already had a share button and shareable location URLs, so every share
 * was landing with nothing to click on — the single biggest hole in getting
 * anyone to visit.
 *
 * They're easy to lose in a refactor and produce no error when missing, so
 * they get a test.
 */
const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

const meta = (attr: "property" | "name", key: string): string | null => {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, "i");
  return html.match(re)?.[1] ?? null;
};

describe("social preview", () => {
  it("declares the tags a scraper needs to build a card", () => {
    for (const key of ["og:type", "og:url", "og:title", "og:description", "og:image", "og:site_name"]) {
      expect(meta("property", key), `missing ${key}`).toBeTruthy();
    }
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:image")).toBeTruthy();
  });

  it("uses an absolute image URL", () => {
    // Relative og:image paths are silently ignored by every major scraper —
    // the usual reason a card shows text but no picture.
    const image = meta("property", "og:image")!;
    expect(image.startsWith("https://")).toBe(true);
    expect(meta("name", "twitter:image")!.startsWith("https://")).toBe(true);
  });

  it("states the image dimensions, so the card renders before the image loads", () => {
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
  });

  it("gives the image alt text", () => {
    expect(meta("property", "og:image:alt")).toBeTruthy();
  });

  it("has a description that says what the product does, not what it is called", () => {
    const description = meta("property", "og:description")!;
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThan(200);
  });

  it("declares a canonical URL", () => {
    expect(/<link\s+rel="canonical"\s+href="https:\/\//.test(html)).toBe(true);
  });
});
