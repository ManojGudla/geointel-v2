import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * How many widths this application reflows at.
 *
 * A stylesheet per component makes it very easy for each one to pick its own
 * breakpoint by eye. Do that thirty times and the app rearranges itself at a
 * dozen unrelated widths as you resize - which reads to a user as the layout
 * being unpredictable rather than designed, and to the next developer as
 * there being no rule to follow.
 *
 * There is a rule: 900px and 640px, documented in tokens.css, plus four
 * component-local exceptions that are listed by name below. This test is what
 * keeps that from being a comment nobody reads - a new value fails here, and
 * adding it means either using a canonical one or writing down why not.
 */

const SRC = join(process.cwd(), "src");

/** The two the whole application uses. */
const CANONICAL = new Set([900, 640]);

/**
 * Components whose own content, not the page, decides where they reflow.
 * Each is listed against the single value it is allowed to use.
 */
const EXCEPTIONS: Record<number, readonly string[]> = {
  // The printable report: a page width, not a screen width.
  720: ["features/report/AreaReport.css"],
  700: ["features/play/games/change/change.css"],
  // Square game boards run out of width earlier than a column of text does.
  560: [
    "features/play/components/Certificate.css",
    "features/play/games/cricket/Stadium.css",
    "features/play/games/sixty/SixtySeconds.css",
    "features/play/games/arcade/arcade.css",
    "features/site/SitePanel.css",
  ],
  520: ["features/play/games/cricket/DrsReview.css"],
};

function cssFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) cssFiles(full, found);
    else if (entry.endsWith(".css")) found.push(full);
  }
  return found;
}

/**
 * Only `@media` conditions - never the `max-width` layout property.
 *
 * Conflating the two is what made an earlier count of this claim twelve
 * breakpoints when the real number was six: `max-width: 760px` centring a
 * consent banner is a content constraint, and has nothing to do with when
 * the page reflows.
 */
function mediaWidths(css: string): number[] {
  const widths: number[] = [];
  for (const block of css.matchAll(/@media[^{]+/g)) {
    for (const condition of block[0].matchAll(/(?:max|min)-width:\s*(\d+)px/g)) {
      widths.push(Number(condition[1]));
    }
  }
  return widths;
}

describe("how many widths the layout reflows at", () => {
  const files = cssFiles(SRC).map((path) => ({
    path: relative(SRC, path).split(sep).join("/"),
    widths: mediaWidths(readFileSync(path, "utf8")),
  }));

  it("finds stylesheets to check at all", () => {
    // Guards the guard: a broken walk would make every assertion below pass
    // over an empty list.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.widths.length > 0)).toBe(true);
  });

  it("uses only the two canonical breakpoints, or a documented exception", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const width of file.widths) {
        if (CANONICAL.has(width)) continue;
        if (EXCEPTIONS[width]?.includes(file.path)) continue;
        offenders.push(`${file.path} reflows at ${width}px`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps every exception to a single component", () => {
    // An exception used by three files is not an exception, it is an
    // undocumented third breakpoint.
    for (const [width, paths] of Object.entries(EXCEPTIONS)) {
      if (width === "560") continue; // the shared game-board width, by design
      expect(paths.length, `${width}px`).toBe(1);
    }
  });

  it("does not accumulate exceptions", () => {
    const total = Object.values(EXCEPTIONS).flat().length;
    expect(total).toBeLessThanOrEqual(10);
  });

  it("agrees with the shell's TypeScript about where the sheet starts", async () => {
    /*
      900px is written in CSS twenty-nine times and in TypeScript twice -
      shellStore decides whether the panel starts open, useSheet decides
      whether it behaves as a sheet. If those drift there is a band of widths
      where the rail has moved to the bottom but the panel is still a column,
      which is the exact bug this number exists to prevent.
    */
    const { SHEET_MAX_WIDTH } = await import("../../src/features/shell/useSheet");
    expect(SHEET_MAX_WIDTH).toBe(900);
    expect(CANONICAL.has(SHEET_MAX_WIDTH)).toBe(true);

    const shellStore = readFileSync(join(SRC, "stores", "shellStore.ts"), "utf8");
    expect(shellStore).toMatch(/DESKTOP_MIN_WIDTH\s*=\s*900/);
  });
});
