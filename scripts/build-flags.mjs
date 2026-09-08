/**
 * Generates public/flags/*.png — the flag images every game uses.
 *
 * Run with `npm run flags`. That installs the flag-icons SVG set without
 * saving it to package.json, renders each flag this project needs, and leaves
 * the PNGs behind. The source package is a build-time input only; nothing in
 * the shipped app imports it.
 *
 * WHY THIS EXISTS AT ALL. The games used flag EMOJI, built from two Regional
 * Indicator Symbols and left to the font to compose. Windows ships no flag
 * glyphs, so every flag rendered as its two ISO letters, and the Flag Quiz
 * printed "KZ" directly above "Which country's flag is this?". A year of
 * passing tests never caught it, because the emoji strings were correct — the
 * font was the problem.
 *
 * WHY PNG AND NOT SVG. The SVGs are real path data and the ones with a coat of
 * arms are enormous: Serbia 175 KB, Bolivia 98 KB, Mexico 82 KB. SVGO removes
 * almost nothing because there is nothing redundant in them. A player on a
 * phone would wait on a 175 KB download to see one flag. Rendered at 320px the
 * same flags are a median of 4 KB, and 320 is more than twice the largest size
 * any screen shows them at, so they stay sharp on a 2x display.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "node_modules/flag-icons/flags/4x3";
const OUT = "public/flags";
const WIDTH = 320;
const HEIGHT = 240;

if (!existsSync(SOURCE)) {
  console.error(
    `Cannot find ${SOURCE}.\n\nRun this through "npm run flags", which installs the source set first.`
  );
  process.exit(1);
}

// The single source of truth for which flags are needed: the country list the
// games actually deal from. Parsed rather than imported so this script has no
// TypeScript toolchain dependency.
const world = readFileSync("src/features/play/data/world.ts", "utf8");
const codes = [...new Set([...world.matchAll(/code: "([A-Z]{2})"/g)].map((m) => m[1]))];
if (codes.length < 50) {
  console.error(`Only found ${codes.length} country codes in world.ts — that looks wrong. Stopping.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

const missing = [];
let total = 0;
for (const code of codes) {
  const svgPath = join(SOURCE, `${code.toLowerCase()}.svg`);
  if (!existsSync(svgPath)) {
    missing.push(code);
    continue;
  }
  const svg = readFileSync(svgPath, "utf8");
  // Inlined rather than loaded by URL so nothing depends on a server running.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${WIDTH}px;height:${HEIGHT}px}</style>${svg}`,
    { waitUntil: "load" }
  );
  const out = join(OUT, `${code.toLowerCase()}.png`);
  writeFileSync(out, await page.screenshot({ omitBackground: true }));
  total += statSync(out).size;
}
await browser.close();

if (missing.length) {
  console.error(`No flag artwork for: ${missing.join(", ")}`);
  process.exit(1);
}

const sizes = readdirSync(OUT)
  .map((f) => [f, statSync(join(OUT, f)).size])
  .sort((a, b) => b[1] - a[1]);
console.log(
  `${codes.length} flags written to ${OUT}/ — ${Math.round(total / 1024)} KB total, ` +
    `largest ${sizes[0][0]} ${Math.round(sizes[0][1] / 1024)} KB, ` +
    `median ${Math.round(sizes[Math.floor(sizes.length / 2)][1] / 1024)} KB`
);
