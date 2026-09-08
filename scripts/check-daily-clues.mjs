/**
 * Plays a real round of the Daily Challenge in a real browser.
 *
 * Written after a bug that every unit test missed: the Ultimate Tic-Tac-Toe
 * computer never took its turn, because a state flag sat in an effect's
 * dependency array and the effect cancelled its own timer. The engine tests
 * were all green. Only playing it found it.
 *
 * The clue ladder has the same shape of risk — the button sets state, the
 * state moves a MapLibre camera, and MapLibre is exactly the kind of thing
 * that looks fine in a JSDOM test and renders a 0px canvas in a browser. So
 * this checks the three things unit tests structurally cannot see:
 *
 *   the clue text actually appears when the button is pressed,
 *   the price is shown before it is charged,
 *   and both maps still have a real height afterwards.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

// Requests that fail are recorded WITH their URL, because the console message
// alone ("ERR_TUNNEL_CONNECTION_FAILED") cannot tell a real bug apart from
// this sandbox's own blocked egress to the tile servers.
const failedUrls = [];
page.on("requestfailed", (r) => failedUrls.push(r.url()));

await page.goto(BASE, { waitUntil: "domcontentloaded" });

// Into the games hub, then the Daily. Games are an overlay behind the header's
// "More" menu, not a route, so there is no URL to jump straight to.
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /More/i }).first().click();
await page.waitForTimeout(600);
await page.getByText(/maNOWj PLAY/i).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /play today/i }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /start today/i }).click();
await page.waitForSelector(".daily--play", { timeout: 15000 });

// Give MapLibre a moment to build both canvases.
await page.waitForTimeout(3500);

const mapHeights = await page.$$eval(".daily__view .play-map", (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().height))
);
check(mapHeights.length === 2, `two maps present (got ${mapHeights.length})`);
check(
  mapHeights.every((h) => h > 200),
  `both maps have real height (${mapHeights.join(", ")}px)`
);

check(
  await page.getByText(/drag and zoom this photo/i).isVisible(),
  "the photo says it can be zoomed"
);

// No clues yet.
check((await page.$$(".daily__clue")).length === 0, "starts with no clues shown");

// Rung 1 — free.
const clueBtn = page.getByRole("button", { name: /clue/i });
check(/free/i.test(await clueBtn.textContent()), "first clue is advertised as free");
await clueBtn.click();
await page.waitForTimeout(1200);

const first = await page.$$eval(".daily__clue", (els) => els.map((e) => e.textContent.trim()));
check(first.length === 1, `one clue after one press (got ${first.length})`);
check(/this place is in/i.test(first[0] ?? ""), `free clue names a continent: "${first[0] ?? ""}"`);
check(
  (await page.$$(".daily__clue-cost")).length === 0,
  "no penalty shown for the free clue"
);

// Rung 2 — priced, and the price must be visible BEFORE it is charged.
check(/20%/.test(await clueBtn.textContent()), "second clue shows its price on the button");
await clueBtn.click();
await page.waitForTimeout(600);
const second = await page.$$eval(".daily__clue", (els) => els.map((e) => e.textContent.trim()));
check(second.length === 2, `two clues after two presses (got ${second.length})`);
check((second[1] ?? "").length > 30, `second clue has real text: "${(second[1] ?? "").slice(0, 60)}…"`);
check(
  /scoring at 80%/i.test((await page.textContent(".daily__action")) ?? ""),
  "the new score share is stated"
);

// Rung 3, then the ladder must end rather than loop.
await clueBtn.click();
await page.waitForTimeout(600);
const third = await page.$$eval(".daily__clue", (els) => els.map((e) => e.textContent.trim()));
check(third.length === 3, `three clues after three presses (got ${third.length})`);
check(new Set(third).size === 3, "no clue is repeated");
check(
  (await page.getByRole("button", { name: /clue/i }).count()) === 0,
  "the clue button is gone once they run out"
);
check(
  /scoring at 45%/i.test((await page.textContent(".daily__action")) ?? ""),
  "the final score share is stated"
);

// The maps must have survived three camera jumps.
const afterHeights = await page.$$eval(".daily__view .play-map", (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().height))
);
check(
  afterHeights.every((h) => h > 200),
  `maps still alive after the camera jumps (${afterHeights.join(", ")}px)`
);
const canvases = await page.$$eval("canvas", (els) =>
  els.map((c) => `${c.width}x${c.height}`).filter((s) => !s.startsWith("0"))
);
check(canvases.length >= 2, `both map canvases drawn (${canvases.join(", ")})`);

// And a guess must still be lockable at the end of it.
await page.locator(".daily__view").nth(1).locator(".play-map").click({ position: { x: 300, y: 200 } });
await page.waitForTimeout(600);
const lockIn = page.getByRole("button", { name: /lock in this guess/i });
check(await lockIn.isEnabled(), "the guess can still be locked in");
await lockIn.click();
await page.waitForSelector(".daily__answer", { timeout: 8000 });
const answer = (await page.textContent(".daily__answer")) ?? "";
check(/less \d+% for/i.test(answer), `the answer card shows what the clues cost: ${/less \d+% for [a-z ]+\./i.exec(answer)?.[0] ?? "MISSING"}`);

// Tile and API hosts this sandbox cannot reach. Their failures say nothing
// about the code, and counting them would make this script cry wolf forever.
const OFF_NETWORK =
  /arcgisonline|openstreetmap|opentopomap|rainviewer|earthdata|nominatim|open-meteo|googletagmanager|fonts\.(googleapis|gstatic)/i;
const blocked = failedUrls.filter((u) => OFF_NETWORK.test(u));
const unexplained = failedUrls.filter((u) => !OFF_NETWORK.test(u));
console.log(`  ..   ${blocked.length} external request(s) blocked by this sandbox, ignored`);
check(unexplained.length === 0, `no unexplained failed requests (${unexplained.slice(0, 2).join(" | ") || "none"})`);

const realErrors = consoleErrors.filter((e) => {
  if (/favicon|manifest|sw\.js/i.test(e)) return false;
  if (/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/i.test(e)) return false;
  // MapLibre reports a blocked tile request as an unhandled "Failed to fetch"
  // with its own module in the stack. Ignored only because the tile hosts are
  // in the blocked list above and their count is printed alongside.
  if (/Failed to fetch/i.test(e) && /maplibre-gl/i.test(e) && blocked.length > 0) return false;
  return true;
});
check(realErrors.length === 0, `no console errors (${realErrors.slice(0, 2).join(" | ") || "none"})`);

await page.screenshot({ path: "/tmp/daily-clues.png", fullPage: true });
await browser.close();

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : "\nall good");
process.exit(problems.length ? 1 : 0);
