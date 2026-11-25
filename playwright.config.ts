import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: the built site in a real browser, on a phone-sized and a
 * desktop-sized screen. `npm run e2e`.
 *
 * The API is stubbed inside each test (tests/e2e/fixtures.ts), so these are
 * MOCK tests of the user journeys, not of the providers; the live agent
 * checks are scripts/agent-acceptance.mjs. In CI, Playwright's own Chromium
 * is installed by the workflow. Elsewhere, PW_CHROME can point at an
 * installed Chrome instead.
 */
const executablePath = process.env.PW_CHROME || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
