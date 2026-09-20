import type { Rng } from "../../lib/random";
import type { Aim, BowlerType, Delivery, Length } from "./timing";

/**
 * Where the ball actually went, and what the LBW law makes of it.
 *
 * This is the part that makes the review system worth having. A DRS button
 * that rolls a die and prints OUT or NOT OUT is set dressing: the player
 * learns within three reviews that nothing they saw predicted the answer, and
 * from then on it is a coin toss with an animation in front of it.
 *
 * So the delivery gets a real position in space. Every ball is given a
 * pitching point, an impact point on the pad, and a predicted path on to the
 * stumps, all computed from the length, line and bowler that were already
 * being simulated. The decision then comes out of the actual Law 36 tests
 * applied to those coordinates - where it pitched, where it struck, whether
 * it was going on to hit - rather than out of a random number.
 *
 * The consequence that matters for gameplay: a player who watches where the
 * ball pitched can tell, before spending a review, that it pitched outside
 * leg and is never out. That is the real skill in reviewing, and it only
 * exists because these numbers are real.
 *
 * Everything here is pure. No React, no canvas, no clock. The replay
 * animation renders these numbers; it does not compute them, so what the
 * player is shown and what the decision was made from cannot drift apart.
 */

/* ------------------------------------------------------------------ *
 * Dimensions. Real ones, in metres, from the Laws of Cricket.
 * ------------------------------------------------------------------ */

/** Overall width of the three stumps, outside to outside: 9 inches. */
export const STUMP_WIDTH = 0.2286;
/** Half that, so |x| < STUMP_HALF is "within the line of the stumps". */
export const STUMP_HALF = STUMP_WIDTH / 2;
/** Height to the top of the bails: 28 inches. */
export const STUMP_HEIGHT = 0.711;
/** A cricket ball is 22.4cm around, so a radius of about 3.6cm. */
export const BALL_RADIUS = 0.036;
/** How far in front of the stumps the pads are struck, with the batsman in a normal stance. */
export const PAD_Z = 0.7;

/*
  Coordinates used throughout:

    x  lateral. 0 is middle stump. POSITIVE is the off side, negative the
       leg side, for a right-handed batsman.
    y  height above the ground.
    z  distance back down the pitch from the batsman's stumps. The stumps
       are at z = 0 and the bowler is at large z.
*/

/**
 * Where each length pitches, as a distance in front of the batsman's stumps.
 *
 * These are the real thing: a good length ball pitches around six metres
 * out, a bouncer closer to ten, a yorker essentially at the batsman's feet.
 * Getting these right is what makes "it pitched too full to be given" read
 * as true to anyone who watches cricket.
 */
const PITCH_Z: Record<Length, number> = {
  yorker: 0.55,
  full: 2.6,
  good: 5.8,
  short: 8.6,
  bouncer: 10.4,
};

/**
 * How steeply the ball climbs after pitching, in metres of height per metre
 * travelled.
 *
 * Modelled as a straight line rather than a parabola on purpose. For LBW the
 * only part of the flight that matters is the metre or two between the bounce
 * and the pads, and over that distance the curve is very nearly straight. A
 * full projectile solve would add arithmetic without changing a single
 * decision, and would make the numbers harder to reason about when one looks
 * wrong.
 */
const RISE: Record<Length, number> = {
  yorker: 0.02,
  full: 0.055,
  good: 0.105,
  short: 0.2,
  bouncer: 0.315,
};

/** Where each line pitches, laterally. */
const AIM_X: Record<Aim, number> = {
  leg: -0.16,
  straight: 0.0,
  off: 0.17,
};

/**
 * How much the ball moves sideways after pitching, per metre travelled.
 *
 * This is the whole reason a review is ever a genuine decision. Without
 * deviation, a ball pitching in line always goes on to hit, and there is
 * nothing to weigh up. A ball that pitches in line and then spins past the
 * outside edge is missing leg stump, and no amount of confidence at the
 * moment of impact tells you that.
 */
const DEVIATION: Record<BowlerType, number> = {
  pace: 0.016,
  medium: 0.011,
  spin: 0.052,
};

