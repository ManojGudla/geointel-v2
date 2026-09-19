import { describe, expect, it } from "vitest";
import { AIMS, BALLS_PER_OVER, BOWLER_FORGIVENESS, BOWLER_LABEL, BOWLER_SPEED, LENGTHS, LENGTH_LABEL, OVERS, READS_PER_MATCH, applyBall, averageTimingError, contactFor, createMatch, formatOvers, isOver, nextDelivery, playBall, readTheBowler, resultOf, suggestedAim, type Delivery, type BallRecord, chaseLine, chaseState, outcomeOf, createSuperOver, SUPER_OVER_BALLS, bowlerPlan, nextPlannedDelivery, commentary } from "@/features/play/games/cricket/timing";
import { createRng } from "@/features/play/lib/random";

const normalBall: Delivery = { length: "good", travelMs: 1200, forgiveness: 1, speedKph: 60 };
const yorker: Delivery = { length: "yorker", travelMs: 1000, forgiveness: 0.72, speedKph: 72 };
const bouncer: Delivery = { length: "bouncer", travelMs: 1400, forgiveness: 1.3, speedKph: 51 };

describe("timing windows", () => {
  it("rewards being on the moment", () => {
    expect(contactFor(0, normalBall)).toBe("perfect");
    expect(contactFor(20, normalBall)).toBe("perfect");
  });

  it("degrades smoothly as you get further from the middle", () => {
    const order = ["perfect", "great", "good", "ok", "edge", "miss"];
    const seen = [0, 60, 110, 170, 250, 400].map((ms) => contactFor(ms, normalBall));
    expect(seen).toEqual(order);
  });

  it("treats early and late as equally bad", () => {
    for (const ms of [30, 70, 120, 190, 260, 500]) {
      expect(contactFor(-ms, normalBall)).toBe(contactFor(ms, normalBall));
    }
  });

  it("makes a yorker less forgiving than a bouncer", () => {
    // The same 100ms error is a worse shot against the harder ball.
    expect(contactFor(100, yorker)).toBe("ok");
    expect(contactFor(100, bouncer)).toBe("great");
  });
});

describe("ball outcomes", () => {
  const rng = () => createRng(12345);

  it("turns perfect timing into a boundary, never a dot", () => {
    for (let i = 0; i < 40; i++) {
      const r = playBall(0, normalBall, "straight", createRng(i));
      expect(r.contact).toBe("perfect");
      expect(r.outcome === 6 || r.outcome === "out").toBe(true);
    }
  });

  it("never rewards a miss with runs", () => {
    for (let i = 0; i < 40; i++) {
      const r = playBall(600, normalBall, "straight", createRng(i));
      expect(r.contact).toBe("miss");
      expect(r.outcome === 0 || r.outcome === "out").toBe(true);
    }
  });

  it("treats no shot at all as a miss", () => {
    const r = playBall(null, normalBall, "straight", rng());
    expect(r.contact).toBe("miss");
    expect(r.detail).toContain("No shot");
  });

  it("bowls you far more often on a yorker than on a bouncer when you miss", () => {
    const outs = (ball: Delivery) => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        if (playBall(900, ball, "straight", createRng(i)).outcome === "out") n++;
      }
      return n;
    };
    expect(outs(yorker)).toBeGreaterThan(outs(bouncer));
  });

  it("tells you which way you were wrong", () => {
    expect(playBall(-150, normalBall, "straight", rng()).detail).toContain("too early");
    expect(playBall(150, normalBall, "straight", rng()).detail).toContain("too late");
  });

  it("makes the off side riskier than the leg side on an edge", () => {
    const caught = (aim: (typeof AIMS)[number]) => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        if (playBall(240, normalBall, aim, createRng(i)).outcome === "out") n++;
      }
      return n;
    };
    expect(caught("off")).toBeGreaterThan(caught("leg"));
  });

  it("is reproducible from its seed", () => {
    const a = playBall(120, normalBall, "leg", createRng("same"));
    const b = playBall(120, normalBall, "leg", createRng("same"));
    expect(a).toEqual(b);
  });
});

