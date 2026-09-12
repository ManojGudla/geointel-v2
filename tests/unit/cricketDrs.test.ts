import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  STUMP_HALF,
  STUMP_HEIGHT,
  computeTrajectory,
  impactVerdict,
  pitchingVerdict,
  reviewLbw,
  settleReview,
  umpireDecision,
  wicketsVerdict,
  type Trajectory,
} from "../../src/features/play/games/cricket/drs";
import { createRng } from "../../src/features/play/lib/random";
import { nextDelivery } from "../../src/features/play/games/cricket/timing";

/**
 * The review system is only worth having if its answers come from the ball.
 *
 * A DRS that rolls a die and prints a verdict teaches the player, within
 * about three reviews, that nothing they can see predicts the outcome. From
 * then on it is a coin toss with an animation in front of it, and the reviews
 * remaining counter is decoration.
 *
 * These tests hold the opposite property: that every decision is a function
 * of where the ball pitched, where it struck and where it was going, and that
 * the three tests of Law 36 are applied in the order the law applies them.
 */

/** A trajectory built by hand, so each test states exactly the geometry it is about. */
function traj(over: Partial<Trajectory> = {}): Trajectory {
  return {
    pitch: { x: 0, z: 5.8 },
    impact: { x: 0, y: 0.3, z: 0.7 },
    stumps: { x: 0, y: 0.4 },
    deviation: 0,
    length: "good",
    ...over,
  };
}

describe("the three tests, read off the geometry", () => {
  it("calls pitching by which side of the stumps it bounced", () => {
    expect(pitchingVerdict(traj({ pitch: { x: -STUMP_HALF - 0.05, z: 5.8 } }))).toBe("outside-leg");
    expect(pitchingVerdict(traj({ pitch: { x: 0, z: 5.8 } }))).toBe("in-line");
    expect(pitchingVerdict(traj({ pitch: { x: STUMP_HALF + 0.05, z: 5.8 } }))).toBe("outside-off");
  });

  it("calls impact against the line of off stump only", () => {
    // Outside LEG impact is still in-line for the purposes of this test; the
    // law has no outside-leg impact let-off, which people often assume it does.
    expect(impactVerdict(traj({ impact: { x: -0.3, y: 0.3, z: 0.7 } }))).toBe("in-line");
    expect(impactVerdict(traj({ impact: { x: STUMP_HALF + 0.01, y: 0.3, z: 0.7 } }))).toBe("outside-off");
  });

  it("separates hitting from clipping from missing", () => {
    // Dead centre, well under the bails.
    expect(wicketsVerdict(traj({ stumps: { x: 0, y: 0.3 } }))).toBe("hitting");
    // Centre inside the stumps but the ball overlaps the edge.
    expect(wicketsVerdict(traj({ stumps: { x: STUMP_HALF - BALL_RADIUS / 2, y: 0.3 } }))).toBe("clipping");
    // Nowhere near.
    expect(wicketsVerdict(traj({ stumps: { x: STUMP_HALF + BALL_RADIUS * 3, y: 0.3 } }))).toBe("missing");
    // Straight, but sailing over the top.
    expect(wicketsVerdict(traj({ stumps: { x: 0, y: STUMP_HEIGHT + BALL_RADIUS * 3 } }))).toBe("missing");
    // Straight and just brushing the bails.
    expect(wicketsVerdict(traj({ stumps: { x: 0, y: STUMP_HEIGHT - BALL_RADIUS / 2 } }))).toBe("clipping");
  });
});

