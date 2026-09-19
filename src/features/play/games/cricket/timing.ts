import { createRng, type Rng } from "../../lib/random";

/**
 * Cricket, played properly: the ball is bowled at you and you have to time
 * your shot.
 *
 * The old version was a menu — pick one of five shots, read the result. That
 * is a quiz about cricket, not cricket. Here the ball actually travels down
 * the pitch over a real number of milliseconds and the ONLY thing that
 * decides what happens is how close your swing was to the right moment. Miss
 * the moment by 30ms and you middle it for six; miss it by 300ms and you're
 * bowled.
 *
 * This file is the pure part — timing windows, outcomes, the bowler's
 * choices. The animation lives in the component, so all the rules are
 * testable without a browser and cannot drift from what's on screen.
 */

export type Length = "yorker" | "full" | "good" | "short" | "bouncer";
export type Aim = "leg" | "straight" | "off";

export const LENGTHS: Length[] = ["yorker", "full", "good", "short", "bouncer"];
export const AIMS: Aim[] = ["leg", "straight", "off"];

export const LENGTH_LABEL: Record<Length, string> = {
  yorker: "Yorker",
  full: "Full",
  good: "Good length",
  short: "Short",
  bouncer: "Bouncer",
};

export const AIM_LABEL: Record<Aim, string> = {
  leg: "Leg side",
  straight: "Straight",
  off: "Off side",
};

/**
 * Who is bowling. Added because timing alone, with the same ball every time,
 * is a reaction test rather than a game: once you learn the one rhythm there
 * is nothing left to read. A spinner is slow and forgiving but turns the
 * length hint against you; express pace is fast and unforgiving. Knowing WHICH
 * you are facing before you play is the actual skill.
 */
export type BowlerType = "pace" | "medium" | "spin";

export const BOWLER_LABEL: Record<BowlerType, string> = {
  pace: "Express pace",
  medium: "Medium pace",
  spin: "Spin",
};

/** Multiplies the ball's travel time. Spin floats in; pace hurries you. */
export const BOWLER_SPEED: Record<BowlerType, number> = { pace: 0.82, medium: 1, spin: 1.35 };
/** Multiplies every timing window. A slower ball is easier to meet. */
export const BOWLER_FORGIVENESS: Record<BowlerType, number> = { pace: 0.85, medium: 1, spin: 1.2 };

export interface Delivery {
  bowler: BowlerType;
  length: Length;
  /** How long the ball takes to reach the bat, in milliseconds. */
  travelMs: number;
  /**
   * How forgiving this ball is. A yorker has to be met almost exactly; a
   * short ball sits up and gives you longer. Multiplies every timing window.
   */
  forgiveness: number;
  /** Speed in km/h — shown to the player, and it's what travelMs is from. */
  speedKph: number;
}

/**
 * Base timing windows in milliseconds, measured from the perfect contact
 * moment. Symmetrical: being early is exactly as bad as being late by the
 * same amount, which is what makes the skill learnable.
 */
const WINDOWS = {
  perfect: 45,
  great: 85,
  good: 135,
  ok: 200,
  edge: 280,
} as const;

/**
 * The scoring windows, exported so the screen can DRAW them.
 *
 * They were private, and the game was unplayable because of it. A player was
 * told "NOW — tap or SPACE" with nothing on screen showing how wide "now" is
 * or how close they were to it, so timing the shot came down to guessing and
 * feedback arrived only after the ball had gone. Reported exactly that way:
 * "where to hit".
 *
 * Publishing them means the meter cannot drift out of step with the scoring —
 * it is not an approximation of the windows, it is the windows.
 */
export const CONTACT_WINDOWS = WINDOWS;

export type Contact = "perfect" | "great" | "good" | "ok" | "edge" | "miss";

