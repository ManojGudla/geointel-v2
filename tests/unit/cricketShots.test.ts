import { describe, expect, it } from "vitest";
import { createRng } from "@/features/play/lib/random";
import { resolveShot, shotFromKey, shotFromSwipe, suitedDirections, applyWide, applyNoBall, isNoBall, protectFromDismissal, NO_BALL_CHANCE } from "@/features/play/games/cricket/shots";
import type { Delivery } from "@/features/play/games/cricket/timing";

const ball = (length: Delivery["length"], forgiveness = 1): Delivery => ({ bowler: "medium", length, travelMs: 1200, forgiveness, speedKph: 60 });

describe("shot input", () => {
  it("reads swipes: left off side, right leg side, down defends, long goes over the top", () => {
    expect(shotFromSwipe(-80, -20, false)).toEqual({ dir: "off", kind: "ground" });
    expect(shotFromSwipe(80, -20, false)).toEqual({ dir: "leg", kind: "ground" });
    expect(shotFromSwipe(0, -60, false)).toEqual({ dir: "straight", kind: "ground" });
    expect(shotFromSwipe(5, 70, false).kind).toBe("defend");
    expect(shotFromSwipe(-200, -60, false).kind).toBe("loft");
  });

  it("reads keys, with Shift to loft", () => {
    expect(shotFromKey("ArrowLeft", false, false)).toEqual({ dir: "off", kind: "ground" });
    expect(shotFromKey("ArrowRight", true, false)).toEqual({ dir: "leg", kind: "loft" });
    expect(shotFromKey("ArrowDown", false, false)?.kind).toBe("defend");
    expect(shotFromKey("KeyQ", false, false)).toBeNull();
  });
});

describe("shot outcomes", () => {
  it("a perfectly timed loft that suits the ball goes for six; on the ground it is four", () => {
    const rng = createRng("six");
    expect(resolveShot(0, ball("good"), { dir: "straight", kind: "loft" }, 0, rng).outcome).toBe(6);
    expect(resolveShot(0, ball("good"), { dir: "straight", kind: "ground" }, 0, createRng("4")).outcome).toBe(4);
  });

  it("defending never scores more than a single", () => {
    for (let i = 0; i < 50; i++) {
      const r = resolveShot((i % 7) * 20, ball("good"), { dir: "straight", kind: "defend" }, 0, createRng(i));
      expect(r.outcome === "out" || (typeof r.outcome === "number" && r.outcome <= 1)).toBe(true);
    }
  });

  it("playing across the line costs timing quality", () => {
    expect(suitedDirections("short", 0)).toEqual(["leg"]);
    const suited = resolveShot(0, ball("short"), { dir: "leg", kind: "ground" }, 0, createRng("a"));
    const across = resolveShot(0, ball("short"), { dir: "off", kind: "ground" }, 0, createRng("a"));
    expect(suited.contact).toBe("perfect");
    expect(across.contact).toBe("great");
    expect(across.suited).toBe(false);
  });

  it("lofting is riskier than keeping it on the ground", () => {
    let loftOuts = 0;
    let groundOuts = 0;
    for (let i = 0; i < 400; i++) {
      if (resolveShot(160, ball("good"), { dir: "straight", kind: "loft" }, 0, createRng(`l${i}`)).outcome === "out") loftOuts++;
      if (resolveShot(160, ball("good"), { dir: "straight", kind: "ground" }, 0, createRng(`g${i}`)).outcome === "out") groundOuts++;
    }
    expect(loftOuts).toBeGreaterThan(groundOuts);
  });

  it("every scoring shot says where the ball went, for the aerial camera", () => {
    for (let i = 0; i < 60; i++) {
      const r = resolveShot((i % 9) * 25 - 100, ball("full"), { dir: "off", kind: "ground" }, 0.15, createRng(`x${i}`));
      if (typeof r.outcome === "number" && r.outcome > 0) expect(r.landing).not.toBeNull();
    }
  });

  it("a wide adds one run without using up a ball", () => {
    const s = { runs: 10, wickets: 0, ballsBowled: 4, totalBalls: 18, maxWickets: 3, target: 30, history: [] };
    const w = applyWide(s);
    expect(w.runs).toBe(11);
    expect(w.ballsBowled).toBe(4);
  });
});

/*
  Added 26 November 2026, when the owner reported the game as very hard to
  play and asked for it to be more interesting.
*/
describe("Easy: only the moment counts", () => {
  it("lets any direction meet the ball cleanly on Easy, while Normal still charges for going across the line", () => {
    const easy = resolveShot(0, ball("short"), { dir: "off", kind: "ground" }, 0, createRng("e"), { anyDirection: true });
    const normal = resolveShot(0, ball("short"), { dir: "off", kind: "ground" }, 0, createRng("e"));
    expect(easy.contact).toBe("perfect");
    expect(normal.contact).toBe("great");
  });
});

describe("no-balls and free hits", () => {
  const state = { runs: 10, wickets: 1, ballsBowled: 7, totalBalls: 18, maxWickets: 3, target: 30, history: [] };

  it("cannot get you out: a catch becomes a run, anything else a dot", () => {
    const caught = resolveShot(140, ball("good"), { dir: "straight", kind: "loft" }, 0, createRng("c"));
    const forced = { ...caught, outcome: "out" as const, howOut: "caught" as const };
    const saved = protectFromDismissal(forced, "free-hit");
    expect(saved.outcome).toBe(1);
    expect(saved.howOut).toBeUndefined();
    expect(saved.detail).toContain("free hit");
    const bowled = { ...forced, howOut: "bowled" as const };
    expect(protectFromDismissal(bowled, "no-ball").outcome).toBe(0);
  });

  it("leaves a ball that was not out exactly as it was", () => {
    const four = resolveShot(0, ball("good"), { dir: "straight", kind: "ground" }, 0, createRng("4"));
    expect(protectFromDismissal(four, "no-ball")).toBe(four);
  });

  it("adds one for the no-ball plus whatever came off the bat, uses no ball, and makes the next one a free hit", () => {
    const four = resolveShot(0, ball("good"), { dir: "straight", kind: "ground" }, 0, createRng("4"));
    const next = applyNoBall(state, four);
    expect(next.runs).toBe(15);
    expect(next.ballsBowled).toBe(7);
    expect(next.wickets).toBe(1);
    expect(next.freeHit).toBe(true);
    expect(next.extras).toBe(1);
  });

  it("keeps a free hit due through a wide, as the Laws do", () => {
    expect(applyWide({ ...state, freeHit: true }).freeHit).toBe(true);
  });

  it("happens about as often as in a real match: rare, and rarest from spin", () => {
    expect(NO_BALL_CHANCE.spin).toBeLessThan(NO_BALL_CHANCE.pace);
    const rng = createRng("nb");
    let n = 0;
    for (let i = 0; i < 20000; i++) if (isNoBall({ ...ball("good"), bowler: "pace" }, rng)) n++;
    expect(n / 20000).toBeGreaterThan(0.04);
    expect(n / 20000).toBeLessThan(0.06);
  });
});

