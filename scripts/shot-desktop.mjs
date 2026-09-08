import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3500);
// Dismiss first-run overlays the same way a returning user has them gone.
for (const t of ["Dismiss", "No thanks"]) {
  const el = p.locator(`button:has-text("${t}")`).first();
  if (await el.count()) await el.click().catch(() => {});
}
await p.waitForTimeout(600);
const info = await p.evaluate(() => {
  const rail = document.querySelector(".nav-rail");
  const panel = document.querySelector(".side-panel, [class*='side-panel']");
  return {
    railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,
    panelOpen: !!panel && panel.getBoundingClientRect().width > 10,
    panelWidth: panel ? Math.round(panel.getBoundingClientRect().width) : null,
    quickButtons: [...document.querySelectorAll(".quick-actions button")].map((x) => x.textContent.trim()),
  };
});
console.log(JSON.stringify(info));
await p.screenshot({ path: "/home/claude/desktop-open.png" });
console.log("errors:", errs.length, errs.slice(0, 2));
await b.close();