export function contactFor(offsetMs: number, delivery: Delivery): Contact {
  const off = Math.abs(offsetMs) / delivery.forgiveness;
  if (off <= WINDOWS.perfect) return "perfect";
  if (off <= WINDOWS.great) return "great";
  if (off <= WINDOWS.good) return "good";
  if (off <= WINDOWS.ok) return "ok";
  if (off <= WINDOWS.edge) return "edge";
  return "miss";
}

export const CONTACT_LABEL: Record<Contact, string> = {
  perfect: "Middled it!",
  great: "Well timed",
  good: "Solid contact",
  ok: "Got some bat on it",
  edge: "Thick edge",
  miss: "Missed it",
};

export type Outcome = 0 | 1 | 2 | 3 | 4 | 6 | "out";

export interface BallResult {
  outcome: Outcome;
  contact: Contact;
  /** Signed: negative is early, positive is late. Shown so you can learn. */
  offsetMs: number;
  /** Plain-English reason, e.g. "Too early — bowled". */
  detail: string;
}

/**
 * What a given contact quality produces, and how the aim modifies it.
 *
 * Aim is a genuine risk/reward decision rather than decoration: hitting
 * straight is the safest way to turn good timing into runs, the leg side pays
 * best off short balls, and the off side is where the catches are. None of it
 * matters if the timing is bad — which is correct, because in cricket it
 * doesn't either.
 */
function scoreContact(contact: Contact, delivery: Delivery, aim: Aim, rng: Rng): BallResult {
  const base = { contact, offsetMs: 0 };

  if (contact === "miss") {
    // A miss is only out if the ball would have hit the stumps. Full and
    // straight does; a bouncer sails over the top.
    const bowledChance = delivery.length === "yorker" ? 0.92 : delivery.length === "full" ? 0.8 : delivery.length === "good" ? 0.6 : delivery.length === "short" ? 0.2 : 0.05;
    if (rng.next() < bowledChance) {
      return { ...base, outcome: "out", detail: "Missed it. Bowled" };
    }
    return { ...base, outcome: 0, detail: "Missed it. No run" };
  }

  if (contact === "edge") {
    // An edge is mostly survivable but it is how you get caught.
    const caught = rng.next() < (aim === "off" ? 0.45 : aim === "straight" ? 0.3 : 0.22);
    if (caught) return { ...base, outcome: "out", detail: "Edged it. Caught" };
    const runs = rng.next() < 0.35 ? 4 : rng.next() < 0.5 ? 1 : 0;
    return { ...base, outcome: runs as Outcome, detail: runs === 4 ? "Edged it. Flew for four!" : runs === 1 ? "Edged it. Single" : "Edged it. No run" };
  }

  // Well-timed shots. The better the contact, the further it goes.
  const legBonus = aim === "leg" && (delivery.length === "short" || delivery.length === "bouncer");
  const offRisk = aim === "off";

  if (contact === "perfect") {
    if (offRisk && rng.next() < 0.12) return { ...base, outcome: "out", detail: "Middled it. Straight to the fielder" };
    return { ...base, outcome: 6, detail: legBonus ? "Pulled for SIX!" : "Six!" };
  }

  if (contact === "great") {
    if (legBonus && rng.next() < 0.4) return { ...base, outcome: 6, detail: "Pulled for six!" };
    if (offRisk && rng.next() < 0.08) return { ...base, outcome: "out", detail: "Well timed. Caught in the deep" };
    return { ...base, outcome: 4, detail: "Four!" };
  }

  if (contact === "good") {
    const runs = rng.next() < 0.35 ? 4 : rng.next() < 0.6 ? 2 : 1;
    return { ...base, outcome: runs as Outcome, detail: runs === 4 ? "Four!" : `${runs} run${runs === 1 ? "" : "s"}` };
  }

  // "ok"
  const runs = rng.next() < 0.5 ? 1 : rng.next() < 0.7 ? 2 : 0;
  return { ...base, outcome: runs as Outcome, detail: runs === 0 ? "No run" : `${runs} run${runs === 1 ? "" : "s"}` };
}

