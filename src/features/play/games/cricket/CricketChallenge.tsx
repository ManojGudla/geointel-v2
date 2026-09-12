import { useCallback, useEffect, useRef, useState } from "react";
import {
  AIMS,
  AIM_LABEL,
  BALLS_PER_OVER,
  CONTACT_LABEL,
  BOWLER_LABEL,
  LENGTH_LABEL,
  READS_PER_MATCH,
  readTheBowler,
  suggestedAim,
  applyBall,
  averageTimingError,
  createMatch,
  formatOvers,
  isOver,
  nextPlannedDelivery,
  bowlerPlan,
  chaseState,
  commentary,
  outcomeOf,
  umpireSignal,
  REVIEWS_PER_INNINGS,
  createSuperOver,
  playBall,
  resultOf,
  type Aim,
  type BallResult,
  type Delivery,
  type Difficulty,
  type MatchState,
} from "./timing";
import {
  computeTrajectory,
  reviewLbw,
  settleReview,
  umpireDecision,
  wicketsVerdict,
  type Decision,
  type ReviewOutcome,
  type ReviewResult,
  type Trajectory,
} from "./drs";
import { DrsReview } from "./DrsReview";
import type { Rng } from "../../lib/random";

import { RoundSummary } from "../../components/RoundSummary";
import { Stadium } from "./Stadium";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { playTone } from "../../sound";
import "./Cricket.css";

/** A pad struck in front, an umpire's decision, and the flight that produced both. */
interface Shout {
  trajectory: Trajectory;
  playedShot: boolean;
  onField: Decision;
  state: MatchState;
}

interface PlayingReview {
  shout: Shout;
  result: ReviewResult;
  outcome: ReviewOutcome;
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

type Phase = "ready" | "runup" | "travelling" | "result" | "done";

/**
 * Cricket Challenge — a timing game, not a menu.
 *
 * The ball leaves the bowler's hand and travels down the pitch over a real,
 * varying number of milliseconds. You press SPACE (or tap the pitch) to play
 * your shot, and the ONLY thing that decides the outcome is how close that
 * press was to the moment the ball reached the bat. It is a reflex-and-rhythm
 * game you can actually get better at.
 *
 * Timing is measured against `performance.now()`, not against animation
 * frames, so a dropped frame or a slow device changes how smooth it looks but
 * never changes how fair it is.
 */
export function CricketChallenge({ onBackToHub }: { onBackToHub: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [aim, setAim] = useState<Aim>("straight");
  const [phase, setPhase] = useState<Phase>("ready");
  const [state, setState] = useState<MatchState | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  /** What the bowler has worked out about you, shown before the ball. */
  const [planNote, setPlanNote] = useState("");
  /** The shot the bowler is currently taking away, so the field can move. */
  const [guarding, setGuarding] = useState<Aim | null>(null);

  /**
   * Full screen.
   *
   * Asked for directly, and the screenshot showed why: inside the games modal
   * the ground, the scoreboard and the aim buttons did not fit together, so
   * the player was scrolling the page while a ball was on its way. You cannot
   * time a shot you have to scroll to see.
   *
   * The real Fullscreen API rather than a CSS overlay, because only the real
   * one hides the browser chrome and the phone's own bars — which is most of
   * the height being lost.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      // Older iOS Safari has no element fullscreen at all; the catch keeps the
      // button from throwing rather than pretending it worked.
      void node.requestFullscreen?.().catch(() => undefined);
    }
  }, []);
  /**
   * DRS. Two reviews an innings, decided by geometry rather than a die.
   *
   * Every delivery is given a real pitching point, impact point and predicted
   * path to the stumps as it leaves the hand (see drs.ts), and a review
   * applies the three tests of the LBW law to those coordinates. So the
   * verdict is a fact about the ball that was bowled, and a player who
   * watched where it pitched can tell before spending a review that it
   * pitched outside leg and is never out. That is the whole game in it.
   *
   * Umpire's call keeps your review, as the real rule does, which is what
   * makes spending one a judgement rather than a free retry.
   */
  const [reviewsLeft, setReviewsLeft] = useState(REVIEWS_PER_INNINGS);
  /**
   * A live LBW appeal: the ball struck the pad, the umpire has given a
   * decision, and the player may review it. Carries the trajectory so the
   * review reads the same flight the umpire just judged.
   */
  const [shout, setShout] = useState<Shout | null>(null);
  /** A review in progress. The overlay owns the screen while this is set. */
  const [playing, setPlaying] = useState<PlayingReview | null>(null);
  const playingRef = useRef<PlayingReview | null>(null);
  playingRef.current = playing;
  /** Where the ball really went, recomputed for every delivery as it is bowled. */
  const trajectoryRef = useRef<Trajectory | null>(null);
  const [reviewVerdict, setReviewVerdict] = useState<string | null>(null);
  /** One line about the ball just played, in a commentator's voice. */
  const [callOut, setCallOut] = useState("");
  const [lastResult, setLastResult] = useState<BallResult | null>(null);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  /** 0 at the bowler's hand, 1 at the bat. Drives the ball's position. */
  const [progress, setProgress] = useState(0);
  /**
   * The clue. You may "read" a few deliveries per match, which names the
   * bowler and the length before the ball reaches you. Limited rather than
   * priced, because cricket already works this way: a batter picks a bowler's
   * length from their hand, and can only do it so often. Three is enough to
   * save you at the death and not enough to remove the guessing.
   */
  const [readsLeft, setReadsLeft] = useState(READS_PER_MATCH);
  const [read, setRead] = useState<string | null>(null);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);

  const rngRef = useRef<Rng | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const deliveryRef = useRef<Delivery | null>(null);
  const aimRef = useRef<Aim>(aim);
  aimRef.current = aim;
  /** performance.now() at which the ball reaches the bat. */
  const contactAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const swungRef = useRef(false);
  const recordedRef = useRef(false);

  const clearTimers = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    frameRef.current = null;
    timerRef.current = null;
  };

