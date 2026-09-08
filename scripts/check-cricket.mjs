/**
 * Plays a full Cricket innings in a real browser.
 *
 * The unit tests prove the chase maths. They cannot prove the new required-rate
 * line, the commentary and the bowler's plan actually reach the screen, and
 * "it typechecks" has already not been good enough twice in this project.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
await page.locator('button:has-text("More")').first().click();
await page.waitForTimeout(700);
await page.locator('button:has-text("PLAY"), a:has-text("PLAY")').first().click();
await page.waitForTimeout(1600);
// Only the small "Play" button inside the card starts a game — the card
// itself is not clickable, and clicking it dismisses the hub.
await page.locator('article.play-card', { hasText: "Cricket Challenge" }).getByRole("button", { name: "Play" }).click();
await page.waitForTimeout(1300);

const start = page.locator('button:has-text("Start")').first();
if (await start.count()) {
  await start.click();
  await page.waitForTimeout(1000);
}

const rate = await page.locator(".cricket__rate").first().textContent().catch(() => null);
console.log("required-rate line:", rate ?? "MISSING");

// Play the innings out by hammering the shot key.
let sawCommentary = false;
// Tap the pitch rather than pressing Space: the pitch is the documented
// touch target ("NOW — tap or SPACE") and does not depend on focus.
const pitch = page.locator('[class*="cricket__pitch"], [class*="pitch"]').first();
// One ball is a 650 ms run-up plus roughly 1.2 s of travel plus the reveal,
// so the loop has to move at the pace of the game rather than faster.
for (let i = 0; i < 30; i++) {
  await pitch.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2600);
  if (!sawCommentary && (await page.locator(".cricket__callout").count())) sawCommentary = true;
  if (await page.locator('button:has-text("All games")').count()) break;
}
await page.waitForTimeout(1000);

const body = await page.evaluate(() => document.body.innerText);
console.log("commentary shown during play:", sawCommentary);
console.log("reached a result screen:", /Play again/.test(body));
console.log("headline:", body.split("\n").find((l) => /Chased it down|short|TIED/.test(l)) ?? "(none)");
console.log("super over offered:", /Super Over/.test(body));
console.log("page errors:", errors.length, errors.slice(0, 2));
await page.screenshot({ path: "/home/claude/cricket.png", fullPage: false });
await browser.close();
