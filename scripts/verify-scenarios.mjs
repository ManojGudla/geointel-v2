import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/**
 * The twelve user scenarios from the launch brief, driven end to end
 * against the real app with only the network mocked (this container can't
 * reach Nominatim/Overpass/tile hosts). Everything below the mock boundary
 * is the app's genuine code path.
 */
mkdirSync('/tmp/geointel-shots', { recursive: true });

const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const LOCATION = { lat:17.361664, lon:78.474663, displayName:'Charminar, Hyderabad, Telangana, India', name:'Charminar',
  address:{city:'Hyderabad',state:'Telangana',country:'India',postcode:'500002'}, source:'OpenStreetMap / Nominatim' };
const FEATURES = Array.from({length:60},(_,i)=>({
  id:`f${i}`, lat:17.3585+(i%8)*0.0009, lon:78.4715+Math.floor(i/8)*0.0009, name:`F${i}`,
  tags: i%5===0?{amenity:'restaurant'}: i%5===1?{shop:'clothes'}: i%5===2?{building:'residential'}: i%5===3?{leisure:'park'}:{amenity:'hospital'},
}));
const EVIDENCE = { trust:'verified', radiusMeters:250,
  counts:{buildings:412,shops:137,offices:24,residential:288,industrial:3,institutional:19,amenities:96,tourism:11,transport:28},
  scores:{commercial:74,residential:52,institutional:18,industrial:3,landmark:41,transport:33},
  features:FEATURES, source:'OpenStreetMap / Overpass', fetchedAt:new Date().toISOString() };

async function mock(page) {
  await page.route('**/api/**', r => r.fulfill({ json:{ ok:true } }));
  await page.route('**/*.png', r => r.fulfill({ status:200, contentType:'image/png', body:TILE }));
  await page.route('**/*.jpg', r => r.fulfill({ status:200, contentType:'image/jpeg', body:TILE }));
  await page.route('**/api/health*', r => r.fulfill({ json:{ ok:true, status:'online' } }));
  await page.route('**/api/reverse-geocode*', r => r.fulfill({ json:{ ok:true, location:LOCATION } }));
  await page.route('**/api/geocode*', r => r.fulfill({ json:{ ok:true, results:[{ lat:LOCATION.lat, lon:LOCATION.lon, name:'Charminar', displayName:LOCATION.displayName, type:'monument', importance:0.8 }] } }));
  await page.route('**/api/gis*', r => r.fulfill({ json:{ ok:true, evidence:EVIDENCE } }));
  await page.route('**/api/nearby*', r => r.fulfill({ json:{ ok:true, items:
    Array.from({length:13},(_,i)=>({id:`n${i}`,name:`Clinic ${i+1}`,category:'hospitals',lat:17.361+(i%4)*0.004-0.005,lon:78.474+Math.floor(i/4)*0.005-0.005,distanceMeters:250+i*140,tags:{}})) } }));
  await page.route('**/api/weather*', r => r.fulfill({ json:{ ok:true, weather:{ temperatureC:31, feelsLikeC:34, condition:'Mainly clear',
    humidityPct:48, windKph:12, precipitationMm:0, forecast:[], source:'Open-Meteo', fetchedAt:new Date().toISOString() } } }));
  await page.route('**/api/news*', r => r.fulfill({ json:{ ok:true, articles:[] } }));
  await page.route('**/api/officials*', r => r.fulfill({ json:{ ok:true, officials:[] } }));
  await page.route('**/api/buildings*', r => r.fulfill({ json:{ ok:true, buildings:[] } }));
  await page.route('**/api/live*', r => r.fulfill({ json:{ ok:true, europeanAqi:38, pm25:14.3, pm10:38.1, no2:12.4, ozone:52,
    observedAt:'2026-09-02T12:00', source:'Open-Meteo Air Quality (CAMS)', fetchedAt:new Date().toISOString(), events:[] } }));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = [];

/** Reads live state out of the running MapLibre instance via the React tree. */
const MAP_PROBE = `(() => {
  const el = document.querySelector('.map-view__canvas');
  const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  let f = el[k], d = 0;
  while (f && d < 40) {
    let h = f.memoizedState, i = 0;
    while (h && i < 60) {
      const s = h.memoizedState;
      if (s && typeof s === 'object' && 'current' in s && s.current && typeof s.current.getStyle === 'function') return s.current;
      h = h.next; i++;
    }
    f = f.return; d++;
  }
  return null;
})()`;

async function scenario(name, fn) {
  const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0,160)));
  page.on('console', m => { if (m.type()==='error' && !/TUNNEL|ERR_/.test(m.text())) errors.push(m.text().slice(0,120)); });
  await mock(page);
  await page.goto('http://localhost:5173/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2600);
  let outcome;
  try { outcome = await fn(page); } catch (e) { outcome = 'THREW: ' + e.message.split('\n')[0]; }
  await page.screenshot({ path:`/tmp/geointel-shots/s-${name}.png` });
  results.push({ name, outcome, errors: errors.length ? errors.slice(0,2) : 'none' });
  await ctx.close();
}

const selectCharminar = async (p) => {
  await p.fill('.search-bar__input', 'Charminar');
  await p.waitForTimeout(900);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2200);
};

await scenario('01-first-run', async p => ({
  onboardingVisible: await p.locator('.onboarding__card').isVisible(),
  headline: (await p.textContent('.onboarding__headline'))?.replace(/\s+/g,' ').trim(),
  examples: await p.locator('.onboarding__examples button').count(),
  panelClosed: (await p.locator('.side-panel').count()) === 0,
}));