/**
 * The whole ball: given when you swung relative to the perfect moment, what
 * happened. `offsetMs` negative = early, positive = late, null = never swung.
 */
export function playBall(offsetMs: number | null, delivery: Delivery, aim: Aim, rng: Rng): BallResult {
  if (offsetMs === null) {
    const result = scoreContact("miss", delivery, aim, rng);
    return { ...result, offsetMs: 0, detail: result.outcome === "out" ? "No shot. Bowled" : "No shot. Left it" };
  }
  const contact = contactFor(offsetMs, delivery);
  const result = scoreContact(contact, delivery, aim, rng);
  const early = offsetMs < 0;
  const timingNote =
    contact === "perfect" || contact === "great"
      ? ""
      : early
        ? " (too early)"
        : " (too late)";
  return { ...result, offsetMs, detail: result.detail + timingNote };
}

/**
 * Difficulty changes how fast the ball comes and how tight the windows are.
 * Easy is genuinely playable by someone who has never done this; Hard is
 * about as tight as a reaction game can fairly be with a screen and a click.
 */
export type Difficulty = "easy" | "normal" | "hard";

const SPEED_RANGE: Record<Difficulty, [number, number]> = {
  easy: [1500, 2100],
  normal: [1050, 1550],
  hard: [750, 1150],
};

const FORGIVENESS: Record<Difficulty, number> = { easy: 1.6, normal: 1.0, hard: 0.72 };

/** How much each length stretches or squeezes the timing window. */
const LENGTH_FORGIVENESS: Record<Length, number> = {
  yorker: 0.72,
  full: 0.88,
  good: 1,
  short: 1.18,
  bouncer: 1.3,
};

export function nextDelivery(difficulty: Difficulty, rng: Rng): Delivery {
  const length = rng.pick(LENGTHS);
  const bowler = rng.pick(["pace", "medium", "spin"] as BowlerType[]);
  const [min, max] = SPEED_RANGE[difficulty];
  const travelMs = Math.round((min + rng.next() * (max - min)) * BOWLER_SPEED[bowler]);
  // A 20m effective pitch length, converted to km/h from the travel time —
  // so the speed shown is derived from the ball you actually face, not a
  // decorative number.
  const speedKph = Math.round((20 / (travelMs / 1000)) * 3.6);
  return {
    bowler,
    length,
    travelMs,
    forgiveness: FORGIVENESS[difficulty] * LENGTH_FORGIVENESS[length] * BOWLER_FORGIVENESS[bowler],
    speedKph,
  };
}

// ── Match state ───────────────────────────────────────────────────────────

export const BALLS_PER_OVER = 6;
export const OVERS = 3;

export interface BallRecord {
  ball: number;
  length: Length;
  aim: Aim;
  outcome: Outcome;
  contact: Contact;
  offsetMs: number;
}

export interface MatchState {
  runs: number;
  wickets: number;
  ballsBowled: number;
  totalBalls: number;
  maxWickets: number;
  target: number;
  history: BallRecord[];
  /** Set only for the six-ball decider after a tie. */
  superOver?: boolean;
  /** Runs from the innings that ended level, kept for the result screen. */
  previousRuns?: number;
}

export function createMatch(seed: number | string, difficulty: Difficulty): { state: MatchState; rng: Rng } {
  const rng = createRng(seed);
  const totalBalls = OVERS * BALLS_PER_OVER;
  // A target you have to actually bat well to reach, scaled to difficulty:
  // roughly 1.4 runs a ball on easy up to 1.9 on hard.
  const perBall = difficulty === "easy" ? 1.4 : difficulty === "normal" ? 1.65 : 1.9;
  const target = Math.round(totalBalls * perBall) + rng.int(6);
  return {
    rng,
    state: { runs: 0, wickets: 0, ballsBowled: 0, totalBalls, maxWickets: 3, target, history: [] },
  };
}

export function isOver(state: MatchState): boolean {
  return state.ballsBowled >= state.totalBalls || state.wickets >= state.maxWickets || state.runs >= state.target;
}

