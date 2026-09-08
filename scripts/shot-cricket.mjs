/**
 * Plays a ball of Cricket and photographs the ground.
 *
 * The stadium replaced a green rectangle with a dot on it, after feedback that
 * the old emoji players looked "small, over-acted and funny". That is a purely
 * visual judgement, so the only honest way to check the fix is to look at it.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
await page.locator('button:has-text("More")').first().click();
await page.waitForTimeout(700);
await page.locator('button:has-text("PLAY"), a:has-text("PLAY")').first().click();
await page.waitForTimeout(1600);
await page.locator("article.play-card", { hasText: "Cricket Challenge" }).getByRole("button", { name: "Play" }).click();
await page.waitForTimeout(1400);

const stadium = page.locator(".stadium");
console.log("stadium rendered:", (await stadium.count()) > 0);
await page.screenshot({ path: "/home/claude/cricket-ready.png" });

// Bowl one, and catch it mid-flight so the ball, bowler and crowd are all in
// their live state rather than at rest.
await stadium.click({ force: true });
await page.waitForTimeout(1500);
await stadium.screenshot({ path: "/home/claude/cricket-live.png" });

// Play the shot, then photograph the aftermath: umpire signal and crowd.
await stadium.click({ force: true });
await page.waitForTimeout(700);
await page.screenshot({ path: "/home/claude/cricket-result.png" });

console.log("page errors:", errors.length, errors.slice(0, 2));
await browser.close();