  const newMatch = useCallback(
    (level: Difficulty) => {
      clearTimers();
      const match = createMatch(Date.now(), level);
      rngRef.current = match.rng;
      stateRef.current = match.state;
      recordedRef.current = false;
      setState(match.state);
      setDelivery(null);
      setLastResult(null);
      setApplied(null);
      setProgress(0);
      /**
       * Everything about the LAST innings has to go, not just the score.
       *
       * These four were left behind, and the result was a fresh match opening
       * at 0/0 off 0.0 overs with "Gone. That is the innings." sitting above
       * it — the previous game's final line of commentary, reporting a wicket
       * that had not happened yet. Reads and reviews were carried over too, so
       * a second match silently started with fewer of both.
       */
      setCallOut("");
      setPlanNote("");
      setGuarding(null);
      setReadsLeft(READS_PER_MATCH);
      setRead(null);
      setReviewsLeft(REVIEWS_PER_INNINGS);
      setShout(null);
      setPlaying(null);
      setReviewVerdict(null);
      setPhase("ready");
    },
    []
  );

  useEffect(() => {
    newMatch(difficulty);
  }, [difficulty, newMatch]);

  useEffect(() => () => clearTimers(), []);

  /** Resolves the ball — called by a swing, or by the ball passing the bat. */
  const resolve = useCallback(
    (offsetMs: number | null) => {
      const rng = rngRef.current;
      const current = stateRef.current;
      const ball = deliveryRef.current;
      if (!rng || !current || !ball) return;

      clearTimers();
      const result = playBall(offsetMs, ball, aimRef.current, rng);
      const next = applyBall(current, ball, aimRef.current, result);
      stateRef.current = next;

      /*
        A wicket that beat the bat is where ball tracking has something to
        say. A caught edge is a catch: there is nothing to review.

        The split between bowled and an LBW shout comes off the trajectory
        rather than a coin. If the ball was going to hit low and straight,
        it beat the pad too and knocked the stumps over, and nobody reviews
        a bowled. Anything else struck the pad on the way, which is the
        shout — and the shout is where the geometry earns its keep, because
        the umpire cannot see deviation after pitching and the player can
        learn to.
      */
      if (result.outcome === "out" && result.contact === "miss") {
        const t = trajectoryRef.current;
        const bowledOutright = t !== null && wicketsVerdict(t) === "hitting" && t.impact.y < 0.25;

        if (t && !bowledOutright) {
          const playedShot = offsetMs !== null;
          const onField = umpireDecision(t, playedShot, rng);
          setShout({ trajectory: t, playedShot, onField, state: current });
        } else {
          setShout(null);
        }
      } else {
        setShout(null);
      }
      setReviewVerdict(null);

      setLastResult(result);
      setCallOut(commentary(current, next, result));
      setState(next);
      setPhase(isOver(next) ? "done" : "result");

      if (soundEnabled) {
        if (result.outcome === "out") playTone(170, 0.22);
        else if (result.outcome === 6) playTone(780, 0.18);
        else if (result.outcome === 4) playTone(640, 0.14);
        else if (result.contact === "miss") playTone(210, 0.08);
        else playTone(420, 0.08);
      }
    },
    [soundEnabled]
  );