export type MatchResult = "won" | "lost" | "in-progress";

export function resultOf(state: MatchState): MatchResult {
  if (state.runs >= state.target) return "won";
  if (!isOver(state)) return "in-progress";
  return "lost";
}

export function applyBall(state: MatchState, delivery: Delivery, aim: Aim, result: BallResult): MatchState {
  if (isOver(state)) return state;
  return {
    ...state,
    runs: state.runs + (result.outcome === "out" ? 0 : result.outcome),
    wickets: state.wickets + (result.outcome === "out" ? 1 : 0),
    ballsBowled: state.ballsBowled + 1,
    history: [
      ...state.history,
      {
        ball: state.ballsBowled + 1,
        length: delivery.length,
        aim,
        outcome: result.outcome,
        contact: result.contact,
        offsetMs: Math.round(result.offsetMs),
      },
    ],
  };
}

export function formatOvers(balls: number): string {
  return `${Math.floor(balls / BALLS_PER_OVER)}.${balls % BALLS_PER_OVER}`;
}

/** Average absolute timing error across the innings, for the summary. */
export function averageTimingError(history: BallRecord[]): number | null {
  const timed = history.filter((h) => h.contact !== "miss");
  if (timed.length === 0) return null;
  return Math.round(timed.reduce((n, h) => n + Math.abs(h.offsetMs), 0) / timed.length);
}


// ── Reading the bowler ────────────────────────────────────────────────────

/**
 * The clue: you may "read" a limited number of deliveries per match, which
 * tells you the length before the ball is released.
 *
 * Limited rather than priced, because cricket already has a natural version of
 * this — a batter picks a bowler's length from their hand, and can only do it
 * so often before the bowler changes it up. Three per match is enough to save
 * you at the death and not enough to remove the guessing.
 */
export const READS_PER_MATCH = 3;

export function readTheBowler(delivery: Delivery): string {
  return `${BOWLER_LABEL[delivery.bowler]}: looks like a ${LENGTH_LABEL[delivery.length].toLowerCase()}.`;
}

/** Which shot the length actually rewards. Shown with a read, so it teaches. */
export function suggestedAim(length: Length): Aim {
  // Straight to the fuller ones, across the line to anything short. This is
  // the real coaching answer, not an invented rule.
  if (length === "yorker" || length === "full") return "straight";
  if (length === "good") return "off";
  return "leg";
}

// ── The chase ─────────────────────────────────────────────────────────────

/**
 * What makes a cricket chase a cricket chase.
 *
 * The engine above already models a good ball. What it did not model was
 * PRESSURE — the thing that makes the last over of a real match unbearable to
 * watch. A batter facing 6 balls needing 4 runs plays completely differently
 * from one needing 24, and until now the game could not tell you which
 * situation you were in. You just swung at eighteen balls and found out at the
 * end whether it had been enough.
 *
 * Everything below is the scoreboard a commentator would read out.
 */

export interface ChaseState {
  runsNeeded: number;
  ballsLeft: number;
  /** Runs per over the batter must now score. Infinity when no balls remain. */
  requiredRate: number;
  /** Runs per over scored so far. */
  currentRate: number;
  /** True in the last over, when the required rate is the whole story. */
  death: boolean;
}

export function chaseState(state: MatchState): ChaseState {
  const ballsLeft = Math.max(0, state.totalBalls - state.ballsBowled);
  const runsNeeded = Math.max(0, state.target - state.runs);
  return {
    runsNeeded,
    ballsLeft,
    requiredRate: ballsLeft === 0 ? Infinity : (runsNeeded / ballsLeft) * BALLS_PER_OVER,
    currentRate: state.ballsBowled === 0 ? 0 : (state.runs / state.ballsBowled) * BALLS_PER_OVER,
    death: ballsLeft <= BALLS_PER_OVER && ballsLeft > 0,
  };
}