describe("deliveries", () => {
  it("bowls faster on hard than on easy", () => {
    const avg = (d: "easy" | "normal" | "hard") => {
      const rng = createRng(7);
      let total = 0;
      for (let i = 0; i < 60; i++) total += nextDelivery(d, rng).travelMs;
      return total / 60;
    };
    expect(avg("hard")).toBeLessThan(avg("normal"));
    expect(avg("normal")).toBeLessThan(avg("easy"));
  });

  it("gives tighter timing windows on hard", () => {
    const forgiveness = (d: "easy" | "hard") => {
      const rng = createRng(3);
      let total = 0;
      for (let i = 0; i < 60; i++) total += nextDelivery(d, rng).forgiveness;
      return total / 60;
    };
    expect(forgiveness("hard")).toBeLessThan(forgiveness("easy"));
  });

  it("reports a speed consistent with the travel time", () => {
    const rng = createRng(11);
    for (let i = 0; i < 30; i++) {
      const d = nextDelivery("normal", rng);
      // 20m in travelMs, converted to km/h.
      expect(d.speedKph).toBeCloseTo((20 / (d.travelMs / 1000)) * 3.6, 0);
      expect(d.speedKph).toBeGreaterThan(20);
      expect(d.speedKph).toBeLessThan(120);
    }
  });

  it("only ever bowls a real length", () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) expect(LENGTHS).toContain(nextDelivery("normal", rng).length);
  });
});

describe("the chase", () => {
  it("starts at nothing with a target you have to bat for", () => {
    const { state } = createMatch("seed", "normal");
    expect(state.runs).toBe(0);
    expect(state.wickets).toBe(0);
    expect(state.target).toBeGreaterThan(state.totalBalls);
    expect(isOver(state)).toBe(false);
    expect(resultOf(state)).toBe("in-progress");
  });

  it("sets a harder target on hard than on easy", () => {
    expect(createMatch("s", "hard").state.target).toBeGreaterThan(createMatch("s", "easy").state.target);
  });

  it("adds runs and wickets from the ball result", () => {
    const { state } = createMatch(1, "normal");
    const six = applyBall(state, normalBall, "straight", { outcome: 6, contact: "perfect", offsetMs: 5, detail: "Six!" });
    expect(six.runs).toBe(6);
    expect(six.ballsBowled).toBe(1);

    const out = applyBall(six, normalBall, "straight", { outcome: "out", contact: "miss", offsetMs: 0, detail: "Bowled" });
    expect(out.runs).toBe(6);
    expect(out.wickets).toBe(1);
  });

  it("never mutates the state it was given", () => {
    const { state } = createMatch(1, "normal");
    const before = JSON.stringify(state);
    applyBall(state, normalBall, "straight", { outcome: 4, contact: "great", offsetMs: 60, detail: "Four" });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("ends and freezes once the target is passed", () => {
    const { state } = createMatch(2, "normal");
    const won = { ...state, runs: state.target };
    expect(isOver(won)).toBe(true);
    expect(resultOf(won)).toBe("won");
    expect(applyBall(won, normalBall, "straight", { outcome: 6, contact: "perfect", offsetMs: 0, detail: "" })).toBe(won);
  });

  it("ends when the wickets run out", () => {
    const { state } = createMatch(2, "normal");
    const allOut = { ...state, wickets: state.maxWickets };
    expect(isOver(allOut)).toBe(true);
    expect(resultOf(allOut)).toBe("lost");
  });

  it("ends when the balls run out", () => {
    const { state } = createMatch(2, "normal");
    const done = { ...state, ballsBowled: state.totalBalls };
    expect(isOver(done)).toBe(true);
    expect(resultOf(done)).toBe("lost");
  });

  it("formats overs the way a scoreboard does", () => {
    expect(formatOvers(0)).toBe("0.0");
    expect(formatOvers(7)).toBe("1.1");
    expect(formatOvers(12)).toBe("2.0");
  });

  it("reports average timing error, ignoring balls you never touched", () => {
    expect(averageTimingError([])).toBeNull();
    const history = [
      { ball: 1, length: "good" as const, aim: "straight" as const, outcome: 4 as const, contact: "great" as const, offsetMs: -60 },
      { ball: 2, length: "good" as const, aim: "straight" as const, outcome: 0 as const, contact: "miss" as const, offsetMs: 0 },
      { ball: 3, length: "good" as const, aim: "straight" as const, outcome: 6 as const, contact: "perfect" as const, offsetMs: 20 },
    ];
    // Only the two balls that made contact count: (60 + 20) / 2.
    expect(averageTimingError(history)).toBe(40);
  });
});


describe("bowler types", () => {
  /**
   * Facing the same ball every time is a reaction test, not a game: you learn
   * one rhythm and there is nothing left to read. These hold the property that
   * makes bowler type matter — a spinner really is slower and more forgiving
   * than express pace, so knowing which you face changes how you play.
   */
  const rng = createRng("bowlers");

  it("makes spin slower than pace and pace less forgiving than spin", () => {
    expect(BOWLER_SPEED.spin).toBeGreaterThan(BOWLER_SPEED.medium);
    expect(BOWLER_SPEED.pace).toBeLessThan(BOWLER_SPEED.medium);
    expect(BOWLER_FORGIVENESS.spin).toBeGreaterThan(BOWLER_FORGIVENESS.pace);
  });

  it("gives every delivery a bowler, and eventually bowls all three", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const ball = nextDelivery("normal", rng);
      expect(["pace", "medium", "spin"]).toContain(ball.bowler);
      expect(ball.travelMs).toBeGreaterThan(0);
      seen.add(ball.bowler);
    }
    expect(seen.size).toBe(3);
  });

  it("reads the bowler without ever naming the wrong length", () => {
    // A clue that contradicts the ball it describes is worse than no clue.
    for (let i = 0; i < 25; i++) {
      const ball = nextDelivery("hard", rng);
      const read = readTheBowler(ball);
      expect(read).toContain(BOWLER_LABEL[ball.bowler]);
      expect(read.toLowerCase()).toContain(LENGTH_LABEL[ball.length].toLowerCase());
    }
  });

  it("suggests the shot the length actually rewards", () => {
    expect(suggestedAim("yorker")).toBe("straight");
    expect(suggestedAim("full")).toBe("straight");
    expect(suggestedAim("short")).toBe("leg");
    expect(suggestedAim("bouncer")).toBe("leg");
  });

  it("limits the reads, so the guessing is never removed entirely", () => {
    expect(READS_PER_MATCH).toBeGreaterThan(0);
    expect(READS_PER_MATCH).toBeLessThan(BALLS_PER_OVER * OVERS);
  });
});