await scenario('02-search', async p => {
  await selectCharminar(p);
  return {
    panelOpened: await p.locator('.side-panel').isVisible(),
    panelTitle: await p.textContent('.side-panel__title'),
    intelligenceScore: await p.textContent('.li__score strong').catch(()=>'MISSING'),
    onboardingGone: (await p.locator('.onboarding__card').count()) === 0,
  };
});

await scenario('03-ask-hospitals', async p => {
  await selectCharminar(p);
  await p.fill('.search-bar__input', 'hospitals within 2 km');
  await p.waitForTimeout(700);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2600);
  const radiusText = await p.textContent('.radius-selector__current strong').catch(()=>null);
  await p.click('.nav-rail__item:has-text("Data")');
  await p.waitForTimeout(600);
  return {
    found: await p.textContent('.analysis__stats dd').catch(()=>'MISSING'),
    radiusOnMap: await p.textContent('.radius-selector__current strong'),
    hospitalLayerOn: await p.isChecked('.layer-manager__list input >> nth=0').catch(()=>'n/a'),
    radiusBefore: radiusText,
  };
});

await scenario('04-suitability', async p => {
  await selectCharminar(p);
  await p.click('.nav-rail__item:has-text("Analyze")');
  await p.waitForTimeout(500);
  await p.click('.analysis__ops button:has-text("Suitability")');
  await p.click('.analysis__run');
  await p.waitForTimeout(2600);
  return {
    score: await p.textContent('.analysis__score').catch(()=>'MISSING'),
    factors: await p.locator('.analysis__factors li').count(),
    hasBasis: (await p.locator('.analysis__factor-basis').count()) > 0,
    hasNote: (await p.textContent('.analysis__note'))?.slice(0,60),
  };
});

await scenario('05-06-layers', async p => {
  await selectCharminar(p);
  await p.click('.nav-rail__item:has-text("Data")');
  await p.waitForTimeout(700);
  await p.click('.layer-group__toggle:has-text("Places & business")');
  await p.waitForTimeout(400);
  const map = async () => p.evaluate(`(${MAP_PROBE}).queryRenderedFeatures({layers:['geointel-gis-points']}).length`);
  const before = await map();
  await p.click('.layer-manager__list input[type=checkbox] >> nth=2');
  await p.waitForTimeout(900);
  const afterOn = await map();
  await p.click('.layer-manager__list input[type=checkbox] >> nth=2');
  await p.waitForTimeout(900);
  return { markersInitially: before, afterToggleOn: afterOn, afterToggleOff: await map() };
});

await scenario('07-3d', async p => {
  await selectCharminar(p);
  await p.click('.nav-rail__item:has-text("Data")');
  await p.waitForTimeout(600);
  await p.click('.map-controls__3d');
  await p.waitForTimeout(1600);
  return {
    pitch: await p.evaluate(`(${MAP_PROBE}).getPitch()`),
    customLayersSurvived: await p.evaluate(`(${MAP_PROBE}).getStyle().layers.filter(l=>l.id.startsWith('geointel')).length`),
    buildingsStatus: (await p.textContent('.buildings-status__text'))?.slice(0,70),
  };
});

await scenario('08-measure', async p => {
  await selectCharminar(p);
  await p.click('.nav-rail__item:has-text("Analyze")');
  await p.waitForTimeout(500);
  await p.click('.measure-toolbar__modes button:has-text("Area")');
  for (const [x,y] of [[820,380],[1050,380],[1050,600],[820,600]]) { await p.mouse.click(x,y); await p.waitForTimeout(180); }
  await p.waitForTimeout(700);
  return {
    readout: await p.textContent('.measure-hud__value strong'),
    renderedOnMap: await p.evaluate(`(${MAP_PROBE}).queryRenderedFeatures({layers:['geointel-measure-fill','geointel-measure-line']}).length`),
  };
});

await scenario('10-11-copilot-context', async p => {
  await selectCharminar(p);
  await p.click('.copilot-launcher');
  await p.waitForTimeout(900);
  return {
    context: await p.textContent('.copilot-panel__context'),
    suggestions: await p.locator('.copilot-panel__suggestions button').count(),
    firstSuggestion: await p.textContent('.copilot-panel__suggestions button >> nth=0'),
  };
});

await scenario('12-report', async p => {
  await selectCharminar(p);
  await p.click('.nav-rail__item:has-text("Intelligence")');
  await p.waitForTimeout(700);
  await p.click('.side-panel__cta:has-text("Generate area report")');
  await p.waitForTimeout(1800);
  return {
    title: await p.textContent('.report__head h1'),
    sections: await p.locator('.report__section').count(),
    hasRealCounts: (await p.textContent('.report')).includes('412'),
  };
});

await scenario('kbd-escape', async p => {
  await selectCharminar(p);
  const openAfterSelect = await p.locator('.side-panel').isVisible();
  await p.click('.workspace__stage');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const afterEscape = await p.locator('.side-panel').count();
  await p.keyboard.press('l');
  await p.waitForTimeout(500);
  return { openAfterSelect, closedByEscape: afterEscape === 0, reopenedByL: await p.textContent('.side-panel__title').catch(()=>'MISSING') };
});

console.log(JSON.stringify(results, null, 1));
await browser.close();