describe("reviewLbw applies the tests in the order the law does", () => {
  it("pitching outside leg ends it, even when it would have smashed middle", () => {
    const t = traj({ pitch: { x: -STUMP_HALF - 0.06, z: 5.8 }, stumps: { x: 0, y: 0.25 } });
    const r = reviewLbw(t, false);
    expect(r.wickets).toBe("hitting");
    expect(r.verdict).toBe("not-out");
    expect(r.reason).toMatch(/outside leg/i);
  });

  it("impact outside off saves a batsman who played a shot", () => {
    const t = traj({ impact: { x: STUMP_HALF + 0.05, y: 0.3, z: 0.7 }, stumps: { x: 0, y: 0.25 } });
    expect(reviewLbw(t, true).verdict).toBe("not-out");
  });

  it("but not one who offered no stroke", () => {
    const t = traj({ impact: { x: STUMP_HALF + 0.05, y: 0.3, z: 0.7 }, stumps: { x: 0, y: 0.25 } });
    expect(reviewLbw(t, false).verdict).toBe("out");
  });

  it("gives it out when all three are clean", () => {
    const r = reviewLbw(traj({ stumps: { x: 0.01, y: 0.3 } }), true);
    expect(r.verdict).toBe("out");
    expect(r.reason).toMatch(/hitting/i);
  });

  it("returns umpire's call when it is only clipping", () => {
    const t = traj({ stumps: { x: STUMP_HALF - BALL_RADIUS / 2, y: 0.3 } });
    expect(reviewLbw(t, true).verdict).toBe("umpires-call");
  });
});

describe("what a review costs", () => {
  it("keeps the review when the decision is overturned", () => {
    const out = settleReview("out", { ...reviewLbw(traj({ stumps: { x: 0.5, y: 0.3 } }), true) });
    expect(out.finalDecision).toBe("not-out");
    expect(out.overturned).toBe(true);
    expect(out.reviewRetained).toBe(true);
    expect(out.headline).toBe("DECISION OVERTURNED");
  });

  it("spends the review when the decision is confirmed", () => {
    const out = settleReview("out", reviewLbw(traj({ stumps: { x: 0, y: 0.3 } }), true));
    expect(out.overturned).toBe(false);
    expect(out.reviewRetained).toBe(false);
    expect(out.headline).toBe("DECISION CONFIRMED");
  });

  it("costs nothing on umpire's call, and the on-field decision stands either way", () => {
    const clip = reviewLbw(traj({ stumps: { x: STUMP_HALF - BALL_RADIUS / 2, y: 0.3 } }), true);

    const givenOut = settleReview("out", clip);
    expect(givenOut.finalDecision).toBe("out");
    expect(givenOut.reviewRetained).toBe(true);

    // Same ball, opposite on-field call, opposite result. This is the rule
    // that makes the umpire's original decision matter.
    const givenNotOut = settleReview("not-out", clip);
    expect(givenNotOut.finalDecision).toBe("not-out");
    expect(givenNotOut.reviewRetained).toBe(true);
  });
});

describe("trajectories built from real deliveries", () => {
  it("puts each length where that length actually pitches", () => {
    const rng = createRng("lengths");
    const zByLength: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const d = nextDelivery("normal", rng);
      zByLength[d.length] = computeTrajectory(d, "straight", rng).pitch.z;
    }
    // A yorker lands at the batsman's feet; a bouncer is banged in short.
    if (zByLength.yorker !== undefined && zByLength.full !== undefined) {
      expect(zByLength.yorker).toBeLessThan(zByLength.full);
    }
    if (zByLength.good !== undefined && zByLength.bouncer !== undefined) {
      expect(zByLength.good).toBeLessThan(zByLength.bouncer);
    }
  });

  it("has a bouncer climbing over the stumps and a yorker under them", () => {
    const rng = createRng("heights");
    const bouncer = computeTrajectory(
      { bowler: "pace", length: "bouncer", travelMs: 500, forgiveness: 1, speedKph: 140 },
      "straight",
      rng
    );
    const yorker = computeTrajectory(
      { bowler: "pace", length: "yorker", travelMs: 500, forgiveness: 1, speedKph: 140 },
      "straight",
      rng
    );
    expect(bouncer.stumps.y).toBeGreaterThan(STUMP_HEIGHT);
    expect(yorker.stumps.y).toBeLessThan(0.1);
  });

  it("is fully determined by its inputs, so a replay shows what was decided", () => {
    const d = { bowler: "spin" as const, length: "good" as const, travelMs: 700, forgiveness: 1, speedKph: 85 };
    const a = computeTrajectory(d, "straight", createRng("same-seed"));
    const b = computeTrajectory(d, "straight", createRng("same-seed"));
    expect(a).toEqual(b);
    expect(reviewLbw(a, true)).toEqual(reviewLbw(b, true));
  });

  it("lets spin beat the stumps from a line that looked straight at impact", () => {
    // The case the whole system exists for: in line when it hits the pad,
    // missing by the time it reaches the stumps. No one can call this from
    // the naked eye, which is why it is worth a review.
    const t = traj({
      pitch: { x: -0.05, z: 5.8 },
      impact: { x: -0.02, y: 0.3, z: 0.7 },
      stumps: { x: -(STUMP_HALF + BALL_RADIUS * 2), y: 0.35 },
      deviation: -0.05,
    });
    expect(impactVerdict(t)).toBe("in-line");
    expect(reviewLbw(t, true).verdict).toBe("not-out");
  });
});

