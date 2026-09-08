import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The production Content-Security-Policy and index.html have to agree, and for
 * a long time they did not.
 *
 * index.html carried the blank-page recovery guard as an inline <script>. The
 * production CSP is `script-src 'self'` with no 'unsafe-inline', so Chrome
 * blocked that script on every single page load of the live site:
 *
 *   Executing inline script violates the following Content Security Policy
 *   directive: "script-src 'self'". ... The action has been blocked.
 *
 * The safety net built for the blank-page outage had therefore never run in
 * production even once. It was invisible locally because the dev server's CSP
 * allows 'unsafe-inline' (Vite's HMR needs it) — so the guard worked in
 * development and was dead where it mattered.
 *
 * These tests derive the rule from the CSP itself rather than hard-coding it:
 * if script-src ever legitimately gains 'unsafe-inline' or a hash, the inline
 * assertions relax automatically. Until then, no inline script and no inline
 * event handler may come back into index.html.
 */

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

const csp =
  config.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key.toLowerCase() === "content-security-policy")?.value ?? "";

/** The script-src directive as a list of sources. */
const scriptSrc = (csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "")
  .replace("script-src", "")
  .trim()
  .split(/\s+/)
  .filter(Boolean);

/** Comments legitimately mention `onclick=` and inline scripts — strip them first. */
const stripHtmlComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "");
const stripJsComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every <script> in index.html, with its attributes and its body. */
function scriptTags(source: string): Array<{ attrs: string; body: string }> {
  const tags: Array<{ attrs: string; body: string }> = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    tags.push({ attrs: match[1] ?? "", body: match[2] ?? "" });
  }
  return tags;
}

/**
 * Script types the browser never EXECUTES, so `script-src` does not apply to
 * them. A `<script type="application/ld+json">` block is structured data for
 * search engines; the parser reads it as text and nothing runs. Treating it as
 * a CSP violation would be wrong, and would push the structured data off the
 * page for no reason.
 *
 * Deliberately a short allowlist rather than "anything with a type": an
 * unknown type is far more likely to be a mistake than a new data format, and
 * `type="module"` and a bare `<script>` both execute.
 */
const NON_EXECUTABLE_TYPES = new Set(["application/ld+json", "application/json"]);

function isExecutableInline(tag: { attrs: string; body: string }): boolean {
  if (/\ssrc\s*=/i.test(tag.attrs)) return false; // external, not inline
  if (tag.body.trim().length === 0) return false;
  const type = /\stype\s*=\s*["']([^"']+)["']/i.exec(tag.attrs)?.[1]?.trim().toLowerCase();
  return !(type && NON_EXECUTABLE_TYPES.has(type));
}

const allowsInline = scriptSrc.includes("'unsafe-inline'");
const allowsHashOrNonce = scriptSrc.some((s) => s.startsWith("'sha") || s.startsWith("'nonce-"));

