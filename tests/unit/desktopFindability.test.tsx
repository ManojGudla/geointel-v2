import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { Header } from "../../src/components/Header";

/**
 * "People are saying while using this website they are unable to find the
 * option and how it works."
 *
 * That complaint has been made about the desktop build more than once, and
 * the causes turned out to be measurable rather than matters of taste. Two of
 * them are guarded here.
 *
 * The first is that the panel hid most of itself. Measured in Chromium at
 * 1440x900, the Layers section was 1877px of content in a 695px window with a
 * scrollbar exactly 0px wide — both macOS and current Windows use overlay
 * scrollbars that are invisible until something scrolls, so the panel looked
 * like it simply ended, and two thirds of it was unreachable by anyone who
 * did not think to try.
 *
 * The second is that the page's own explanation of itself was behind a "⋯"
 * overflow menu. Someone who cannot work out what an app does is the least
 * likely person in the world to go looking in its overflow menu.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the panel admits that it scrolls", () => {
  const css = stripComments(read("src", "features", "shell", "SidePanel.css"));

  it("reserves space for a scrollbar at all times", () => {
    // Measured 0px wide before this. Reserved rather than conditional, so it
    // is a standing fact about the panel and content never shifts sideways
    // the moment a section grows long enough to need one.
    expect(css).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("draws the scrollbar explicitly, for the browsers that ignore the standard property", () => {
    expect(css).toMatch(/\.side-panel__body::-webkit-scrollbar\s*\{/);
    expect(css).toMatch(/\.side-panel__body::-webkit-scrollbar-thumb\s*\{/);
  });

  it("shows a soft edge wherever there is more content", () => {
    /*
      Four background layers: two `local` covers that scroll away with the
      content, and two `scroll` radials pinned to this box. That combination
      is what makes the shadow appear only at an end that has more beyond it
      and vanish when you reach it — no JS, no scroll listener.
    */
    const body = css.match(/\.side-panel__body\s*\{[^}]*\}/s)?.[0] ?? "";
    expect((body.match(/gradient\(/g) ?? []).length).toBe(4);
    // Matched against the attachment keyword in context rather than the bare
    // word: `--scroll-shade` is named three times in this same rule, and a
    // loose /\bscroll\b/ counts those too.
    expect((body.match(/no-repeat local/g) ?? []).length).toBe(2);
    expect((body.match(/no-repeat scroll/g) ?? []).length).toBe(2);
  });

  it("tints the shadow from the text colour so it reads in both themes", () => {
    // A hard-coded black haze is invisible on the dark surface.
    expect(css).toMatch(/--scroll-shade:\s*color-mix\([^)]*var\(--color-text\)/);
  });
});

describe("the layer panel's controls", () => {
  const css = stripComments(read("src", "features", "gis", "GISLayerManager.css"));

  it("declares the opacity rule exactly once", () => {
    /*
      It was declared twice, with conflicting gap, padding and border. The
      later block silently won on everything it named, so half of the first
      one never applied — the kind of dead CSS that makes a stylesheet lie
      about what it does.
    */
    const declarations = css.match(/^\.layer-manager__opacity\s*\{/gm) ?? [];
    expect(declarations.length).toBe(1);
  });

  it("stops the opacity slider overflowing the panel", () => {
    // Measured: scrollWidth 325 against clientWidth 323, from the range
    // input's non-zero default margins.
    const rule = css.match(/\.layer-manager__opacity input\[type="range"\]\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(rule).toMatch(/margin:\s*0/);
    expect(rule).toMatch(/box-sizing:\s*border-box/);
  });

  it("makes the whole row the target, not the 16px box", () => {
    // Twenty-one controls here measured under 32px tall. Growing the label
    // fixes the aim without making the panel look like a toy.
    expect(css).toMatch(/\.layer-manager__list label\s*\{[^}]*min-height:\s*32px/s);
    expect(css).toMatch(/\.layer-manager__reset\s*\{[^}]*min-height:\s*32px/s);
    // And the full touch size once this panel is a sheet under the thumb.
    expect(css).toMatch(/max-width:\s*900px[^@]*\.layer-manager__list label\s*\{[^}]*min-height:\s*44px/s);
  });
});

describe("the header", () => {
  beforeEach(() => {
    // useBackendStatus pings /api/health on mount.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("puts 'How it works' where someone lost can see it", async () => {
    render(<Header />);
    const button = await screen.findByRole("button", { name: /how it works/i });
    expect(button).not.toBeNull();
  });

  it("does not hide the explanation inside the overflow menu", () => {
    /*
      The regression. Tidying the header by folding this back into "More" is
      exactly the change someone would make on aesthetic grounds, and it is
      the thing the complaint was about.
    */
    const source = read("src", "components", "Header.tsx");
    const menu = source.match(/app-header__more-menu[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(menu).not.toMatch(/openHelp/);
  });

  it("still keeps the secondary items behind the menu", () => {
    // Promoting help must not turn into promoting everything, which is the
    // flat row of six equal buttons this header was built to avoid.
    const source = read("src", "components", "Header.tsx");
    const menu = source.match(/app-header__more-menu[\s\S]*?<\/div>/)?.[0] ?? "";
    for (const action of ["openSettings", "openFeedback", "openFeatureStatus"]) {
      expect(menu, action).toMatch(new RegExp(action));
    }
  });
});

describe("the document head", () => {
  const html = read("index.html");

  it("tells crawlers they may show a large image and a full snippet", () => {
    // Absent, the default is already index,follow — the value is in the
    // three limits, which decide what a result is allowed to look like.
    expect(html).toMatch(/name="robots"/);
    expect(html).toMatch(/max-image-preview:large/);
    expect(html).toMatch(/max-snippet:-1/);
  });

  it("stops iOS turning coordinates into phone numbers", () => {
    // "17.3850, 78.4867" and "250 m" are exactly the shapes Safari's
    // detector looks for, on a page made of little else.
    expect(html).toMatch(/name="format-detection"\s+content="telephone=no"/);
  });

  it("labels the social card image for both networks", () => {
    expect(html).toMatch(/property="og:image:alt"/);
    expect(html).toMatch(/name="twitter:image:alt"/);
  });

  it("keeps the canonical absolute and on the www host", () => {
    // Relative canonicals and a bare apex are both ways to lose the page.
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/www\.manowj\.com\//);
  });
});
