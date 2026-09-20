#!/usr/bin/env node
/**
 * Contrast audit for the design tokens.
 *
 * "text was not that much visible once check all and fix" - rather than
 * eyeballing colours, this computes the real WCAG 2.1 contrast ratio for
 * every text token against every surface it can legitimately sit on, in both
 * themes, and fails the build-adjacent check if any pair falls below its
 * threshold.
 *
 * Thresholds are the WCAG AA ones: 4.5:1 for normal text, 3:1 for large
 * text (>=18.66px bold or >=24px). Everything in this app that uses
 * --color-text-faint is small, so faint text is held to 4.5:1 too - the
 * "large text" allowance is deliberately not used as an escape hatch.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "src", "styles", "tokens.css");

const AA_NORMAL = 4.5;

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pulls the token values out of a specific block of tokens.css. Blocks are
 * delimited by their selector, so light values come from `:root {` and dark
 * values from `:root[data-theme="dark"] {` - the media-query block is a
 * duplicate of the latter and is verified separately for drift.
 */
function readBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open, close);
  const tokens = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[`--${m[1]}`] = m[2];
  }
  return tokens;
}

const css = readFileSync(tokensPath, "utf8");
const light = readBlock(css, ":root {");
const dark = readBlock(css, ':root[data-theme="dark"] {');
const darkMedia = readBlock(css, ':root:not([data-theme="light"]) {');

// Dark values are written twice (media query + explicit attribute). They
// MUST stay identical, or the toggle and the OS preference disagree.
const drift = Object.keys(dark).filter((k) => darkMedia[k] && darkMedia[k].toLowerCase() !== dark[k].toLowerCase());

const TEXT_TOKENS = [
  "--color-text",
  "--color-text-muted",
  "--color-text-faint",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--color-player-o",
];
const SURFACE_TOKENS = ["--color-bg", "--color-surface", "--color-surface-raised"];

const failures = [];
const rows = [];

// Status colours are also used as text ON their own tinted pill background
// (the header's "GIS Online" pill, trust badges, banner rows) - a pairing
// the surface loop above never covers, and the one most likely to go dim.
const TINTED_PAIRS = [
  ["--color-success", "--color-success-bg"],
  ["--color-warning", "--color-warning-bg"],
  ["--color-danger", "--color-danger-bg"],
  ["--color-info", "--color-info-bg"],
];

for (const [themeName, theme] of [["light", light], ["dark", { ...light, ...dark }]]) {
  for (const t of TEXT_TOKENS) {
    for (const s of SURFACE_TOKENS) {
      const fg = theme[t];
      const bg = theme[s];
      if (!fg || !bg) continue;
      const ratio = contrast(fg, bg);
      const pass = ratio >= AA_NORMAL;
      rows.push({ themeName, t, s, fg, bg, ratio: ratio.toFixed(2), pass });
      if (!pass) failures.push(`${themeName}: ${t} (${fg}) on ${s} (${bg}) = ${ratio.toFixed(2)}:1`);
    }
  }

  for (const [t, s] of TINTED_PAIRS) {
    const fg = theme[t];
    const bg = theme[s];
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    const pass = ratio >= AA_NORMAL;
    rows.push({ themeName, t, s, fg, bg, ratio: ratio.toFixed(2), pass });
    if (!pass) failures.push(`${themeName}: ${t} (${fg}) on ${s} (${bg}) = ${ratio.toFixed(2)}:1`);
  }
}

for (const r of rows) {
  const mark = r.pass ? "ok  " : "FAIL";
  console.log(`${mark} ${r.themeName.padEnd(5)} ${r.t.padEnd(22)} on ${r.s.padEnd(22)} ${String(r.ratio).padStart(6)}:1`);
}

/**
 * Two colours in the app are deliberately hardcoded because they sit on a
 * surface that does NOT change with the theme: the navigation banner is always
 * dark navy, and the printed area report is always on white paper. Theme
 * tokens would be wrong there - but they still have to be legible, so they're
 * pinned here rather than left unchecked.
 */
const FIXED_SURFACE = [
  ["navigation banner label", "#8fb0f7", "#10203f"],
  ["printed report heading", "#14181f", "#ffffff"],
  ["printed report body", "#48505f", "#ffffff"],
  ["printed report caption", "#6b7386", "#ffffff"],
];

for (const [name, fg, bg] of FIXED_SURFACE) {
  const ratio = contrast(fg, bg);
  const pass = ratio >= AA_NORMAL;
  console.log(`${pass ? "ok  " : "FAIL"} fixed ${name.padEnd(30)} ${ratio.toFixed(2)}:1`);
  if (!pass) failures.push(`fixed surface: ${name} (${fg} on ${bg}) = ${ratio.toFixed(2)}:1`);
}

if (drift.length) {
  console.error("\nDark theme drift between the media query and [data-theme=dark]:");
  for (const k of drift) console.error(`  ${k}: media=${darkMedia[k]} attr=${dark[k]}`);
}

if (failures.length || drift.length) {
  console.error(`\n${failures.length} contrast failure(s), ${drift.length} drift(s).`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}

console.log(`\nAll ${rows.length} token pairs meet WCAG AA (${AA_NORMAL}:1) in both themes.`);
