import { describe, expect, it } from "vitest";
import { placeCard } from "@/features/tour/FeatureTour";

const card = { width: 340, height: 190 };
const view = { width: 833, height: 952 };

function onScreen(pos: { top: number; left: number }) {
  expect(pos.top).toBeGreaterThanOrEqual(12);
  expect(pos.left).toBeGreaterThanOrEqual(12);
  expect(pos.top + card.height).toBeLessThanOrEqual(view.height - 12);
  expect(pos.left + card.width).toBeLessThanOrEqual(view.width - 12);
}

describe("tour card placement", () => {
  it("goes below a small target near the top", () => {
    const pos = placeCard({ top: 100, left: 600, width: 200, height: 44 }, card, view);
    expect(pos.top).toBe(156);
    onScreen(pos);
  });

  it("goes above a target near the bottom", () => {
    const pos = placeCard({ top: 850, left: 600, width: 120, height: 44 }, card, view);
    expect(pos.top + card.height).toBeLessThanOrEqual(850);
    onScreen(pos);
  });

  it("goes beside a full-height target instead of off the top of the screen", () => {
    // The nav rail: this case used to render the card above y=0, cut off.
    const pos = placeCard({ top: 74, left: 0, width: 126, height: 870 }, card, view);
    expect(pos.left).toBeGreaterThanOrEqual(126);
    onScreen(pos);
  });

  it("stays fully on screen when no side has room", () => {
    const pos = placeCard({ top: 0, left: 0, width: 833, height: 952 }, card, view);
    onScreen(pos);
  });
});
