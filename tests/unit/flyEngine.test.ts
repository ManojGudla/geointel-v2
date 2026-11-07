import { describe, expect, it } from "vitest";
import { createFly, flap, hitsTower, medalFor, step, FLYER_X, TOWER_W, WORLD_H, GROUND_H, type FlyState } from "@/features/play/games/fly/flyEngine";

const rng = { next: () => 0.5 };

function run(s: FlyState, seconds: number, flapEvery?: number): FlyState {
  let t = 0;
  let sinceFlap = 0;
  while (t < seconds) {
    s = step(s, 1 / 60, rng);
    t += 1 / 60;
    sinceFlap += 1 / 60;
    if (flapEvery && sinceFlap >= flapEvery && s.phase === "playing") {
      s = flap(s);
      sinceFlap = 0;
    }
  }
  return s;
}

describe("Fly maNOWj", () => {
  it("hovers until the first tap, then falls under gravity", () => {
    const ready = run(createFly(), 1);
    expect(ready.phase).toBe("ready");
    const playing = flap(ready);
    expect(playing.phase).toBe("playing");
    expect(playing.vy).toBeLessThan(0);
    const later = run(playing, 0.6);
    expect(later.y).toBeGreaterThan(playing.y);
  });

  it("dies on the ground if nobody taps", () => {
    const s = run(flap(createFly()), 3);
    expect(s.phase).toBe("dead");
    expect(s.y).toBeLessThanOrEqual(WORLD_H - GROUND_H);
  });

  it("collides with a tower but not with the gap", () => {
    const tower = { x: FLYER_X - TOWER_W / 2, gapY: 300, gap: 150, passed: false, pin: null };
    expect(hitsTower(300, [tower])).toBe(false);
    expect(hitsTower(150, [tower])).toBe(true);
    expect(hitsTower(450, [tower])).toBe(true);
  });

  it("scores one point per tower passed", () => {
    let s = flap(createFly());
    s = { ...s, towers: [{ x: FLYER_X - TOWER_W - 25, gapY: s.y, gap: 400, passed: false, pin: null }] };
    s = step(s, 1 / 60, rng);
    expect(s.score).toBe(1);
    expect(s.events).toContain("point");
  });

  it("gives medals at 10, 20, 30 and 50", () => {
    expect(medalFor(9)).toBe("none");
    expect(medalFor(10)).toBe("bronze");
    expect(medalFor(20)).toBe("silver");
    expect(medalFor(30)).toBe("gold");
    expect(medalFor(50)).toBe("platinum");
  });

  it("caps a long frame so a background tab cannot teleport the flyer", () => {
    const s = flap(createFly());
    const after = step(s, 5, rng);
    expect(Math.abs(after.y - s.y)).toBeLessThan(40);
  });
});

describe("second chances", () => {
  it("keeps the score, clears the towers in front and shields the restart", async () => {
    const { revive, FLYER_X: X } = await import("@/features/play/games/fly/flyEngine");
    let s = createFly();
    s = { ...s, phase: "dead", score: 7, towers: [{ x: X - 10, gapY: 300, gap: 150, passed: true, pin: null }, { x: X + 300, gapY: 300, gap: 150, passed: false, pin: null }] };
    const r = revive(s);
    expect(r.phase).toBe("ready");
    expect(r.score).toBe(7);
    expect(r.towers).toHaveLength(1);
    expect(r.shield).toBeGreaterThan(1);
    expect(r.revives).toBe(1);
  });

  it("gives five a day and refills the next day", async () => {
    const { chancesLeft, spendChance, DAILY_CHANCES } = await import("@/features/play/games/fly/flyEngine");
    localStorage.clear();
    const day1 = new Date(2026, 10, 7, 12);
    expect(chancesLeft(day1)).toBe(DAILY_CHANCES);
    for (let i = 0; i < DAILY_CHANCES; i++) spendChance(day1);
    expect(chancesLeft(day1)).toBe(0);
    expect(spendChance(day1)).toBe(0);
    expect(chancesLeft(new Date(2026, 10, 8, 9))).toBe(DAILY_CHANCES);
  });
});
