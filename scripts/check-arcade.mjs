/**
 * Plays all four arcade games in a real browser.
 *
 * Unit tests cover the rules; they cannot tell you whether a click advances
 * the game. Ultimate Tic-Tac-Toe in this project had a green suite and was
 * unplayable, so every new game gets driven by hand before it ships.
 */
import { chromium } from "playwright";

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

async function openHub() {
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.getByRole("button", { name: /More/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(/maNOWj PLAY/i).first().click();
  await page.waitForTimeout(1200);
}

async function play(title, startLabel, rounds) {
  await openHub();
  const card = page.locator("article.play-card").filter({ hasText: title });
  check((await card.count()) === 1, `${title}: exactly one card`);
  await card.first().scrollIntoViewIfNeeded();
  await card.first().getByRole("button").first().click();
  await page.waitForTimeout(600);

  const startBtn = page.getByRole("button", { name: startLabel });
  check(await startBtn.isVisible(), `${title}: intro screen`);
  await startBtn.click();
  await page.waitForTimeout(800);

  const seen = new Set();
  let played = 0;
  for (let i = 0; i < rounds; i++) {
    const opts = page.locator(".arc__opt");
    if (!(await opts.count())) break;
    const body = await page.locator(".arc__card").textContent().catch(() => "");
    if (body) seen.add(body.slice(0, 60));
    await opts.first().click().catch(() => {});
    played++;
    await page.waitForTimeout(3200); // longer than every reveal
  }
  // Impossible or Real ends on the first wrong answer by design, and this
  // script clicks blindly, so one round is a pass there — that IS the game.
  const floor = title === "Impossible or Real" ? 1 : 2;
  check(played >= floor, `${title}: answered ${played} round(s) without sticking`);
  check(seen.size >= floor, `${title}: content changed between rounds (${seen.size})`);

  const score = await page.locator(".arc__score, .arc__final").first().textContent().catch(() => null);
  check(score !== null, `${title}: score visible (${score?.trim()})`);
  return played;
}

await play("The Impostor", /^Start$/, 3);
await play("Impossible or Real", /^Start$/, 3);
await play("Crack the Code", /^Start$/, 3);
await play("Pattern Breaker", /^Start$/, 3);

// Pattern Breaker also has to advance on its own when the clock runs out.
await openHub();
const pb = page.locator("article.play-card").filter({ hasText: "Pattern Breaker" });
await pb.first().scrollIntoViewIfNeeded();
await pb.first().getByRole("button").first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /^Start$/ }).click();
await page.waitForSelector(".arc__sequence", { timeout: 8000 });
const before = (await page.locator(".arc__sequence").textContent()).trim();
await page.waitForTimeout(21_000); // 15s clock + 2.4s reveal + slack
const after = (await page.locator(".arc__sequence").textContent()).trim();
const progress = (await page.locator(".arc__progress").textContent()).trim();
check(before !== after, "Pattern Breaker: advances on timeout by itself");
// It must advance by exactly ONE. It used to jump 1 → 3, because clearing the
// answer left one render with the clock still reading zero and the timeout
// fired again on it, burning the next puzzle.
check(/^2 of /.test(progress), `Pattern Breaker: timeout advances one puzzle, not two (${progress})`);

const OFF = /arcgisonline|openstreetmap|opentopomap|rainviewer|earthdata|nominatim|open-meteo|googletagmanager|fonts\.(googleapis|gstatic)/i;
const real = errors.filter((e) => !OFF.test(e) && !/favicon|manifest|sw\.js|Failed to load resource|ERR_TUNNEL|Failed to fetch/i.test(e));
check(real.length === 0, `no console errors (${real.slice(0, 2).join(" | ") || "none"})`);

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : "\nall good");
process.exit(problems.length ? 1 : 0);
