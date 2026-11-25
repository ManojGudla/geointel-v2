import { expect, test } from "@playwright/test";
import { HITEC, skipNotices, stubApi } from "./fixtures";

/**
 * MOCK end-to-end journeys: the real built site in a real browser, with the
 * API answered by tests/e2e/fixtures.ts. They prove the screens and the
 * wiring work on a phone and a desktop, not that any provider is right.
 */

test.beforeEach(async ({ page }) => {
  await skipNotices(page);
  await stubApi(page);
});

test("the home page loads without errors and offers search and All tools", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByPlaceholder(/Type an address or a question/)).toBeVisible();
  await expect(page.getByRole("button", { name: /All tools|Tools/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a shared link opens the place in the AI section, and the agents answer together with evidence", async ({ page }) => {
  await page.goto(`/?lat=${HITEC.lat}&lon=${HITEC.lon}&s=ai`);
  const team = page.getByRole("region", { name: "Ask the agents together" });
  const box = team.getByLabel("What should the agents do?");
  await expect(box).toBeEnabled();
  await box.fill("Evaluate this place for a family home and plan a route to the nearest hospital");
  await team.getByRole("button", { name: "Ask", exact: true }).click();

  await expect(page.getByText("Understood:")).toBeVisible();
  await expect(page.getByRole("list", { name: "Agents involved" })).toContainText("GIS Intelligence");
  await expect(page.getByText("Writing the report (AI model, one request for all agents): done, 6.1 s")).toBeVisible();

  await page.getByRole("button", { name: "Show evidence E4" }).click();
  await expect(page.locator(".agent-evidence__item.is-highlighted")).toContainText("Route distance");
  await expect(page.getByRole("button", { name: "Show the route to Care Clinic on the map" })).toBeVisible();
});

test("a provider that is down is reported, not hidden: the trip builder says nothing could be planned", async ({ page }) => {
  await page.goto(`/?lat=${HITEC.lat}&lon=${HITEC.lon}&s=ai`);
  await page.getByText("Make My Trip: build a day-by-day plan").click();
  await page.getByRole("button", { name: "Build plan" }).click();
  // /api/ai/trip has no fixture, so it answers 503 like a provider outage.
  await expect(page.getByRole("alert")).toBeVisible();
});

test("Fly maNOWj: crashing shows the angry face on the game-over card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: /maNOWj PLAY/i }).click();
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  const canvas = page.locator("canvas.fly__canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const face = page.locator(".fly__over-face");
  await expect(face).toBeVisible({ timeout: 20_000 });
  expect(await face.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(360);
});