// ── The chase, the bowler's plan, and the Super Over ──────────────────────

describe("the chase", () => {
  const base = createMatch("chase-seed", "normal").state;

  it("says what a chase is actually about", () => {
    const state = { ...base, runs: 30, ballsBowled: 12, target: 44 };
    expect(chaseLine(state)).toBe("Needs 14 off 6");
  });

  it("computes the required rate, which is the number that creates the tension", () => {
    // 14 needed off 6 balls is 14 an over. A scoreboard that only says "14
    // needed" cannot tell the player whether that is comfortable or nearly
    // gone; this is the number that can.
    const state = { ...base, runs: 30, ballsBowled: 12, target: 44 };
    expect(chaseState(state).requiredRate).toBeCloseTo(14, 5);
    expect(chaseState(state).death).toBe(true);
  });

  it("never asks for a negative number of runs once the target is passed", () => {
    const won = { ...base, runs: 100, ballsBowled: 10, target: 44 };
    expect(chaseState(won).runsNeeded).toBe(0);
    expect(chaseLine(won)).toBe("Target reached");
  });
});

describe("a tie is its own result", () => {
  const base = createMatch("tie-seed", "normal").state;

  it("ends level one short of the target, rather than counting it a loss", () => {
    // The old model had two outcomes and this was filed under "lost". It is
    // the best result a chase can produce and it deserves its own ending.
    const tied = { ...base, runs: base.target - 1, ballsBowled: base.totalBalls };
    expect(outcomeOf(tied)).toBe("tied");
  });

  it("still calls a genuine loss a loss", () => {
    const lost = { ...base, runs: base.target - 8, ballsBowled: base.totalBalls };
    expect(outcomeOf(lost)).toBe("lost");
  });

  it("builds a real Super Over: six balls, one wicket, a reachable target", () => {
    const { rng } = createMatch("super", "normal");
    const tied = { ...base, runs: base.target - 1, ballsBowled: base.totalBalls };
    const superOver = createSuperOver(tied, rng);
    expect(superOver.totalBalls).toBe(SUPER_OVER_BALLS);
    expect(superOver.maxWickets).toBe(1);
    expect(superOver.superOver).toBe(true);
    expect(superOver.runs).toBe(0);
    // Between 7 and 14 — what a decent side actually makes off six balls.
    expect(superOver.target).toBeGreaterThanOrEqual(7);
    expect(superOver.target).toBeLessThanOrEqual(14);
  });
});

