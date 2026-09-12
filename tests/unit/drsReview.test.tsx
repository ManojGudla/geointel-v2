import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { DrsReview } from "../../src/features/play/games/cricket/DrsReview";
import { reviewLbw, settleReview, type Trajectory } from "../../src/features/play/games/cricket/drs";

/**
 * The replay has one job beyond looking good: it must show the same thing the
 * decision was made from.
 *
 * The failure this guards against is subtle and fatal to the feature. If the
 * overlay ever renders a ball crashing into middle stump while the verdict
 * underneath reads NOT OUT, the player stops believing any of it, and from
 * that moment the reviews-remaining counter is a number going down for no
 * reason. So these tests drive the real component with real trajectories and
 * check that what it puts on screen matches what the law returned.
 *
 * They also walk the sequence stage by stage, because withholding the three
 * tests until each one is reached is the only tension the overlay has. A
 * regression that revealed all three at once would still "work" and would
 * quietly throw that away.
 */

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

function play(t: Trajectory, onField: "out" | "not-out", playedShot = true) {
  const result = reviewLbw(t, playedShot);
  const outcome = settleReview(onField, result);
  const onComplete = vi.fn();
  render(
    <DrsReview trajectory={t} result={result} outcome={outcome} onFieldDecision={onField} onComplete={onComplete} />
  );
  return { result, outcome, onComplete };
}

/** Walks the overlay's own timeline forward. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("the review overlay", () => {
  it("opens by saying a review was requested, before giving anything away", () => {
    play(traj(), "out");
    expect(screen.getByText(/REVIEW REQUESTED/i)).toBeTruthy();
    // None of the three verdicts may be on screen yet.
    expect(screen.queryByText(/^IN LINE$/)).toBeNull();
    expect(screen.queryByText(/^HITTING$/)).toBeNull();
  });

  it("reveals the three tests one at a time, in the order the law runs them", () => {
    play(traj({ stumps: { x: 0, y: 0.3 } }), "out");

    advance(1100); // tracking
    expect(screen.queryByText(/^HITTING$/)).toBeNull();

    advance(1900); // pitching
    expect(screen.getAllByText(/^IN LINE$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^HITTING$/)).toBeNull();

    advance(1100); // impact
    expect(screen.getAllByText(/^IN LINE$/).length).toBe(2);
    expect(screen.queryByText(/^HITTING$/)).toBeNull();

    advance(1100); // wickets
    expect(screen.getByText(/^HITTING$/)).toBeTruthy();
  });

  it("shows the verdict the law returned, not a separate one", () => {
    // Pitched outside leg: never out, however hard it was going to hit.
    const t = traj({ pitch: { x: -0.25, z: 5.8 }, stumps: { x: 0, y: 0.25 } });
    const { outcome } = play(t, "out");
    expect(outcome.finalDecision).toBe("not-out");

    advance(1100 + 1900 + 1100 + 1100 + 1700);
    // Targeted at the verdict itself. "OUT" and "NOT OUT" also appear in the
    // header, where they report what the on-field umpire had given, and the
    // two are supposed to differ on an overturn.
    expect(document.querySelector(".drs__decision")?.textContent).toBe("NOT OUT");
    expect(screen.getByText(/OUTSIDE LEG/)).toBeTruthy();
    expect(screen.getByText(/DECISION OVERTURNED/)).toBeTruthy();
    expect(screen.getByText(/Review retained/i)).toBeTruthy();
  });

  it("tells the player they have lost the review when the decision is confirmed", () => {
    const { outcome } = play(traj({ stumps: { x: 0, y: 0.3 } }), "out");
    expect(outcome.reviewRetained).toBe(false);

    advance(1100 + 1900 + 1100 + 1100 + 1700);
    expect(document.querySelector(".drs__decision")?.textContent).toBe("OUT");
    expect(screen.getByText(/DECISION CONFIRMED/)).toBeTruthy();
    expect(screen.getByText(/Review lost/i)).toBeTruthy();
  });

  it("says umpire's call, and keeps the review, when it was only clipping", () => {
    const t = traj({ stumps: { x: 0.095, y: 0.3 } });
    const { result } = play(t, "out");
    expect(result.wickets).toBe("clipping");

    advance(1100 + 1900 + 1100 + 1100 + 1700);
    expect(screen.getByText(/UMPIRE'S CALL/)).toBeTruthy();
    expect(screen.getByText(/Review retained/i)).toBeTruthy();
  });

  it("draws the ball where the physics says it arrived, not where the verdict wants it", () => {
    // Missing well down the leg side. The drawn ball must be left of the
    // stumps, which is the thing a player checks against the words.
    const t = traj({ stumps: { x: -0.42, y: 0.35 } });
    const { container } = { container: document.body };
    play(t, "out");
    advance(1100 + 1900 + 1100 + 1100);

    const ball = container.querySelector(".drs__ball");
    expect(ball).not.toBeNull();
    // Tagged with the verdict, so the colour cannot disagree with the words.
    expect(ball?.getAttribute("class")).toContain("drs__ball--notout");

    const cx = Number(ball?.getAttribute("cx"));
    const middleStump = 300 / 2; // FRONT_W / 2
    expect(cx).toBeLessThan(middleStump);
  });

  it("hands control back when the sequence has finished", () => {
    const { onComplete } = play(traj(), "out");
    expect(onComplete).not.toHaveBeenCalled();
    advance(1100 + 1900 + 1100 + 1100 + 1700 + 2600 + 50);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows what the on-field umpire had given, so the overturn means something", () => {
    play(traj(), "not-out");
    expect(document.querySelector(".drs__onfield")?.textContent).toContain("NOT OUT");
  });
});
