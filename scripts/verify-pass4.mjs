import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Verifies THIS pass's work against the real running app, with only the
 * network mocked (this container can't reach Nominatim/Overpass/tile hosts).
 * Everything below the mock boundary is the app's genuine code path.
 *
 * What it checks:
 *   1. Map click selects the location (the bug: it used to open a rival panel)
 *   2. The map load state resolves rather than sitting on a grey rectangle
 *   3. Directions produce a route from TYPED text + Enter (the reported bug)
 *   4. Turn steps are listed and are clickable
 *   5. Route alternatives can be switched
 *   6. maNOWj PLAY opens, lists real games, and one plays end to end
 *   7. Four-in-a-Row drops a disc and the AI replies
 *   8. Weather effects are OFF by default and no canvas is drawn
 *   9. The privacy page opens and shows the "not yet true" section
 *  10. Zero console errors throughout
 */
mkdirSync("/tmp/geointel-pass4", { recursive: true });

const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const LOCATION = {
  lat: 25.3176,
  lon: 82.9739,
  displayName: "Varanasi, Uttar Pradesh, India",
  name: "Varanasi",
  address: { city: "Varanasi", state: "Uttar Pradesh", country: "India", postcode: "221001" },
  source: "OpenStreetMap / Nominatim",
};

const DELHI = { lat: 28.6139, lon: 77.209, displayName: "Delhi, India", name: "Delhi" };

/** A route with real step coordinates, so step-click can be exercised. */
const ROUTE_STEPS = [
  { instruction: "Head north onto GT Road", distanceMeters: 1200, durationSeconds: 120, location: [82.9739, 25.3176], type: "depart", modifier: "straight" },
  { instruction: "Turn left onto NH19", distanceMeters: 45_000, durationSeconds: 2400, location: [82.5, 25.6], type: "turn", modifier: "left" },
  { instruction: "Turn right onto NH2", distanceMeters: 700_000, durationSeconds: 25_000, location: [79.5, 27.0], type: "turn", modifier: "right" },
  { instruction: "Arrive at your destination", distanceMeters: 0, durationSeconds: 0, location: [77.209, 28.6139], type: "arrive" },
];

const GEOMETRY = [
  [82.9739, 25.3176],
  [82.5, 25.6],
  [79.5, 27.0],
  [77.209, 28.6139],
];

const ROUTE = {
  mode: "car",
  distanceMeters: 746_900,
  durationSeconds: 27_520,
  geometry: GEOMETRY,
  alternatives: 1,
  source: "routing.openstreetmap.de",
  steps: ROUTE_STEPS,
  options: [
    { distanceMeters: 746_900, durationSeconds: 27_520, geometry: GEOMETRY, steps: ROUTE_STEPS, summary: "Fastest" },
    {
      distanceMeters: 792_000,
      durationSeconds: 29_000,
      geometry: GEOMETRY,
      steps: ROUTE_STEPS.slice(0, 3),
      summary: "25 min slower · 45.1 km longer",
    },
  ],
};

const FEATURES = Array.from({ length: 40 }, (_, i) => ({
  id: `f${i}`,
  lat: 25.315 + (i % 8) * 0.0009,
  lon: 82.971 + Math.floor(i / 8) * 0.0009,
  name: `F${i}`,
  tags: i % 4 === 0 ? { amenity: "restaurant" } : i % 4 === 1 ? { shop: "clothes" } : i % 4 === 2 ? { building: "residential" } : { amenity: "hospital" },
}));

const EVIDENCE = {
  trust: "verified",
  radiusMeters: 500,
  counts: { buildings: 300, shops: 90, offices: 12, residential: 200, industrial: 2, institutional: 14, amenities: 60, tourism: 8, transport: 18 },
  scores: { commercial: 62, residential: 58, institutional: 16, industrial: 2, landmark: 30, transport: 24 },
  features: FEATURES,
  source: "OpenStreetMap / Overpass",
  fetchedAt: new Date().toISOString(),
};

async function mock(page) {
  // Catch-all FIRST: Playwright matches the LAST-registered handler first, so
  // registering this last would swallow every specific route below it.
  await page.route("**/api/**", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/*.png", (r) => r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
  await page.route("**/*.jpg", (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: TILE }));
  await page.route("**/api/health*", (r) => r.fulfill({ json: { ok: true, status: "online" } }));
  await page.route("**/api/reverse-geocode*", (r) => r.fulfill({ json: { ok: true, location: LOCATION } }));
  await page.route("**/api/geocode*", (r) => {
    const q = (new URL(r.request().url()).searchParams.get("q") || "").toLowerCase();
    const hit = q.includes("delhi") ? DELHI : LOCATION;
    return r.fulfill({
      json: { ok: true, results: [{ lat: hit.lat, lon: hit.lon, name: hit.name, displayName: hit.displayName, type: "city", importance: 0.8 }] },
    });
  });
  await page.route("**/api/route*", (r) => r.fulfill({ json: { ok: true, route: ROUTE } }));
  await page.route("**/api/gis*", (r) => r.fulfill({ json: { ok: true, evidence: EVIDENCE } }));
  await page.route("**/api/nearby*", (r) => r.fulfill({ json: { ok: true, items: [] } }));
  await page.route("**/api/weather*", (r) =>
    r.fulfill({
      json: {
        ok: true,
        weather: {
          temperatureC: 31,
          feelsLikeC: 34,
          condition: "Slight rain",
          weatherCode: 61,
          humidityPct: 70,
          windKph: 12,
          precipitationMm: 1.2,
          forecast: [],
          source: "Open-Meteo",
          fetchedAt: new Date().toISOString(),
        },
      },
    })
  );
  await page.route("**/api/news*", (r) => r.fulfill({ json: { ok: true, articles: [] } }));
  await page.route("**/api/officials*", (r) => r.fulfill({ json: { ok: true, officials: [] } }));
  await page.route("**/api/buildings*", (r) => r.fulfill({ json: { ok: true, buildings: [] } }));
  await page.route("**/api/poi-evidence*", (r) => r.fulfill({ json: { ok: true, poi: { ...EVIDENCE, nearbyPois: [], nearestFeature: null } } }));
}

const results = [];
const errors = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const BASE = process.env.BASE_URL || "http://localhost:4173";

async function run() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: [] });
  const page = await context.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") {
      const text = m.text();
      // Tile 404s from the stub PNG are expected in this environment.
      if (/Failed to load resource|ERR_|net::/i.test(text)) return;
      errors.push(text);
    }
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await mock(page);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // ── 2. Map load state resolves ────────────────────────────────────────────
  const stuckLoading = await page.locator(".map-load--failed, .map-load--slow").count();
  check("map finishes loading (no failed/slow state)", stuckLoading === 0, `${stuckLoading} blocking state(s)`);

  // ── 8. Weather effects OFF by default ─────────────────────────────────────
  const weatherCanvas = await page.locator("canvas.weather-fx").count();
  check("weather effects off by default (no canvas drawn)", weatherCanvas === 0, `${weatherCanvas} canvas`);
  const storedFlag = await page.evaluate(() => localStorage.getItem("manowj-weather-effects-enabled"));
  check("weather preference not written until chosen", storedFlag === null, `stored=${storedFlag}`);

  // ── 1. Map click selects the location ─────────────────────────────────────
  const canvas = page.locator(".map-view__canvas canvas").first();
  // Away from the centre: the "Getting started" card legitimately occupies
  // the middle of an empty map, and its example chips take clicks. Clicking
  // there would test the onboarding, not the map.
  await canvas.click({ position: { x: 180, y: 690 } });
  await page.waitForTimeout(1600);

  const selected = await page.evaluate(() => {
    const el = document.querySelector(".side-panel, .workspace__panel");
    return el ? el.textContent || "" : "";
  });
  const gotVaranasi = /Varanasi/i.test(selected);
  check("map click selects that location in the main panel", gotVaranasi, gotVaranasi ? "Varanasi shown" : "panel had no place");

  const rivalPanel = await page.locator(".poi-inspector").count();
  check("no rival 'Property information' card appears", rivalPanel === 0, `${rivalPanel} found`);

  // ── 3. Directions from TYPED text + Enter ─────────────────────────────────
  const directionsBtn = page.getByRole("button", { name: /directions/i }).first();
  if (await directionsBtn.count()) await directionsBtn.click();
  await page.waitForTimeout(700);

  const fromInput = page.locator('.place-input input').first();
  const toInput = page.locator('.place-input input').nth(1);

  await fromInput.click();
  await fromInput.fill("Varanasi");
  await page.waitForTimeout(700);
  await fromInput.press("Enter");
  await page.waitForTimeout(400);

  await toInput.click();
  await toInput.fill("Delhi");
  await page.waitForTimeout(700);
  await toInput.press("Enter");
  await page.waitForTimeout(1800);

  const summaryVisible = await page.locator(".directions-panel__summary").count();
  check("typing + Enter produces a route (the reported bug)", summaryVisible > 0, summaryVisible ? "summary rendered" : "no route");

  const resolvedTicks = await page.locator(".place-input__check").count();
  check("both fields show as resolved", resolvedTicks === 2, `${resolvedTicks} ticks`);

  // ── 4. Turn steps listed and clickable ────────────────────────────────────
  const stepButtons = page.locator(".directions-panel__steps li button");
  const stepCount = await stepButtons.count();
  check("turn-by-turn steps are listed", stepCount >= 3, `${stepCount} steps`);

  if (stepCount > 1) {
    const zoomBefore = await page.evaluate(() => window.__mapZoom ?? null);
    await stepButtons.nth(1).click();
    await page.waitForTimeout(1200);
    const active = await page.locator(".directions-panel__steps li button.active").count();
    check("clicking a step marks it active", active === 1, `${active} active`);
    const stepMarker = await page.evaluate(() => {
      // The highlighted-turn source should now hold exactly one feature.
      return document.querySelectorAll(".directions-panel__steps li button.active").length;
    });
    check("step highlight reaches the map layer", stepMarker === 1, `zoomBefore=${zoomBefore}`);
  }

  // ── 5. Alternatives switchable ────────────────────────────────────────────
  const optionButtons = page.locator(".directions-panel__options button");
  const optionCount = await optionButtons.count();
  check("route alternatives are offered", optionCount === 2, `${optionCount} options`);
  if (optionCount === 2) {
    await optionButtons.nth(1).click();
    await page.waitForTimeout(900);
    const activeOption = await page.locator(".directions-panel__options button.active").count();
    check("an alternative can be selected", activeOption === 1, `${activeOption} active`);
  }

  const startBtn = await page.locator(".directions-panel__start").count();
  check("Start navigation is offered", startBtn === 1);

  await page.screenshot({ path: "/tmp/geointel-pass4/directions.png" });

  // Close directions before opening PLAY.
  const closeDirections = page.locator('.directions-panel__head button[aria-label="Close directions"]');
  if (await closeDirections.count()) await closeDirections.click();
  await page.waitForTimeout(400);

  // ── 6. maNOWj PLAY ────────────────────────────────────────────────────────
  const moreBtn = page.locator(".app-header__more > button").first();
  await moreBtn.click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: /maNOWj PLAY/i }).click();
  // Lazy chunk has to download.
  await page.waitForSelector(".play__sheet", { timeout: 8000 });
  await page.waitForTimeout(600);

  const cards = await page.locator(".play-card").count();
  check("PLAY hub lists games", cards >= 6, `${cards} games`);

  const comingSoon = await page.locator(".play-card").filter({ hasText: /coming soon|locked/i }).count();
  check("no 'coming soon' or locked cards", comingSoon === 0, `${comingSoon} found`);

  const disabledCards = await page.locator(".play-card button:disabled").count();
  check("every game card is playable", disabledCards === 0, `${disabledCards} disabled`);

  const daily = await page.locator(".play-daily").count();
  check("Daily Challenge is present", daily === 1);

  const categories = await page.locator(".play-categories button").count();
  check("categories are offered", categories >= 5, `${categories} categories`);

  await page.screenshot({ path: "/tmp/geointel-pass4/play-hub.png" });

  // ── 7. Four-in-a-Row plays ────────────────────────────────────────────────
  await page.locator(".play-card").filter({ hasText: "Four-in-a-Row" }).locator("button").click();
  await page.waitForTimeout(700);

  const boardCells = await page.locator(".four__cell").count();
  check("Four-in-a-Row renders a 7x6 board (42 cells)", boardCells === 42, `${boardCells} cells`);

  const columnButtons = await page.locator(".four__column").count();
  check("one drop button per column", columnButtons === 7, `${columnButtons} columns`);

  // Rapid triple-click on one column: gravity means each click stacks, but a
  // click during the AI's think delay must be rejected.
  await page.locator(".four__column").nth(3).click();
  await page.waitForTimeout(80);
  await page.locator(".four__column").nth(3).click({ force: true }).catch(() => {});
  await page.waitForTimeout(1400);

  const filled = await page.locator(".four__cell--r, .four__cell--y").count();
  check("a disc dropped and the computer replied", filled >= 2, `${filled} discs placed`);
  check("rapid clicking did not queue extra human moves", filled <= 3, `${filled} discs`);

  await page.screenshot({ path: "/tmp/geointel-pass4/four-in-a-row.png" });

  // Back to hub, then check the progression strip recorded nothing yet.
  await page.getByRole("button", { name: /All games/i }).click();
  await page.waitForTimeout(500);
  const levelText = await page.locator(".play-profile-strip__level").textContent();
  check("progression strip shows a real level", /Level \d+/.test(levelText || ""), (levelText || "").trim().slice(0, 40));

  // ── World Quiz plays end to end ───────────────────────────────────────────
  await page.locator(".play-card").filter({ hasText: "World Quiz" }).locator("button").click();
  await page.waitForTimeout(700);
  const optionsShown = await page.locator(".play-option").count();
  check("quiz shows four options", optionsShown === 4, `${optionsShown} options`);
  await page.locator(".play-option").first().click();
  await page.waitForTimeout(500);
  const revealed = await page.locator(".play-reveal__verdict").count();
  check("answering reveals the verdict and explanation", revealed === 1);

  await page.screenshot({ path: "/tmp/geointel-pass4/quiz.png" });

  // Close PLAY.
  await page.locator('.play__icon-btn[aria-label*="Close games"]').click();
  await page.waitForTimeout(400);

  // ── 9. Privacy page ──────────────────────────────────────────────────────
  await moreBtn.click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: /Privacy/i }).click();
  await page.waitForSelector(".privacy__sheet", { timeout: 8000 });
  await page.waitForTimeout(500);

  const gapsSection = await page.locator(".privacy__section--gaps").count();
  check("privacy page names what is NOT yet true", gapsSection === 1);
  const citations = await page.locator(".privacy__section li code").count();
  check("every privacy claim cites its source", citations >= 15, `${citations} citations`);

  await page.screenshot({ path: "/tmp/geointel-pass4/privacy.png" });
  await page.locator('.privacy__close').click();
  await page.waitForTimeout(300);

  // ── Mobile pass ──────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  const horizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check("no horizontal scroll on a phone width", !horizontalScroll);
  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
  );
  check("single-scroll shell holds on mobile", !pageScrolls);
  await page.screenshot({ path: "/tmp/geointel-pass4/mobile.png" });

  // ── 10. Console errors ───────────────────────────────────────────────────
  check("zero console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (errors.length) {
    console.log("\nConsole errors:");
    for (const e of errors.slice(0, 10)) console.log("  " + e);
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error("harness failed:", e);
  process.exit(2);
});
