/**
 * Renders the certificate on its own so it can be looked at.
 *
 * Playing a game to a win in a harness is slow and flaky; the certificate is a
 * pure presentational component, so it is mounted directly against the real
 * built CSS instead. What this checks is the only thing that matters for it:
 * does it look like something a person would screenshot.
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const css = readdirSync("dist/assets")
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(`dist/assets/${f}`, "utf8"))
  .join("\n");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 820, height: 620 }, deviceScaleFactor: 2 });

await page.setContent(`<!doctype html><html><head><style>
  ${css}
  body { margin: 0; padding: 24px; background: #eef1f6; font-family: system-ui, sans-serif; }
</style></head><body><div id="root"></div></body></html>`);

// The real markup, copied from Certificate.tsx.
await page.evaluate(() => {
  document.getElementById("root").innerHTML = `
  <figure class="cert">
    <div class="cert__sheet">
      <header class="cert__head">
        <img class="cert__logo" src="LOGOFULL" alt="maNOWj GeoIntel">
        <p class="cert__kicker">Achievement<br>Certificate</p>
      </header>
      <div class="cert__hero">
        <p class="cert__label">Presented to</p>
        <input class="cert__name" value="Manoj Kumar Gudla">
        <p class="cert__context">
          <span class="cert__game">Cricket Challenge</span>
          <span class="cert__dot"></span>
          Chased it down &mdash; 38/0
        </p>
        <p class="cert__score">
          <span class="cert__score-value">38</span>
          <span class="cert__score-label">Runs</span>
        </p>
        <p class="cert__detail">Target was 35. Your average timing was 44ms off the middle.</p>
      </div>
      <footer class="cert__foot">
        <dl class="cert__facts">
          <div><dt>Awarded</dt><dd>7 Sep 2026</dd></div>
          <div><dt>Credential ID</dt><dd class="cert__id">MJ-CRI-38-YJ3Y</dd></div>
        </dl>
        <div class="cert__issuer">
          <span class="cert__site">maNOWj.com</span>
          <span class="cert__disclaimer">Issued by maNOWj GeoIntel &middot; a game result, not a qualification</span>
        </div>
      </footer>
    </div>
    <figcaption class="cert__hint">Write your name, then screenshot it to share.</figcaption>
  </figure>`;
});

// Inline the real logos as data URIs so the render does not need a server.
const { readFileSync: rf } = await import("node:fs");
const b64 = (f) => "data:image/png;base64," + rf(f).toString("base64");
await page.evaluate(([mark, full]) => {
  document.querySelectorAll("img.cert__logo").forEach((el) => el.setAttribute("src", full));
}, [null, b64("public/logo.png")]);
await page.waitForTimeout(700);
await page.locator(".cert").screenshot({ path: "/home/claude/certificate.png" });
await browser.close();
console.log("rendered");