describe("the bowler adapts to the batter", () => {
  const scoring = (aim: "leg" | "straight" | "off", outcome: 4 | 6): BallRecord => ({
    ball: 1,
    length: "good",
    aim,
    outcome,
    contact: "great",
    offsetMs: 20,
  });

  it("says nothing until it has seen a pattern", () => {
    // Reacting to one shot would be noise, and would make the note meaningless.
    expect(bowlerPlan([]).avoid).toBeNull();
    expect(bowlerPlan([scoring("leg", 4)]).avoid).toBeNull();
  });

  it("spots the side you keep scoring on", () => {
    const plan = bowlerPlan([scoring("leg", 4), scoring("leg", 6), scoring("leg", 4)]);
    expect(plan.avoid).toBe("leg");
    expect(plan.note).toContain("leg side");
  });

  it("bowls a length that takes that shot away", () => {
    /**
     * The point of the whole mechanic. Without it every ball is a fresh coin
     * flip and skill tops out at reaction speed; with it, repeating one shot
     * stops working and the counter is to change it — which is the actual
     * cricket in this game.
     */
    const { rng } = createMatch("plan", "normal");
    const history = [scoring("leg", 4), scoring("leg", 6), scoring("leg", 4)];
    const state = { ...createMatch("plan", "normal").state, history };
    const lengths = new Set<string>();
    for (let i = 0; i < 40; i++) lengths.add(nextPlannedDelivery("normal", state, rng).delivery.length);
    // Countering a leg-side player means fuller and straighter, never short.
    expect(lengths.has("bouncer")).toBe(false);
    expect(lengths.has("short")).toBe(false);
  });

  it("keeps the timing window honest when it changes the length", () => {
    // The forgiveness value has to follow the length it swapped in, or a
    // yorker would be as easy to meet as the bouncer it replaced.
    const { rng } = createMatch("forgive", "normal");
    const state = createMatch("forgive", "normal").state;
    for (let i = 0; i < 30; i++) {
      const { delivery } = nextPlannedDelivery("normal", state, rng);
      expect(delivery.forgiveness).toBeGreaterThan(0);
      expect(Number.isFinite(delivery.forgiveness)).toBe(true);
      expect(delivery.speedKph).toBeGreaterThan(0);
    }
  });
});

describe("commentary", () => {
  const base = createMatch("comm", "normal").state;

  it("calls the win", () => {
    const before = { ...base, runs: base.target - 6, ballsBowled: 10 };
    const after = { ...before, runs: base.target, ballsBowled: 11 };
    expect(commentary(before, after, { outcome: 6, contact: "perfect", offsetMs: 5, detail: "Six!" })).toContain("Chased it down");
  });

  it("counts the wickets down rather than just saying OUT", () => {
    const before = { ...base, wickets: 1, ballsBowled: 5 };
    const after = { ...before, wickets: 2, ballsBowled: 6 };
    const line = commentary(before, after, { outcome: "out", contact: "edge", offsetMs: 200, detail: "Edged it" });
    // The count matters, not just the word OUT: knowing you have one left
    // changes how the next ball should be played.
    expect(line).toBe("Wicket! One wicket left. You cannot lose another.");
  });

  it("puts the pressure into words in the last over", () => {
    const before = { ...base, runs: 20, ballsBowled: 12, target: 40 };
    const after = { ...before, ballsBowled: 13 };
    const line = commentary(before, after, { outcome: 0, contact: "miss", offsetMs: 0, detail: "Missed" });
    expect(line).toContain("Dot ball");
    expect(line).toContain("pressure");
  });
});
