/**
 * Plays a real round of 60 Seconds in a real browser.
 *
 * Written for the same reason as check-daily-clues.mjs: Ultimate Tic-Tac-Toe
 * in this project had a full suite of passing engine tests and was completely
 * unplayable, because the bug lived in the wiring between the logic and React
 * rather than in the logic. A timed game has exactly that shape of risk — an
 * interval that cancels itself, a click handler that never advances, a clock
 * that keeps running after the round ends — and none of it is visible from a
 * unit test.
 *
 * So this checks the things only a browser can answer: does the clock
 * actually move, does answering actually advance, does the round actually
 * end, and does the score on the result screen match what was played.
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

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /More/i }).first().click();
await page.waitForTimeout(500);
await page.getByText(/maNOWj PLAY/i).first().click();
await page.waitForTimeout(1500);

// Each game is an <article class="play-card">; filter to the right one so
// this cannot silently launch a different game and pass.
const card = page.locator("article.play-card").filter({ hasText: "60 Seconds" });
check((await card.count()) === 1, `found exactly one 60 Seconds card (${await card.count()})`);
await card.first().scrollIntoViewIfNeeded();
await card.first().getByRole("button").first().click();
await page.waitForTimeout(800);

check(await page.getByText(/One minute\. As many as you can\./i).isVisible(), "intro screen reached");

await page.getByRole("button", { name: /start the clock/i }).click();
await page.waitForSelector(".sixty--play", { timeout: 8000 });

const clock = page.locator(".sixty__clock");
const first = await clock.textContent();
await page.waitForTimeout(2500);
const later = await clock.textContent();
check(first !== later, `clock is running (${first?.trim()} → ${later?.trim()})`);

check((await page.locator(".sixty__prompt").count()) === 1, "a question is on screen");
check(
  /×1\.00/.test((await page.locator(".sixty__mult").textContent()) ?? ""),
  "multiplier starts at ×1.00"
);

// Answer questions as fast as the flash allows, and watch the game move.
const seenPrompts = new Set();
const optionCounts = new Set();
let answers = 0;
// Tracked inside the loop, not after it. Clicking blindly means mostly wrong
// answers, and four seconds each ends the round early — so by the time the
// loop exits the in-play score is often already gone from the DOM.
let lastLiveScore = 0;
for (let i = 0; i < 22; i++) {
  if (!(await page.locator(".sixty--play").count())) break;
  const prompt = await page.locator(".sixty__prompt").first().textContent().catch(() => null);
  if (!prompt) break;
  seenPrompts.add(prompt.trim());
  const opts = page.locator(".sixty__opt");
  const n = await opts.count();
  if (!n) break;
  optionCounts.add(n);
  await opts.first().click().catch(() => {});
  answers++;
  const live = await page.locator(".sixty__score").textContent().catch(() => null);
  if (live) lastLiveScore = Math.max(lastLiveScore, Number(live.replace(/[^0-9]/g, "")) || 0);
  await page.waitForTimeout(780); // longer than the wrong-answer flash
}

check(answers >= 12, `answered ${answers} questions without getting stuck`);
check(seenPrompts.size >= 6, `questions actually changed (${seenPrompts.size} distinct prompts)`);
check(optionCounts.size >= 2, `mixed question shapes (option counts seen: ${[...optionCounts].join(", ")})`);

const score = lastLiveScore;
check(score > 0, `score moved during play (${score})`);

// Blind clicking should burn the clock through the wrong-answer penalty. If
// the round somehow survived twenty random guesses the penalty is not wired
// up, which a unit test cannot tell you.
const endedEarly = (await page.locator(".sixty--play").count()) === 0;
check(endedEarly, "wrong answers really do cost time (round ended before the full minute)");

// Let the clock run out and confirm the round ends by itself.
await page.waitForSelector(".sixty--over", { timeout: 75_000 });
check(true, "round ended on its own when the clock hit zero");

const finalText = (await page.locator(".sixty__final").textContent()) ?? "";
const finalScore = Number(finalText.replace(/[^0-9]/g, ""));
check(finalScore >= score, `final score is at least the in-play score (${score} → ${finalScore})`);

const stats = (await page.locator(".sixty__stats").textContent()) ?? "";
check(/Accuracy/.test(stats) && /%/.test(stats), "result screen shows accuracy");
check(/Best streak/.test(stats), "result screen shows best streak");
check(
  await page.getByRole("button", { name: /go again/i }).isVisible(),
  "can start another round"
);

// The clock must not still be ticking behind the result screen.
await page.waitForTimeout(1500);
const stillPlaying = await page.locator(".sixty--play").count();
check(stillPlaying === 0, "the play view is gone, so the interval is not still running");

const OFF_NETWORK = /arcgisonline|openstreetmap|opentopomap|rainviewer|earthdata|nominatim|open-meteo|googletagmanager|fonts\.(googleapis|gstatic)/i;
const real = consoleErrors.filter(
  (e) => !OFF_NETWORK.test(e) && !/favicon|manifest|sw\.js|Failed to load resource|ERR_TUNNEL|Failed to fetch/i.test(e)
);
check(real.length === 0, `no console errors (${real.slice(0, 2).join(" | ") || "none"})`);

await page.screenshot({ path: "/tmp/sixty.png", fullPage: true });
await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : "\nall good");
process.exit(problems.length ? 1 : 0);
