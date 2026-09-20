import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One feature, one name - enforced.
 *
 * The question feature shipped under four different names at once: "Ask
 * Copilot" on the floating button, "maNOWj GeoIntel Copilot" on the panel it
 * opened, "Open Copilot" on the button in the side panel, and "Copilot &
 * AI Agents" in the help guide. A user who pressed the first one had no way
 * to know they had already found the third.
 *
 * Worse, a SECOND feature - the plain-language spatial query that draws its
 * answer on the map - was called "Ask the map", sitting directly above the
 * assistant in the same panel. Two boxes, two names starting with "Ask",
 * doing different things.
 *
 * The names are now:
 *   "Ask maNOWj"            - the assistant. Answers in words.
 *   "Find things on the map" - the spatial query. Draws the answer.
 *
 * This test reads the real source and fails if either drifts. It only looks
 * at strings that can actually reach a user's eyes - JSX text, a handful of
 * attributes, and the object keys the app renders labels from - so the
 * internal names (`useCopilotContext`, `.copilot-panel`, `openCopilot`) are
 * deliberately untouched and stay that way. Renaming those buys nothing
 * anyone can see and would break persisted state, exactly as sections.ts
 * already argues about its own section IDs.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(entry) ? [full] : [];
  });
}

/** Strips comments, so a comment explaining the old name doesn't fail the test. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

interface Found {
  file: string;
  text: string;
}

/**
 * Pulls out the strings a user can read.
 *
 * Three sources, and nothing else: text sitting between JSX tags, the
 * attributes that are read aloud or shown on hover, and the object keys this
 * app renders labels from (sections.ts, featureStatus.ts, the command
 * palette, the help guide's tab list).
 */
function userFacingStrings(): Found[] {
  const out: Found[] = [];
  for (const file of sourceFiles(SRC)) {
    const code = stripComments(readFileSync(file, "utf8"));
    const short = file.slice(SRC.length + 1);

    /**
     * JSX text nodes: `>text</`.
     *
     * Three guards, each for a false positive this actually produced. Braces
     * are excluded so `>{value}<` - an expression, not a literal - is skipped
     * rather than half-matched. The lookbehind drops `=>`, which otherwise let
     * an arrow function's body run on until the next tag and swallowed whole
     * lines of code. And the match must END at a closing tag, which is what
     * separates real text from the gap between a generic type parameter and
     * some unrelated `<` further down.
     */
    for (const m of code.matchAll(/(?<!=)>([^<>{}]{1,400}?)<\//g)) {
      const text = m[1]!;
      // Prose does not contain semicolons-as-terminators or assignments.
      if (/[;=]/.test(text) || !/[A-Za-z]/.test(text)) continue;
      out.push({ file: short, text });
    }

    for (const m of code.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]*)"/g)) {
      out.push({ file: short, text: m[1]! });
    }

    for (const m of code.matchAll(/\b(?:label|title|hint|body|category|note|name)\s*[:=]\s*"([^"]*)"/g)) {
      out.push({ file: short, text: m[1]! });
    }
  }
  return out;
}

describe("the question feature has exactly one name", () => {
  const strings = userFacingStrings();

  it("reads enough of the source to be a real check", () => {
    // Guards the extraction itself. If a refactor broke the regexes above,
    // every assertion below would pass vacuously, which is worse than no test.
    expect(strings.length).toBeGreaterThan(400);
    expect(strings.some((s) => s.text.includes("Ask maNOWj"))).toBe(true);
  });

  it("never shows the word Copilot to a user", () => {
    const leaks = strings.filter((s) => /copilot/i.test(s.text));
    expect(leaks.map((s) => `${s.file}: ${s.text.trim()}`)).toEqual([]);
  });

  it("does not call the spatial query 'Ask the map' any more", () => {
    // The name that collided with the assistant. It reads fine on its own,
    // which is why it survived so long - the problem only appears when both
    // names are on screen together, as they are in the Ask panel.
    const leaks = strings.filter((s) => /ask the map/i.test(s.text));
    expect(leaks.map((s) => `${s.file}: ${s.text.trim()}`)).toEqual([]);
  });

  it("spells the brand maNOWj every time it appears in a label", () => {
    // "Manowj", "MaNowj" and "manowj" have all appeared in drafts. A brand
    // spelled three ways reads as three products. URLs are exempt because a
    // domain is genuinely lowercase.
    const wrong: string[] = [];
    for (const { file, text } of strings) {
      if (text.includes("://") || text.includes(".com")) continue;
      for (const m of text.matchAll(/\b[Mm][Aa][Nn][Oo][Ww][Jj]\b/g)) {
        if (m[0] !== "maNOWj") wrong.push(`${file}: "${m[0]}" in ${text.trim()}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("the rail says what each section is for", () => {
  it("has no section labelled with a bare category noun", () => {
    // "Intelligence" told a first-time visitor nothing about what was behind
    // it. Rail labels name an action or a thing, not a department.
    const vague = ["Intelligence", "Analytics", "Insights", "Platform", "Solutions"];
    const sections = readFileSync(join(SRC, "features/shell/sections.ts"), "utf8");
    const labels = [...stripComments(sections).matchAll(/label:\s*"([^"]*)"/g)].map((m) => m[1]!);
    expect(labels.length).toBe(5);
    expect(labels.filter((l) => vague.includes(l))).toEqual([]);
  });
});
