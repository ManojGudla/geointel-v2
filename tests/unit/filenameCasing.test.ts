import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { extname, basename, join } from "node:path";

/**
 * No two modules in the same folder may have names that differ only in case.
 *
 * This test exists because of a build that passed on Linux and failed on
 * Windows. `src/features/surprise/` held both:
 *
 *   SurpriseTeaser.tsx   the component
 *   surpriseTeaser.ts    the date/window logic
 *
 * On a case-SENSITIVE filesystem those are two unrelated files and everything
 * resolves correctly. On Windows and macOS, where the filesystem is
 * case-INSENSITIVE, TypeScript resolving `@/features/surprise/SurpriseTeaser`
 * tries the `.ts` extension first, matches `surpriseTeaser.ts`, and imports
 * the logic module where the component was meant:
 *
 *   TS2305: Module '"@/features/surprise/SurpriseTeaser"' has no exported
 *           member 'SurpriseTeaser'.
 *   TS1261: Already included file name '...SurpriseTeaser.ts' differs from
 *           file name '...surpriseTeaser.ts' only in casing.
 *
 * The build container these tests usually run in is Linux, so it can never
 * reproduce that failure by compiling — which is exactly why the rule is
 * checked as data here rather than left to the compiler. It reads the
 * directory listing, so it holds on any platform.
 *
 * The fix in that case was to rename the logic module to teaserRules.ts.
 * Anything that reads clearly and doesn't collide is fine; sharing a name with
 * a component and relying on the extension to tell them apart is not.
 */

const ROOTS = ["src", "api", "plugins", "tests"];
const MODULE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Every module file under a root, walked without following node_modules. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (MODULE_EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

describe("module filenames", () => {
  it("never differ only in case within a folder", () => {
    const byFoldedName = new Map<string, Set<string>>();

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const stem = basename(file, extname(file));
        // Folder + case-folded name is the identity a case-insensitive
        // filesystem actually uses when resolving an import.
        const key = `${file.slice(0, file.length - basename(file).length).toLowerCase()}|${stem.toLowerCase()}`;
        const seen = byFoldedName.get(key) ?? new Set<string>();
        seen.add(stem);
        byFoldedName.set(key, seen);
      }
    }

    const collisions = [...byFoldedName.entries()]
      .filter(([, stems]) => stems.size > 1)
      .map(([key, stems]) => `${key.split("|")[0]} → ${[...stems].join(" vs ")}`);

    // Names the offending pair directly, so the failure is actionable rather
    // than just "something is wrong somewhere".
    expect(collisions).toEqual([]);
  });

  it("actually scanned the source tree", () => {
    // Without this the test above would pass on an empty walk — a silent
    // false green is worse than no test, and this is a rule nothing else
    // enforces.
    const count = ROOTS.reduce((n, root) => n + walk(root).length, 0);
    expect(count).toBeGreaterThan(100);
  });
});