/** "Needs 14 off 6" — the line every chase is actually about. */
export function chaseLine(state: MatchState): string {
  const { runsNeeded, ballsLeft } = chaseState(state);
  if (runsNeeded <= 0) return "Target reached";
  if (ballsLeft <= 0) return `${runsNeeded} short`;
  return `Needs ${runsNeeded} off ${ballsLeft}`;
}

/**
 * A tie is its own result, and it is the best thing that can happen to a game.
 *
 * The old model had two outcomes: reached the target or did not. Cricket has
 * three, and the third is the one people remember. Scoring exactly one short
 * of the target now ends level and goes to a Super Over.
 */
export type MatchOutcome = "won" | "tied" | "lost" | "in-progress";

export function outcomeOf(state: MatchState): MatchOutcome {
  if (state.runs >= state.target) return "won";
  if (!isOver(state)) return "in-progress";
  if (state.runs === state.target - 1) return "tied";
  return "lost";
}

/** Six balls, one wicket, whatever the other side managed. Sudden death. */
export const SUPER_OVER_BALLS = 6;

export function createSuperOver(previous: MatchState, rng: Rng): MatchState {
  // The opposition's super over is a real number rather than a fixed one:
  // between 6 and 14, which is the range a decent side actually makes.
  const target = 7 + rng.int(8);
  return {
    runs: 0,
    wickets: 0,
    ballsBowled: 0,
    totalBalls: SUPER_OVER_BALLS,
    maxWickets: 1,
    target,
    history: [],
    superOver: true,
    previousRuns: previous.runs,
  };
}

// ── The bowler reads you back ─────────────────────────────────────────────

/**
 * The bowler adapts to where you keep hitting.
 *
 * Without this the bowling is uniformly random, which means there is nothing
 * to learn after the first few overs — every ball is a fresh coin flip and
 * skill tops out at pure reaction speed. A real bowler watches where you are
 * scoring and takes it away from you.
 *
 * So: hit the leg side three times and the bowling gets fuller and straighter,
 * where the leg-side shot does not work. Keep going off side and you get more
 * short balls. The counter is to change your own shot, which is the actual
 * cricket in this game and the reason it now rewards a second and third match.
 */
export function bowlerPlan(history: BallRecord[]): { avoid: Aim | null; note: string } {
  const recent = history.slice(-4).filter((h) => h.outcome !== "out");
  if (recent.length < 3) return { avoid: null, note: "" };

  const counts: Record<Aim, number> = { leg: 0, straight: 0, off: 0 };
  let scoring = 0;
  for (const ball of recent) {
    if (typeof ball.outcome === "number" && ball.outcome >= 2) {
      counts[ball.aim] += 1;
      scoring += 1;
    }
  }
  if (scoring < 2) return { avoid: null, note: "" };

  const favourite = (Object.keys(counts) as Aim[]).sort((a, b) => counts[b] - counts[a])[0]!;
  if (counts[favourite] < 2) return { avoid: null, note: "" };

  return {
    avoid: favourite,
    note:
      favourite === "leg"
        ? "The bowler has seen you going leg side. Expect it fuller and straighter."
        : favourite === "off"
          ? "They know you like it through the off side. Expect it shorter."
          : "You have been going straight. Expect it wider.",
  };
}

/** Lengths that take the named shot away from the batter. */
const COUNTER_LENGTHS: Record<Aim, Length[]> = {
  leg: ["yorker", "full", "full", "good"],
  off: ["short", "bouncer", "short", "good"],
  straight: ["short", "bouncer", "good", "good"],
};

/**
 * The next ball, with the bowler's plan and the pressure of the death overs
 * folded in.
 *
 * Wraps nextDelivery rather than replacing it, so every timing rule above
 * stays exactly as tested.
 */
