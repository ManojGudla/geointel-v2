import { useCallback, useEffect, useRef, useState } from "react";
import { buildLevel, scoreFind, type Level } from "./findItEngine";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { playTone } from "../../sound";
import "./FindIt.css";

/** Wrong taps you can afford before the run ends. */
const MAX_MISSES = 3;

/**
 * Find It — spot the one icon that matches the target, before the timer runs
 * out. No questions, no options to read: just look and tap.
 *
 * The run ends on the third mistake or the first time the clock beats you,
 * which is what makes each level tense rather than a grind.
 */
export function FindIt({ onBackToHub }: { onBackToHub: () => void }) {
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<Level | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [flash, setFlash] = useState<null | "hit" | "miss" | "timeout">(null);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  const [endedBecause, setEndedBecause] = useState<"time" | "misses" | null>(null);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);

  const seedRef = useRef(Date.now());
  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const recordedRef = useRef(false);
  // Read inside the animation frame, which must not close over stale state.
  const boardRef = useRef<Level | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const clearTimers = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    frameRef.current = null;
    flashTimer.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  const finish = useCallback((reason: "time" | "misses") => {
    clearTimers();
    setEndedBecause(reason);
    setPhase("done");
  }, []);

  /** Starts a level and runs its countdown off the wall clock. */
  const startLevel = useCallback(
    (n: number) => {
      const next = buildLevel(n, seedRef.current);
      boardRef.current = next;
      setBoard(next);
      setLevel(n);
      setRemainingMs(next.timeMs);
      startedAtRef.current = performance.now();

      const tick = () => {
        const left = next.timeMs - (performance.now() - startedAtRef.current);
        if (left <= 0) {
          setRemainingMs(0);
          if (soundEnabled) playTone(180, 0.18);
          setFlash("timeout");
          finish("time");
          return;
        }
        setRemainingMs(left);
        frameRef.current = requestAnimationFrame(tick);
      };
      clearTimers();
      frameRef.current = requestAnimationFrame(tick);
    },
    [finish, soundEnabled]
  );

  const start = () => {
    seedRef.current = Date.now();
    recordedRef.current = false;
    setScore(0);
    setMisses(0);
    setFlash(null);
    setApplied(null);
    setEndedBecause(null);
    setPhase("playing");
    startLevel(1);
  };

  const tap = (index: number) => {
    const current = boardRef.current;
    if (phaseRef.current !== "playing" || !current) return;

    if (index === current.targetIndex) {
      const taken = performance.now() - startedAtRef.current;
      const gained = scoreFind(level, taken, current.timeMs);
      setScore((s) => s + gained);
      setFlash("hit");
      if (soundEnabled) playTone(700, 0.07);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 400);
      startLevel(level + 1);
      return;
    }

    // A wrong tap costs a life but not the level — you keep looking.
    const nextMisses = misses + 1;
    setMisses(nextMisses);
    setFlash("miss");
    if (soundEnabled) playTone(200, 0.07);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 400);
    if (nextMisses >= MAX_MISSES) finish("misses");
  };

  useEffect(() => {
    if (phase !== "done" || recordedRef.current) return;
    recordedRef.current = true;
    setApplied(
      recordRound({
        gameId: "find-it",
        score,
        outcome: "complete",
        flags: level >= 10 ? ["find-it:level-10"] : [],
      })
    );
  }, [phase, score, level, recordRound]);

  if (phase === "ready") {
    return (
      <div className="game game--findit">
        <div className="play-intro">
          <p className="play-intro__title">Find the one that matches</p>
          <p className="play-intro__body">
            One icon on the board matches the target. Tap it before the timer runs out. Each level adds more
            look-alikes and less time. Three wrong taps and the run ends.
          </p>
          <button type="button" className="play-btn play-btn--primary" onClick={start}>
            Start
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="game">
        <RoundSummary
          gameTitle="Find It"
          headline={`Reached level ${level}`}
          detail={endedBecause === "time" ? "The clock beat you." : `Three wrong taps.`}
          score={score}
          applied={applied}
          onPlayAgain={start}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  if (!board) return null;

  const fraction = Math.max(0, remainingMs / board.timeMs);

  return (
    <div className="game game--findit">
      <div className="play-roundbar">
        <span>Level {level}</span>
        <span>{score.toLocaleString()} pts</span>
        <span aria-label={`${MAX_MISSES - misses} lives left`}>
          {"❤️".repeat(Math.max(0, MAX_MISSES - misses))}
          {"🤍".repeat(misses)}
        </span>
      </div>

      {/* A bar, not a number: at this speed a countdown you have to READ is a
          second thing to process while you're already searching. */}
      <div className="findit__timer" role="timer" aria-label={`${(remainingMs / 1000).toFixed(1)} seconds left`}>
        <span style={{ width: `${fraction * 100}%` }} className={fraction < 0.3 ? "findit__timer--low" : undefined} />
      </div>

      <div className={`findit__target${flash ? ` findit__target--${flash}` : ""}`}>
        <span className="findit__target-label">Find</span>
        <span className="findit__target-icon" aria-label={`Target: ${board.target}`}>
          {board.target}
        </span>
      </div>

      <div
        className="findit__grid"
        style={{ gridTemplateColumns: `repeat(${board.columns}, 1fr)` }}
        role="group"
        aria-label="Search grid"
      >
        {board.cells.map((cell, i) => (
          <button
            key={i}
            type="button"
            className="findit__cell"
            onClick={() => tap(i)}
            // Announcing which cell is the target would hand the game away,
            // so every cell reads identically to assistive tech.
            aria-label={`Cell ${i + 1}`}
          >
            <span aria-hidden="true">{cell}</span>
          </button>
        ))}
      </div>

      <button type="button" className="play-btn play-btn--quiet" onClick={() => finish("misses")}>
        Stop
      </button>
    </div>
  );
}