describe("the spread over a real innings", () => {
  /*
    A review system is only a game if the answer is in doubt. If almost every
    shout came back OUT, reviewing would be pointless; if almost none did,
    the umpire would be a joke and reviewing would be free. This walks a few
    thousand real deliveries and checks the three verdicts all turn up often
    enough to make spending a review a judgement call.

    Deliberately a range rather than a fixed number. It is guarding against
    a degenerate system, not pinning today's exact tuning, so it will not
    fail every time a length is nudged.
  */
  it("produces all three wickets verdicts often enough to be worth deciding about", () => {
    const rng = createRng("innings-spread");
    const counts = { hitting: 0, clipping: 0, missing: 0 };
    const total = 3000;

    for (let i = 0; i < total; i++) {
      const d = nextDelivery("normal", rng);
      const aim = (["leg", "straight", "off"] as const)[Math.floor(rng.next() * 3)]!;
      counts[wicketsVerdict(computeTrajectory(d, aim, rng))]++;
    }

    // None of the three may vanish.
    expect(counts.hitting).toBeGreaterThan(total * 0.05);
    expect(counts.missing).toBeGreaterThan(total * 0.05);
    // Umpire's call is meant to be the narrow band, but it has to exist.
    expect(counts.clipping).toBeGreaterThan(total * 0.005);
    // And no single verdict may swallow the whole thing.
    expect(counts.hitting).toBeLessThan(total * 0.85);
    expect(counts.missing).toBeLessThan(total * 0.85);
  });

  it("makes reviewing pay off sometimes and cost sometimes", () => {
    const rng = createRng("review-economics");
    let retained = 0;
    let spent = 0;

    for (let i = 0; i < 1500; i++) {
      const d = nextDelivery("normal", rng);
      const aim = (["leg", "straight", "off"] as const)[Math.floor(rng.next() * 3)]!;
      const t = computeTrajectory(d, aim, rng);
      const onField = umpireDecision(t, true, rng);
      const outcome = settleReview(onField, reviewLbw(t, true));
      if (outcome.reviewRetained) retained++;
      else spent++;
    }

    // Both outcomes have to be common. If reviewing were always free the
    // counter would be meaningless; if it always cost, nobody would review.
    expect(retained).toBeGreaterThan(150);
    expect(spent).toBeGreaterThan(150);
  });
});

describe("the on-field umpire", () => {
  it("turns down the ones that are obvious from twenty metres away", () => {
    const rng = createRng("obvious");
    // Pitched well outside leg.
    expect(umpireDecision(traj({ pitch: { x: -0.4, z: 5.8 } }), false, rng)).toBe("not-out");
    // Struck high on the thigh.
    expect(umpireDecision(traj({ impact: { x: 0, y: 0.8, z: 0.7 } }), false, rng)).toBe("not-out");
  });

  it("can be wrong about the ones replay exists for, which is the point", () => {
    // A ball that struck low and straight but was drifting well down leg.
    // It looks plumb; it is missing. Over many deliveries the umpire must
    // give at least some of these, or there is nothing to review.
    const rng = createRng("marginal");
    let given = 0;
    for (let i = 0; i < 200; i++) {
      const t = traj({ impact: { x: 0.02, y: 0.28, z: 0.7 }, stumps: { x: -0.5, y: 0.35 } });
      if (umpireDecision(t, true, rng) === "out") given++;
    }
    expect(given).toBeGreaterThan(0);
    // And the review must save the batsman every time.
    expect(reviewLbw(traj({ stumps: { x: -0.5, y: 0.35 } }), true).verdict).toBe("not-out");
  });
});