export function nextPlannedDelivery(
  difficulty: Difficulty,
  state: MatchState,
  rng: Rng
): { delivery: Delivery; note: string } {
  const plan = bowlerPlan(state.history);
  const base = nextDelivery(difficulty, rng);

  // In the last over the bowling tightens: quicker, and aimed at the stumps.
  const { death } = chaseState(state);
  const length = plan.avoid ? rng.pick(COUNTER_LENGTHS[plan.avoid]) : base.length;
  const travelMs = Math.round(base.travelMs * (death ? 0.92 : 1));

  return {
    delivery: {
      ...base,
      length,
      travelMs,
      forgiveness: (base.forgiveness / LENGTH_FORGIVENESS[base.length]) * LENGTH_FORGIVENESS[length],
      speedKph: Math.round((20 / (travelMs / 1000)) * 3.6),
    },
    note: plan.note,
  };
}

// ── Commentary ────────────────────────────────────────────────────────────

/**
 * One line about what just happened, in the register of a commentator.
 *
 * Not decoration. A number changing on a scoreboard tells you the fact; a line
 * saying "needs 14 off 6, and that was a dot" tells you what the fact MEANS,
 * which is the difference between watching a scoreboard and being in a match.
 */
export function commentary(before: MatchState, after: MatchState, result: BallResult): string {
  const chase = chaseState(after);

  if (after.runs >= after.target) {
    return after.superOver ? "Won the Super Over!" : "Chased it down. That is the match!";
  }
  if (result.outcome === "out") {
    const left = after.maxWickets - after.wickets;
    if (left === 0) return "Gone. That is the innings.";
    return left === 1 ? "Wicket! One wicket left. You cannot lose another." : `Wicket! ${left} left.`;
  }
  if (after.ballsBowled >= after.totalBalls) return `${chase.runsNeeded} short at the end.`;

  const crossedFifty = before.runs < 50 && after.runs >= 50;
  if (crossedFifty) return "FIFTY! Raise the bat.";

  if (result.outcome === 6) return chase.death ? "SIX! Right when it was needed." : "Six! That has gone all the way.";
  if (result.outcome === 4) return "Four. Beautifully timed.";

  if (chase.death) {
    if (result.outcome === 0) return `Dot ball. ${chaseLine(after)}. The pressure is on.`;
    return `${chaseLine(after)}. Every run counts now.`;
  }

  if (chase.requiredRate > 12) return `${chaseLine(after)}. That is asking a lot.`;
  if (result.outcome === 0) return "No run. The rate is creeping up.";
  return chaseLine(after);
}

// ── The umpire, and DRS ───────────────────────────────────────────────────

/**
 * Whether the umpire actually got it right.
 *
 * Real cricket has an umpire who can be wrong, and a review system that exists
 * precisely because of it. That is not decoration — it is the source of most
 * of the drama in a modern match, and it turns a dismissal from a full stop
 * into a decision the player gets to make.
 *
 * The truth is fixed at the moment the ball is bowled, not when the review is
 * called, so reviewing cannot change what happened — it can only reveal it.
 * Anything else would be a slot machine wearing a cricket costume.
 */
/**
 * One review per innings became two, and the die roll that used to decide
 * them is gone.
 *
 * What lived here was judgeDismissal/reviewDecision: a per-length
 * probability that said "hitting", "umpire's call" or "missing", which the
 * review then read back out. Honest about being a roll, but it meant nothing
 * the player could see predicted the verdict, so after three reviews the
 * counter was decoration.
 *
 * It is replaced by drs.ts, which gives every delivery a real pitching
 * point, impact point and predicted path, and applies the three tests of the
 * LBW law to those coordinates. Two reviews, because a decision only has
 * weight when spending it can cost you the next one.
 */
export const REVIEWS_PER_INNINGS = 2;

/** What the umpire signals, so the figure on screen does the right thing. */
export type UmpireSignal = "none" | "out" | "four" | "six" | "wide-arms";

export function umpireSignal(result: BallResult): UmpireSignal {
  if (result.outcome === "out") return "out";
  if (result.outcome === 6) return "six";
  if (result.outcome === 4) return "four";
  return "none";
}