describe("CSP and index.html agree", () => {
  it("has a script-src directive at all", () => {
    // Without this, everything below would pass vacuously.
    expect(scriptSrc.length).toBeGreaterThan(0);
    expect(scriptSrc).toContain("'self'");
  });

  it("contains no inline <script> while the CSP forbids inline scripts", () => {
    if (allowsInline || allowsHashOrNonce) return; // Not applicable; see header.

    const inline = scriptTags(stripHtmlComments(html)).filter(isExecutableInline);

    // A failure here means the script silently does nothing on the live site.
    expect(inline.map((t) => t.body.trim().slice(0, 60))).toEqual([]);
  });

  it("contains no inline event handlers while the CSP forbids inline scripts", () => {
    if (allowsInline || allowsHashOrNonce) return;

    // onclick="..." in markup is blocked by exactly the same directive, and
    // fails silently — the button simply does nothing when pressed. The old
    // recovery guard's "Try again" button was one of these.
    const handlers = stripHtmlComments(html).match(/\son[a-z]+\s*=\s*["']/gi) ?? [];
    expect(handlers).toEqual([]);
  });

  it("still treats a real inline script as a violation", () => {
    // The ld+json allowance above is a narrow exception. If it ever widened
    // into "anything with a type attribute", the recovery-guard bug could
    // come straight back with no test failing.
    expect(isExecutableInline({ attrs: "", body: "alert(1)" })).toBe(true);
    expect(isExecutableInline({ attrs: ' type="module"', body: "import x from 'y'" })).toBe(true);
    expect(isExecutableInline({ attrs: ' type="text/javascript"', body: "var a = 1" })).toBe(true);
    expect(isExecutableInline({ attrs: ' type="application/ld+json"', body: "{}" })).toBe(false);
    expect(isExecutableInline({ attrs: ' src="/recovery.js" defer', body: "" })).toBe(false);
  });

  it("loads every script from this origin, which is what 'self' permits", () => {
    for (const tag of scriptTags(stripHtmlComments(html))) {
      const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag.attrs)?.[1];
      if (!src) continue;
      expect(src.startsWith("/")).toBe(true);
    }
  });
});

describe("the built output, which is what actually ships", () => {
  /**
   * Checking the source is necessary but not sufficient: the build tool can
   * inject its own inline script (Vite's module-preload polyfill is the usual
   * one), and that would be blocked in production exactly like the recovery
   * guard was. Only dist/index.html proves what the browser receives.
   *
   * Skipped unless dist/ is present AND newer than the source it was built
   * from. A LEFTOVER dist is the trap here: `npm test` before `npm run build`
   * would otherwise report the previous build's shortcomings as failures of
   * the code you just wrote — which is what happened on the first machine to
   * run this, where an old dist predating recovery.js failed the second test
   * even though the source was correct. A stale build is not a test failure;
   * it is simply nothing to check yet.
   */
  const dist = join(root, "dist", "index.html");
  const fresh =
    existsSync(dist) && statSync(dist).mtimeMs >= statSync(join(root, "index.html")).mtimeMs;
  const built = fresh ? stripHtmlComments(readFileSync(dist, "utf8")) : null;

  it.skipIf(!built)("ships no inline script and no inline handler", () => {
    if (!built || allowsInline || allowsHashOrNonce) return;

    const inline = scriptTags(built).filter(isExecutableInline);
    expect(inline.map((t) => t.body.trim().slice(0, 80))).toEqual([]);
    expect(built.match(/\son[a-z]+\s*=\s*["']/gi) ?? []).toEqual([]);
  });

  it.skipIf(!built)("still references the recovery guard after bundling", () => {
    // Vite rewrites asset URLs during the build; this confirms the guard's
    // reference survived it and points at a file that was emitted.
    if (!built) return;
    expect(built).toContain('src="/recovery.js"');
    expect(existsSync(join(root, "dist", "recovery.js"))).toBe(true);
  });
});

describe("the recovery guard", () => {
  const path = join(root, "public", "recovery.js");

  it("exists as a real file at the path index.html asks for", () => {
    // index.html references it; if the file is renamed or deleted the guard
    // 404s and the blank-page protection is gone again.
    expect(html).toContain('src="/recovery.js"');
    expect(existsSync(path)).toBe(true);
  });

  const js = existsSync(path) ? stripJsComments(readFileSync(path, "utf8")) : "";

  it("still does the three things it exists to do", () => {
    expect(js).toContain("caches.delete");        // drop the poisoned cache
    expect(js).toContain("unregister");           // remove the stale worker
    expect(js).toContain("manowj.recovery.attempted"); // one attempt, never a loop
  });

  it("wires its retry button with addEventListener, not an onclick attribute", () => {
    // An onclick attribute inside innerHTML is blocked by the same CSP
    // directive that broke the guard in the first place, and fails silently.
    expect(js).not.toMatch(/onclick\s*=/);
    expect(js).toContain("addEventListener");
  });

  it("is not swallowed by the SPA rewrite", () => {
    // If /recovery.js were rewritten to index.html, the browser would refuse
    // an HTML document as a script — the exact failure this guard recovers
    // from would also disable the guard.
    const swallowed = config.rewrites.some((r) => new RegExp(`^${r.source}$`).test("/recovery.js"));
    expect(swallowed).toBe(false);
  });
});