  /** Bowls the next ball: short run-up, then the ball travels. */
  const bowl = useCallback(() => {
    const rng = rngRef.current;
    const current = stateRef.current;
    if (!rng || !current || isOver(current)) return;

    // The bowler now plans against you rather than bowling at random — see
    // bowlerPlan in timing.ts. The note is what the plan looks like from the
    // batter's end, so the counter is learnable instead of invisible.
    const { delivery: ball, note } = nextPlannedDelivery(difficulty, current, rng);
    setPlanNote(note);
    setGuarding(bowlerPlan(current.history).avoid);
    deliveryRef.current = ball;
    // Worked out now, as the ball leaves the hand, not when a review is
    // asked for. A review that recomputed the flight at the moment it was
    // requested could give a different answer to the one the ball actually
    // took, which is the exact dishonesty the whole system exists to avoid.
    trajectoryRef.current = computeTrajectory(ball, aimRef.current, rng);
    setDelivery(ball);
    setLastResult(null);
    setRead(null); // a read buys you one ball, not the whole over
    swungRef.current = false;
    setProgress(0);
    setPhase("runup");

    // A short, FIXED run-up before release. Fixed on purpose: the challenge
    // should be reading the ball's speed, not guessing when it will start.
    timerRef.current = window.setTimeout(() => {
      const start = performance.now();
      contactAtRef.current = start + ball.travelMs;
      setPhase("travelling");

      const tick = () => {
        const now = performance.now();
        const p = (now - start) / ball.travelMs;
        setProgress(Math.min(1.35, p));
        if (p >= 1.35) {
          // Ball is past the bat and nobody played a shot.
          if (!swungRef.current) resolve(null);
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    }, 650);
  }, [difficulty, resolve]);

  const swing = useCallback(() => {
    if (phase !== "travelling" || swungRef.current) return;
    swungRef.current = true;
    // Measured against the wall clock, not the frame counter — a stutter must
    // never change what your press was worth.
    resolve(performance.now() - contactAtRef.current);
  }, [phase, resolve]);

  // Space or Enter plays the shot. Keyboard is the fair input for a timing
  // game; the tap target below is there for phones.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      if (phase === "travelling") swing();
      else if (phase === "ready" || phase === "result") bowl();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, swing, bowl]);

  /**
   * Sends it upstairs.
   *
   * On an overturn the innings is rewound to the state BEFORE the ball, then
   * that ball is re-applied as a dot — which is what actually happens: the
   * wicket is struck off and the delivery still counts.
   */
  /**
   * Spends a review: runs the law over the stored trajectory, then hands the
   * result to the replay overlay. Nothing is applied to the match until the
   * replay has finished playing, so the player watches the decision arrive
   * rather than being told it and then shown it.
   */
  const review = () => {
    if (!shout) return;
    const result = reviewLbw(shout.trajectory, shout.playedShot);
    const outcome = settleReview(shout.onField, result);
    setPlaying({ shout, result, outcome });
  };

