/**
 * Measures first paint under throttling, against a local production build.
 *
 * Exists because a previous performance change in this project was
 * recommended on the strength of two screenshots and turned out to be wrong —
 * the "slow" tile server was returning tiles in 10ms. Nothing here is
 * reported unless it came off a stopwatch.
 *
 * Conditions match what PageSpeed calls Slow 4G: about 1.6 Mbps down, 150ms
 * round trip, and a 4x CPU slowdown to stand in for a mid-range phone.
 */
import { chromium } from "playwright";

const URL = process.env.TARGET ?? "http://localhost:4173/";
const RUNS = Number(process.env.RUNS ?? 3);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const samples = [];

for (let i = 0; i < RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // A cold visit is the one that matters; a warm cache hides exactly the
  // problem being measured.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  const fcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const done = (v) => resolve(Math.round(v));
        const existing = performance.getEntriesByName("first-contentful-paint")[0];
        if (existing) return done(existing.startTime);
        new PerformanceObserver((list, obs) => {
          const entry = list.getEntries().find((e) => e.name === "first-contentful-paint");
          if (entry) {
            obs.disconnect();
            done(entry.startTime);
          }
        }).observe({ type: "paint", buffered: true });
        setTimeout(() => done(-1), 25_000);
      })
  );

  // Largest Contentful Paint and the point the app became interactive. FCP is
  // answered by the static fallback in index.html and barely moves with bundle
  // size; these two are what actually change.
  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(Math.round(last)), 6000);
      })
  );
  const interactive = await page.evaluate(() =>
    Math.round(performance.getEntriesByType("navigation")[0]?.domInteractive ?? -1)
  );

  // Bytes of JavaScript that had to arrive before that paint could happen.
  const blockingJs = await page.evaluate((paintAt) =>
    performance
      .getEntriesByType("resource")
      .filter((r) => /\.js(\?|$)/.test(r.name) && r.startTime < paintAt)
      .reduce((sum, r) => sum + (r.encodedBodySize || 0), 0), fcp);

  samples.push({ fcp, lcp, interactive, blockingJs });
  console.log(`  run ${i + 1}: FCP ${fcp}ms  LCP ${lcp}ms  interactive ${interactive}ms  ${Math.round(blockingJs / 1024)} KB JS`);
  await context.close();
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
  `\nMEDIAN  FCP ${median(samples.map((s) => s.fcp))}ms  ·  LCP ${median(
    samples.map((s) => s.lcp)
  )}ms  ·  interactive ${median(samples.map((s) => s.interactive))}ms  ·  ${Math.round(
    median(samples.map((s) => s.blockingJs)) / 1024
  )} KB JS before paint`
);
await browser.close();