export interface Trajectory {
  /** Where it bounced. */
  pitch: { x: number; z: number };
  /** Where it struck the pad. */
  impact: { x: number; y: number; z: number };
  /** Where it would have reached the stumps, had the pad not been there. */
  stumps: { x: number; y: number };
  /** Sideways movement off the pitch, in metres per metre. Signed. */
  deviation: number;
  length: Length;
}

/**
 * Builds the flight path for one delivery.
 *
 * Takes the rng so the deviation is drawn from the same seeded stream as the
 * rest of the match. That keeps a replayed match identical, and it means the
 * review can be recomputed from the stored Trajectory without ever touching
 * the rng again.
 */
export function computeTrajectory(delivery: Delivery, aim: Aim, rng: Rng): Trajectory {
  const pitchZ = PITCH_Z[delivery.length];
  const rise = RISE[delivery.length];

  // A little scatter on the line, so the same call does not land on the same
  // spot every time and the pitching decision stays worth looking at.
  const pitchX = AIM_X[aim] + (rng.next() - 0.5) * 0.1;

  // Signed, so it can beat either edge.
  const deviation = (rng.next() - 0.5) * 2 * DEVIATION[delivery.bowler];

  // Distance the ball travels between bouncing and reaching the pads. A
  // yorker pitches behind the pad line, so there is no such distance: it
  // strikes essentially at the bounce, which is why a yorker traps you in
  // front of the stumps so often.
  const afterBounce = Math.max(0, pitchZ - PAD_Z);

  const impact = {
    x: pitchX + deviation * afterBounce,
    y: rise * afterBounce,
    z: PAD_Z,
  };

  // Carried on from the impact point to the stump line, same direction.
  const stumps = {
    x: pitchX + deviation * pitchZ,
    y: rise * pitchZ,
  };

  return { pitch: { x: pitchX, z: pitchZ }, impact, stumps, deviation, length: delivery.length };
}

/* ------------------------------------------------------------------ *
 * The law.
 * ------------------------------------------------------------------ */

export type PitchingVerdict = "in-line" | "outside-off" | "outside-leg";
export type ImpactVerdict = "in-line" | "outside-off";
export type WicketsVerdict = "hitting" | "clipping" | "missing";
export type Decision = "out" | "not-out";

export interface ReviewResult {
  pitching: PitchingVerdict;
  impact: ImpactVerdict;
  wickets: WicketsVerdict;
  /** What the review concludes, before the on-field decision is considered. */
  verdict: Decision | "umpires-call";
  /** Plain words for why, shown under the animation. */
  reason: string;
}

/** Where it pitched, relative to the stumps. */
export function pitchingVerdict(t: Trajectory): PitchingVerdict {
  if (t.pitch.x < -STUMP_HALF) return "outside-leg";
  if (t.pitch.x > STUMP_HALF) return "outside-off";
  return "in-line";
}

/** Where it struck, relative to the line of off stump. */
export function impactVerdict(t: Trajectory): ImpactVerdict {
  return t.impact.x > STUMP_HALF ? "outside-off" : "in-line";
}

/**
 * Whether it was going on to hit, and by how much.
 *
 * Three bands rather than two, because that is what the real system does and
 * it is where all the tension lives. A ball whose centre is inside the stumps
 * is conclusively hitting. A ball merely overlapping them is a clip, and a
 * clip is not enough to overturn an umpire - the on-field call stands. That
 * single rule is why a review can fail even when the ball was going to hit
 * the stumps, and it is the thing that makes spending one a real decision.
 */
export function wicketsVerdict(t: Trajectory): WicketsVerdict {
  const { x, y } = t.stumps;

  // Clean over the top.
  if (y - BALL_RADIUS > STUMP_HEIGHT) return "missing";
  // Wide of everything.
  if (Math.abs(x) - BALL_RADIUS > STUMP_HALF) return "missing";

  const fullyInsideLaterally = Math.abs(x) + BALL_RADIUS <= STUMP_HALF;
  const fullyUnderTheBails = y + BALL_RADIUS <= STUMP_HEIGHT;

  return fullyInsideLaterally && fullyUnderTheBails ? "hitting" : "clipping";
}