  /** Applies whatever the review settled on, once the replay has played out. */
  const applyReview = useCallback(() => {
    const p = playingRef.current;
    if (!p) return;
    setPlaying(null);
    setShout(null);

    if (!p.outcome.reviewRetained) setReviewsLeft((n) => Math.max(0, n - 1));
    setReviewVerdict(`${p.outcome.headline} — ${p.result.reason}`);

    // Only a NOT OUT changes the match. The wicket is struck off, the ball
    // still counts, and the innings carries on.
    if (p.outcome.finalDecision === "not-out") {
      const current = stateRef.current;
      const played = current ? current.history[current.history.length - 1] : undefined;
      const rewound: MatchState = {
        ...p.shout.state,
        ballsBowled: p.shout.state.ballsBowled + 1,
        history: played ? [...p.shout.state.history, { ...played, outcome: 0 }] : p.shout.state.history,
      };
      stateRef.current = rewound;
      setState(rewound);
      setPhase(isOver(rewound) ? "done" : "result");
      setCallOut("Not out! The review saves you.");
    }
  }, []);

  /** Declining a review lets the on-field decision stand, whatever it was. */
  const declineReview = () => {
    if (shout && shout.onField === "not-out") {
      // The umpire said not out and the player did not ask. The wicket the
      // game had already applied has to come back off.
      const current = stateRef.current;
      const played = current ? current.history[current.history.length - 1] : undefined;
      const rewound: MatchState = {
        ...shout.state,
        ballsBowled: shout.state.ballsBowled + 1,
        history: played ? [...shout.state.history, { ...played, outcome: 0 }] : shout.state.history,
      };
      stateRef.current = rewound;
      setState(rewound);
      setPhase(isOver(rewound) ? "done" : "result");
      setCallOut("Given not out. The appeal is turned down.");
    }
    setShout(null);
  };

  // Record the innings once.
  useEffect(() => {
    if (phase !== "done" || !state || recordedRef.current) return;
    recordedRef.current = true;
    const won = resultOf(state) === "won";
    setApplied(
      recordRound({
        gameId: "cricket",
        score: state.runs,
        outcome: won ? "win" : "loss",
        flags: won && difficulty === "hard" ? ["cricket:beat-hard"] : [],
      })
    );
  }, [phase, state, difficulty, recordRound]);

  if (!state) return null;

  const chase = chaseState(state);
  const needed = chase.runsNeeded;
  const ballsLeft = chase.ballsLeft;
  const finished = phase === "done";

