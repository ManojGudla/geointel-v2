import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/gs", { recursive: true });

const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","base64");
const results = [], errors = [];
const check = (n,p,d="") => { results.push({n,p}); console.log(`${p?"PASS":"FAIL"}  ${n}${d?` — ${d}`:""}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport:{width:1280,height:900} })).newPage();
page.on("console", m => { if (m.type()==="error" && !/Failed to load resource|ERR_|net::/i.test(m.text())) errors.push(m.text()); });
page.on("pageerror", e => errors.push("pageerror: "+e.message));

await page.route("**/api/**", r => r.fulfill({ json:{ok:true} }));
await page.route("**/*.png", r => r.fulfill({status:200,contentType:"image/png",body:TILE}));
await page.route("**/*.jpg", r => r.fulfill({status:200,contentType:"image/jpeg",body:TILE}));
await page.route("**/api/health*", r => r.fulfill({ json:{ok:true,status:"online"} }));

await page.goto("http://localhost:4173", { waitUntil:"networkidle" });
await page.waitForTimeout(2000);

await page.locator(".app-header__more > button").first().click();
await page.waitForTimeout(300);
await page.getByRole("menuitem", { name:/maNOWj PLAY/i }).click();
await page.waitForSelector(".play__sheet", { timeout:9000 });
await page.waitForTimeout(600);

const cards = await page.locator(".play-card").count();
check("hub lists all games", cards >= 10, `${cards} games`);
check("no disabled cards", (await page.locator(".play-card button:disabled").count()) === 0);

// ── Cricket: a real timing game ──────────────────────────────────────────
await page.locator(".play-card").filter({hasText:"Cricket"}).locator("button").click();
await page.waitForTimeout(600);
check("cricket shows a pitch, not a shot menu", (await page.locator(".cricket__pitch").count()) === 1);
check("cricket has no shot-picker buttons", (await page.locator(".cricket__shot").count()) === 0);

// Bowl one ball and swing at it.
await page.locator(".cricket__pitch").click();
await page.waitForTimeout(700);            // run-up
const travelling = await page.locator(".cricket__pitch--travelling").count();
check("ball is in flight after the run-up", travelling === 1);
const ballVisible = await page.locator(".cricket__ballmark").count();
check("ball is drawn on the pitch", ballVisible === 1);

// Record where the ball is, wait, check it MOVED (i.e. it really travels).
const top1 = await page.locator(".cricket__ballmark").evaluate(el => el.style.top);
await page.waitForTimeout(300);
const top2 = await page.locator(".cricket__ballmark").evaluate(el => el.style.top).catch(()=>null);
check("ball actually travels down the pitch", top2 !== null && top1 !== top2, `${top1} -> ${top2}`);

await page.locator(".cricket__pitch").click();  // swing
await page.waitForTimeout(500);
const feedback = await page.locator(".cricket__feedback").textContent().catch(()=>"");
check("swing produces timing feedback in ms", /ms|Missed/.test(feedback||""), (feedback||"").trim().slice(0,50));
const scored = await page.locator(".cricket__score strong").textContent();
check("scoreboard updated after the ball", /\d+\/\d+/.test(scored||""), scored||"");
await page.screenshot({ path:"/tmp/gs/cricket.png" });

await page.getByRole("button", { name:/All games/i }).click();
await page.waitForTimeout(400);

// ── Geo Memory ───────────────────────────────────────────────────────────
await page.locator(".play-card").filter({hasText:"Geo Memory"}).locator("button").click();
await page.waitForTimeout(500);
const memCards = await page.locator(".memory__card").count();
check("memory board has 16 cards by default", memCards === 16, `${memCards}`);
const faceUpBefore = await page.locator(".memory__card--up").count();
check("all cards start face down", faceUpBefore === 0);
await page.locator(".memory__card").nth(0).click();
await page.waitForTimeout(150);
await page.locator(".memory__card").nth(1).click();
await page.waitForTimeout(150);
const faceUp = await page.locator(".memory__card--up").count();
check("two cards flip, never more", faceUp === 2, `${faceUp}`);
// A third click while two are up must be refused.
await page.locator(".memory__card").nth(5).click();
await page.waitForTimeout(150);
const afterThird = await page.locator(".memory__card--up").count();
check("a third flip is refused while two are up", afterThird === 2, `${afterThird}`);
await page.screenshot({ path:"/tmp/gs/memory.png" });

await page.getByRole("button", { name:/All games/i }).click();
await page.waitForTimeout(400);

// ── Find It ──────────────────────────────────────────────────────────────
await page.locator(".play-card").filter({hasText:"Find It"}).locator("button").click();
await page.waitForTimeout(400);
await page.getByRole("button", { name:/^Start$/ }).click();
await page.waitForTimeout(500);
const cells = await page.locator(".findit__cell").count();
check("find-it renders a search grid", cells >= 12, `${cells} cells`);
const target = await page.locator(".findit__target-icon").textContent();
check("a target icon is shown", !!(target||"").trim(), (target||"").trim());
// Exactly one cell matches the target.
const matching = await page.locator(".findit__cell").evaluateAll((els, t) => els.filter(e => e.textContent.trim() === t).length, (target||"").trim());
check("exactly one cell matches the target", matching === 1, `${matching}`);
const w1 = await page.locator(".findit__timer > span").evaluate(el => el.style.width);
await page.waitForTimeout(600);
const w2 = await page.locator(".findit__timer > span").evaluate(el => el.style.width);
check("the timer bar is actually counting down", w1 !== w2, `${w1} -> ${w2}`);
await page.screenshot({ path:"/tmp/gs/findit.png" });

check("zero console errors", errors.length === 0, errors.slice(0,2).join(" | "));
await browser.close();
const failed = results.filter(r=>!r.p);
console.log(`\n${results.length-failed.length}/${results.length} checks passed.`);
if (errors.length) errors.slice(0,6).forEach(e=>console.log("  "+e));
process.exit(failed.length?1:0);