/**
 * Runs the three tests in the order the law runs them, and stops at the first
 * one that settles it.
 *
 * `playedShot` matters for exactly one test: a batsman struck outside the
 * line of off stump is not out only if they were playing a shot. Offer no
 * stroke and the protection goes away, which is why padding up is a risk.
 */
export function reviewLbw(t: Trajectory, playedShot: boolean): ReviewResult {
  const pitching = pitchingVerdict(t);
  const impact = impactVerdict(t);
  const wickets = wicketsVerdict(t);
  const base = { pitching, impact, wickets };

  if (pitching === "outside-leg") {
    return { ...base, verdict: "not-out", reason: "Pitched outside leg stump. Never out, whatever it did next." };
  }

  if (impact === "outside-off" && playedShot) {
    return { ...base, verdict: "not-out", reason: "Struck outside the line of off stump, and a shot was played." };
  }

  if (wickets === "missing") {
    const overTheTop = t.stumps.y - BALL_RADIUS > STUMP_HEIGHT;
    return {
      ...base,
      verdict: "not-out",
      reason: overTheTop ? "Bouncing over the top of the stumps." : "Going down the side. Missing the stumps.",
    };
  }

  if (wickets === "clipping") {
    return { ...base, verdict: "umpires-call", reason: "Clipping the stumps. Not enough to overturn the umpire." };
  }

  return { ...base, verdict: "out", reason: "Three reds. Hitting the stumps." };
}

/* ------------------------------------------------------------------ *
 * What the review does to the match.
 * ------------------------------------------------------------------ */

export interface ReviewOutcome {
  /** The decision that now stands. */
  finalDecision: Decision;
  /** Whether the on-field decision changed. */
  overturned: boolean;
  /** Whether the reviewing side keeps the review. */
  reviewRetained: boolean;
  headline: string;
}

/**
 * Settles a review against the on-field decision.
 *
 * The retention rule is the current one and it is not decoration: a review
 * that overturns is kept, a review that fails is spent, and umpire's call
 * costs nothing. Without that, reviewing everything is free and there is no
 * game in it. With it, the player has to judge whether what they saw was
 * worth one of two.
 */
export function settleReview(onFieldDecision: Decision, result: ReviewResult): ReviewOutcome {
  if (result.verdict === "umpires-call") {
    return {
      finalDecision: onFieldDecision,
      overturned: false,
      reviewRetained: true,
      headline: "UMPIRE'S CALL",
    };
  }

  const finalDecision: Decision = result.verdict;
  const overturned = finalDecision !== onFieldDecision;

  return {
    finalDecision,
    overturned,
    reviewRetained: overturned,
    headline: overturned ? "DECISION OVERTURNED" : "DECISION CONFIRMED",
  };
}

/**
 * What the on-field umpire gives, before anyone reviews.
 *
 * Deliberately not the same function as the review. A DRS is only
 * interesting if the umpire can be wrong, so this is a cruder read of the
 * same delivery: it sees roughly where the ball struck and whether it looked
 * straight, and it cannot see deviation after pitching or height at the
 * stumps, which are exactly the things replay is for.
 *
 * The umpire is right most of the time and wrong in the ways real umpires
 * are wrong, which is what gives the player something to read.
 */
export function umpireDecision(t: Trajectory, playedShot: boolean, rng: Rng): Decision {
  // Blatantly outside leg is seen and turned down.
  if (t.pitch.x < -STUMP_HALF - 0.02) return "not-out";
  // A clear inside-out strike well outside off, with a shot, is turned down.
  if (t.impact.x > STUMP_HALF + 0.04 && playedShot) return "not-out";
  // Obviously climbing over the top is turned down.
  if (t.impact.y > 0.62) return "not-out";

  // Otherwise: it looked straight enough. The umpire gives it, and is more
  // likely to give it the fuller it was, because a full ball striking low
  // looks plumb from twenty metres away whether or not it was.
  const looksPlumb = t.impact.y < 0.35 && Math.abs(t.impact.x) < STUMP_HALF + 0.03;
  const giveChance = looksPlumb ? 0.88 : 0.42;
  return rng.next() < giveChance ? "out" : "not-out";
}