  if (finished) {
    const outcome = outcomeOf(state);
    const won = outcome === "won";
    const tied = outcome === "tied";
    const avgError = averageTimingError(state.history);
    return (
      <div className="game">
        <RoundSummary
          gameTitle={state.superOver ? "Cricket Challenge — Super Over" : "Cricket Challenge"}
          headline={
            won
              ? `Chased it down — ${state.runs}/${state.wickets}`
              : tied
                ? `TIED — ${state.runs}/${state.wickets}`
                : `${state.runs}/${state.wickets} — ${needed} short`
          }
          detail={
            tied
              ? `Level on ${state.runs}. Nothing between the sides. It goes to a Super Over.`
              : avgError === null
                ? `Target was ${state.target}.`
                : `Target was ${state.target}. Your average timing was ${avgError}ms off the middle.`
          }
          score={state.runs}
          scoreLabel="Runs"
          // A chase you lost is not an achievement; a tie is, and so is a win.
          won={won || tied}
          applied={applied}
          /**
           * A tie is not a loss and it is not an ending — it is the best
           * result a chase can produce, and cricket has an answer for it.
           * Six balls, one wicket, sudden death.
           */
          extraAction={
            tied
              ? {
                  label: "Play the Super Over",
                  onClick: () => {
                    const rng = rngRef.current;
                    if (!rng) return;
                    const next = createSuperOver(state, rng);
                    stateRef.current = next;
                    setState(next);
                    recordedRef.current = false;
                    setCallOut("Six balls. One wicket. Whatever it takes.");
                    setPlanNote("");
                    setLastResult(null);
                    setPhase("ready");
                  },
                }
              : undefined
          }
          lines={state.history.map(
            (h) =>
              `${formatOvers(h.ball - 1)} ${LENGTH_LABEL[h.length]} → ${h.outcome === "out" ? "OUT" : h.outcome} · ${CONTACT_LABEL[h.contact]}${
                h.contact === "miss" ? "" : ` (${h.offsetMs > 0 ? "+" : ""}${h.offsetMs}ms)`
              }`
          )}
          onPlayAgain={() => newMatch(difficulty)}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  return (
    <div className={`game game--cricket${fullscreen ? " game--cricket-fs" : ""}`} ref={stageRef}>
      <div className="play-controls">
        <div className="play-segmented play-segmented--small" role="group" aria-label="Difficulty">
          {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
            <button key={d} type="button" className={difficulty === d ? "active" : ""} onClick={() => setDifficulty(d)}>
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="cricket__scoreboard">
        <div className="cricket__score">
          <strong>
            {state.runs}/{state.wickets}
          </strong>
          <span>{formatOvers(state.ballsBowled)} ov</span>
        </div>
        <div className="cricket__target">
          <span className={chase.death ? "cricket__need cricket__need--death" : "cricket__need"}>
            Need <strong>{needed}</strong> from <strong>{ballsLeft}</strong> ball{ballsLeft === 1 ? "" : "s"}
          </span>
          {/* The required rate is the number a real chase is actually about.
              Without it the scoreboard states a fact; with it, the fact has a
              meaning — 9 an over is comfortable, 18 is nearly gone. */}
          <span className="cricket__rate">
            Need {Number.isFinite(chase.requiredRate) ? chase.requiredRate.toFixed(1) : "—"} an over
            {state.ballsBowled > 0 ? ` · scoring ${chase.currentRate.toFixed(1)}` : ""}
          </span>
          <span className="cricket__wickets">
            {state.maxWickets - state.wickets} wicket{state.maxWickets - state.wickets === 1 ? "" : "s"} left
          </span>
        </div>
      </div>

      {/* What just happened, and what the bowler has worked out about you.
          Two different jobs: the first is the drama, the second is the thing
          that makes a second match play differently from the first. */}
      {(callOut || planNote) && (
        <div className="cricket__commentary" role="status">
          {callOut && <p className="cricket__callout">{callOut}</p>}
          {planNote && phase !== "travelling" && <p className="cricket__plan">{planNote}</p>}
        </div>
      )}

      {/*
        DRS. The piece that turns a dismissal from a full stop into a decision.

        One review an innings, as in a T20, and the truth was fixed when the
        ball was bowled — reviewing reveals what happened, it cannot change it.
        Umpire's call keeps your review, exactly as the real rule does, which
        is what makes spending it a genuine gamble rather than a free retry.
      */}
      {shout && !playing && (
        <div className="cricket__drs" role="alert">
          <p className="cricket__drs-head">
            {shout.onField === "out" ? "Given out, LBW. Review it?" : "Turned down. Review it?"}
          </p>
          <p className="cricket__drs-note">
            {reviewsLeft} review{reviewsLeft === 1 ? "" : "s"} left. Umpire's call keeps it; a decision confirmed
            spends it.
          </p>
          <div className="cricket__drs-actions">
            <button type="button" className="cricket__drs-go" onClick={review} disabled={reviewsLeft <= 0}>
              {reviewsLeft > 0 ? "Review it" : "No reviews left"}
            </button>
            <button type="button" className="cricket__drs-no" onClick={declineReview}>
              Take the decision
            </button>
          </div>
        </div>
      )}

      {playing && (
        <DrsReview
          trajectory={playing.shout.trajectory}
          result={playing.result}
          outcome={playing.outcome}
          onFieldDecision={playing.shout.onField}
          onComplete={applyReview}
        />
      )}

      {reviewVerdict && (
        <p className="cricket__drs-verdict" role="status">
          {reviewVerdict}
        </p>
      )}

      <div className="cricket__over" aria-label="This over">
        {Array.from({ length: BALLS_PER_OVER }, (_, i) => {
          const overStart = Math.floor(state.ballsBowled / BALLS_PER_OVER) * BALLS_PER_OVER;
          const ball = state.history[overStart + i];
          return (
            <span key={i} className={`cricket__ball${ball ? ` cricket__ball--${ball.outcome === "out" ? "out" : ball.outcome}` : ""}`}>
              {ball ? (ball.outcome === "out" ? "W" : ball.outcome) : "·"}
            </span>
          );
        })}
      </div>

      {/*
        The ground, replacing a green rectangle with a dot travelling down it.

        The timing underneath is unchanged — it was already the good part. What
        changed is that there is now a match happening around it: a crowd that
        reacts, a set field that the bowler moves against you, an umpire who
        signals, and batters who actually run. The previous version used emoji
        for the players and the feedback on it was exact: small, over-acted and
        funny. Every figure is drawn now — see Figures.tsx.
      */}
      <Stadium
        progress={progress}
        phase={phase}
        aim={aim}
        outcome={lastResult?.outcome ?? null}
        signal={lastResult && phase === "result" ? umpireSignal(lastResult) : "none"}
        crowd={
          phase === "result" && lastResult
            ? lastResult.outcome === "out"
              ? "groan"
              : lastResult.outcome === 4 || lastResult.outcome === 6
                ? "roar"
                : "idle"
            : "idle"
        }
        running={
          phase === "result" && lastResult && typeof lastResult.outcome === "number" && lastResult.outcome > 0 && lastResult.outcome < 4
            ? lastResult.outcome
            : 0
        }
        guarding={guarding}
        travelMs={delivery?.travelMs ?? 1200}
        forgiveness={delivery?.forgiveness ?? 1}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onSwing={() => (phase === "travelling" ? swing() : bowl())}
      />

      {lastResult && phase === "result" && (
        <p className="cricket__feedback" role="status" aria-live="polite">
          <strong>{CONTACT_LABEL[lastResult.contact]}</strong>
          {lastResult.contact !== "miss" && (
            <span>
              {" "}
              {lastResult.offsetMs > 0 ? "+" : ""}
              {Math.round(lastResult.offsetMs)}ms {lastResult.offsetMs > 0 ? "late" : "early"}
            </span>
          )}
        </p>
      )}

      {delivery && phase !== "ready" && (
        <p className="cricket__delivery-info">
          {BOWLER_LABEL[delivery.bowler]} · {LENGTH_LABEL[delivery.length]} · {delivery.speedKph} km/h
        </p>
      )}

      {/* The clue. Offered during the run-up, before the ball is released, so
          it is a decision you make in time to act on rather than a reveal
          after the fact. */}
      {delivery && phase === "runup" && (
        <div className="cricket__read">
          <button
            type="button"
            className="cricket__read-btn"
            disabled={readsLeft <= 0 || read !== null}
            onClick={() => {
              if (readsLeft <= 0 || read !== null) return;
              setReadsLeft((n) => n - 1);
              setRead(`${readTheBowler(delivery)} Play it ${AIM_LABEL[suggestedAim(delivery.length)].toLowerCase()}.`);
            }}
          >
            {readsLeft > 0 ? `👁 Read the bowler (${readsLeft} left)` : "No reads left this match"}
          </button>
          {read && <span className="cricket__read-text">{read}</span>}
        </div>
      )}

      {/* Aim is chosen between balls, not during — it is a plan, not a reflex. */}
      <div className="cricket__aim" role="group" aria-label="Where to hit">
        <span className="cricket__aim-label">Aim</span>
        {AIMS.map((a) => (
          <button
            key={a}
            type="button"
            className={aim === a ? "active" : ""}
            onClick={() => setAim(a)}
            disabled={phase === "travelling"}
          >
            {AIM_LABEL[a]}
          </button>
        ))}
      </div>
      <p className="cricket__aim-hint">
        Leg side pays best off short balls. Off side scores well but is where the catches are. Straight is safest.
      </p>

      {phase !== "travelling" && (
        <button type="button" className="play-btn play-btn--primary" onClick={bowl}>
          {phase === "ready" ? "Face the first ball" : "Next ball"}
        </button>
      )}
    </div>
  );
}
