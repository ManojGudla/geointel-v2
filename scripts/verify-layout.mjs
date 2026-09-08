import { chromium } from 'playwright';

/**
 * Layout + interaction verification against the real app with the network
 * mocked, because this container can't reach Nominatim/Overpass/tile hosts.
 * Everything below the mock boundary is the app's genuine code path.
 */
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const LOCATION = {
  ok: true, lat: 17.385044, lon: 78.486671,
  displayName: 'Charminar, Hyderabad, Telangana, 500002, India',
  name: 'Charminar',
  address: { city: 'Hyderabad', state: 'Telangana', country: 'India', postcode: '500002' },
  source: 'OpenStreetMap / Nominatim',
};

/**
 * Playwright matches routes LAST-registered-first, so the catch-all has to
 * be registered before the specific handlers or it swallows every request —
 * which is exactly what made the first run of this harness report "search
 * unavailable" against working code.
 */
async function mock(page) {
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }));

  await page.route('**/*.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await page.route('**/tile/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await page.route('**/api/health*', r => r.fulfill({ json: { ok: true, status: 'online' } }));
  await page.route('**/api/reverse-geocode*', r => r.fulfill({ json: { ok: true, location: LOCATION } }));
  await page.route('**/api/geocode*', r => r.fulfill({
    json: { ok: true, results: [{ lat: 17.385044, lon: 78.486671, name: 'Charminar', displayName: LOCATION.displayName, type: 'monument', importance: 0.8 }] },
  }));
  await page.route('**/api/gis*', r => r.fulfill({
    json: { ok: true, evidence: {
      trust: 'high', radiusMeters: 250,
      counts: { buildings: 412, shops: 137, offices: 24, residential: 288, industrial: 3, institutional: 19, amenities: 96, tourism: 11, transport: 28 },
      scores: { commercial: 74, residential: 52, institutional: 18, industrial: 3, landmark: 41, transport: 33 },
      features: Array.from({ length: 40 }, (_, i) => ({
        id: `n${i}`, lat: 17.385 + (i % 8) * 0.0009, lon: 78.4866 + Math.floor(i / 8) * 0.0009,
        name: `Feature ${i}`, tags: { amenity: ['school', 'hospital', 'restaurant', 'bank'][i % 4] },
      })),
      source: 'OpenStreetMap / Overpass', fetchedAt: new Date().toISOString(),
    } },
  }));
  await page.route('**/api/weather*', r => r.fulfill({
    json: { ok: true, weather: {
      temperatureC: 31, feelsLikeC: 34, condition: 'Mainly clear', humidityPct: 48, windKph: 12, precipitationMm: 0,
      forecast: [
        { date: '2026-09-02', maxC: 33, minC: 24, condition: 'Mainly clear' },
        { date: '2026-09-03', maxC: 32, minC: 24, condition: 'Light rain' },
        { date: '2026-09-04', maxC: 30, minC: 23, condition: 'Overcast' },
      ],
      source: 'Open-Meteo', fetchedAt: new Date().toISOString(),
    } },
  }));
  await page.route('**/api/news*', r => r.fulfill({ json: { ok: true, articles: [] } }));
  await page.route('**/api/nearby*', r => r.fulfill({ json: { ok: true, items: [] } }));
  await page.route('**/api/officials*', r => r.fulfill({ json: { ok: true, officials: [] } }));
  await page.route('**/api/buildings*', r => r.fulfill({ json: { ok: true, buildings: [] } }));
}

import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/geointel-shots', { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = [];

async function run(name, width, height, steps) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errors.push(m.text().slice(0, 160)); });
  await mock(page);
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await steps(page);
  const scroll = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
        bad.push(el.className?.toString().split(' ')[0] || el.tagName);
      }
    });
    return { pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 2, verticalScrollers: bad };
  });
  await page.screenshot({ path: `/tmp/geointel-shots/v-${name}.png` });
  results.push({ name, ...scroll, errors: errors.slice(0, 3) });
  await ctx.close();
}

const search = async (page) => {
  await page.fill('.search-bar__input', 'Charminar');
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
};

await run('desktop-place', 1440, 900, search);
await run('desktop-layers', 1440, 900, async (page) => {
  await search(page);
  await page.click('.nav-rail__item:has-text("Layers")');
  await page.waitForTimeout(700);
});
await run('desktop-tools', 1440, 900, async (page) => {
  await search(page);
  await page.click('.nav-rail__item:has-text("Tools")');
  await page.waitForTimeout(400);
  await page.click('.measure-toolbar__modes button:has-text("Area")');
  await page.waitForTimeout(400);
  for (const [x, y] of [[820, 380], [1000, 380], [1000, 560], [820, 560]]) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(600);
});
await run('mobile-place', 390, 844, async (page) => {
  await search(page);
  await page.click('.nav-rail__item:has-text("Place")');
  await page.waitForTimeout(700);
});
// On a phone the panel starts closed so the map is unobstructed; open it,
// then dismiss it, to prove both directions work from the rail.
await run('mobile-map', 390, 844, async (page) => {
  await search(page);
  await page.click('.nav-rail__item:has-text("Place")');
  await page.waitForTimeout(600);
  await page.click('.side-panel__close');
  await page.waitForTimeout(500);
});

console.log(JSON.stringify(results, null, 1));
await browser.close();
