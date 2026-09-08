import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag } from "../../components/Flag";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import {
  CORRECT_BONUS_SECONDS,
  ROUND_SECONDS,
  WRONG_PENALTY_SECONDS,
  accuracy,
  applyAnswer,
  buildQueue,
  formatClock,
  initialState,
  multiplierFor,
  pointsFor,
  shareText,
  type SixtyState,
} from "./sixtyEngine";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import "./SixtySeconds.css";

/**
 * 60 Seconds.
 *
 * The whole design brief was "engaging", and for a timed game that comes down
 * to pace. Three things here exist only to protect it:
 *
 *   There is no Next button. Answering advances the game. A confirm step
 *   between every question would halve the number of questions a minute holds
 *   and turn a sprint into a form.
 *
 *   A wrong answer lingers for 700ms and a right one for 260ms. The pause
 *   after a mistake is the only moment the correct answer is visible, so it
 *   has to be long enough to read and short enough not to feel like a
 *   punishment on top of the four seconds already lost.
 *
 *   The clock, the score and the multiplier never move position or change
 *   width. Digits that reflow while you are reading them pull the eye off the
 *   question, which is the one thing that must hold attention.
 */

type Phase = "intro" | "playing" | "over";

const FLASH_CORRECT_MS = 260;
const FLASH_WRONG_MS = 700;

export function SixtySeconds({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("sixty").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [state, setState] = useState<SixtyState>(initialState);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const queue = useMemo(() => buildQueue(seed), [seed]);
  const question = queue[Math.min(index, queue.length - 1)];

  const flashTimer = useRef<number | null>(null);
  const recorded = useRef(false);

  // Clear any pending advance if the component goes away mid-flash.
  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);

  /**
   * The clock. Depends on `phase` alone.
   *
   * Deliberately NOT on anything this effect updates: a state value the
   * effect both reads and writes puts the interval into a
   * create-cancel-create cycle, which is exactly the bug that froze Ultimate
   * Tic-Tac-Toe in this project — it passed every unit test and only showed
   * up when someone played it.
   *
   * Elapsed time is measured from the wall clock rather than assumed from the
   * interval period, so a backgrounded tab or a slow frame does not silently
   * hand the player extra seconds.
   */
  useEffect(() => {
    if (phase !== "playing") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setState((s) => ({ ...s, remainingMs: Math.max(0, s.remainingMs - elapsed) }));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && state.remainingMs <= 0) setPhase("over");
  }, [phase, state.remainingMs]);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({
      gameId: "sixty",
      score: state.score,
      outcome: "complete",
      perfect: state.answered > 0 && state.correct === state.answered,
      flags: state.longestStreak >= 10 ? ["sixty:streak10"] : undefined,
    });
  }, [phase, state, recordRound]);

  const start = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    recorded.current = false;
    setSeed(Date.now());
    setState(initialState());
    setIndex(0);
    setPicked(null);
    setPhase("playing");
  }, []);

  const answer = useCallback(
    (option: string) => {
      if (picked !== null || !question || phase !== "playing") return;
      const correct = option === question.answer;
      setPicked(option);
      setState((s) => applyAnswer(s, correct));
      if (soundEnabled) playTone(correct ? 880 : 200, 0.08);

      flashTimer.current = window.setTimeout(() => {
        setPicked(null);
        setIndex((i) => i + 1);
      }, correct ? FLASH_CORRECT_MS : FLASH_WRONG_MS);
    },
    [picked, question, phase, soundEnabled]
  );

  /**
   * Shares the result as an image.
   *
   * A picture travels where a block of text does not — people post images.
   * On a phone this opens the native sheet with the PNG attached; on a
   * desktop, where browsers mostly cannot share files, it saves the image
   * instead, and the button says which happened rather than going quiet.
   */
  const share = async () => {
    const card = buildScoreCard({
      game: "60 Seconds",
      score: state.score,
      stats: [
        { label: "Correct", value: `${state.correct}/${state.answered}` },
        { label: "Accuracy", value: `${accuracy(state)}%` },
        { label: "Best streak", value: state.longestStreak },
      ],
    });
    const outcome = await shareScoreCard(card, shareText(state, best));
    if (outcome === "downloaded") setShared("Saved as an image");
    else if (outcome === "shared") setShared("Shared");
    else if (outcome === "failed") {
      // Canvas unavailable or blocked. Fall back to the text score rather
      // than leaving the button doing nothing at all.
      try {
        await navigator.clipboard.writeText(shareText(state, best));
        setShared("Score copied");
      } catch {
        setShared("Could not share");
      }
    }
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="sixty sixty--intro" aria-label="60 Seconds">
        <p className="sixty__eyebrow">60 Seconds</p>
        <h2 className="sixty__title">One minute. As many as you can.</h2>
        <p className="sixty__lede">
          Questions come one after another and the type keeps changing. Answer to move on — there is no next button.
        </p>
        <ul className="sixty__rules">
          <li>Every correct answer adds {CORRECT_BONUS_SECONDS} second and builds your multiplier.</li>
          <li>Every wrong answer costs {WRONG_PENALTY_SECONDS} seconds and resets it.</li>
          <li>The multiplier on screen is what your next correct answer is worth.</li>
        </ul>
        {best > 0 ? <p className="sixty__best">Your best: {best.toLocaleString()}</p> : null}
        <div className="sixty__introactions">
          <button type="button" className="sixty__primary" onClick={start}>
            Start the clock
          </button>
          <button type="button" className="sixty__quiet" onClick={onBackToHub}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (phase === "over") {
    const isBest = state.score >= best && state.score > 0;
    return (
      <section className="sixty sixty--over" aria-label="60 Seconds result">
        <p className="sixty__eyebrow">Time</p>
        <p className="sixty__final">{state.score.toLocaleString()}</p>
        {isBest ? <p className="sixty__pb">New personal best</p> : null}

        <dl className="sixty__stats">
          <div>
            <dt>Correct</dt>
            <dd>
              {state.correct}
              <span className="sixty__of">/{state.answered}</span>
            </dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{accuracy(state)}%</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>🔥 {state.longestStreak}</dd>
          </div>
          <div>
            <dt>Your best</dt>
            <dd>{Math.max(best, state.score).toLocaleString()}</dd>
          </div>
        </dl>

        <div className="sixty__introactions">
          <button type="button" className="sixty__primary" onClick={start}>
            Go again
          </button>
          <button type="button" className="sixty__quiet" onClick={() => void share()}>
            {shared ?? "Share score"}
          </button>
          <button type="button" className="sixty__quiet" onClick={onBackToHub}>
            Back to games
          </button>
        </div>
      </section>
    );
  }

  const revealed = picked !== null;
  const multiplier = multiplierFor(state.streak);
  const urgent = state.remainingMs <= 10_000;

  return (
    <section className="sixty sixty--play" aria-label="60 Seconds, in play">
      <header className="sixty__bar">
        <button type="button" className="sixty__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className={`sixty__clock${urgent ? " sixty__clock--urgent" : ""}`} aria-live="off">
          {formatClock(state.remainingMs)}
        </p>
        <p className="sixty__score">{state.score.toLocaleString()}</p>
      </header>

      <div className="sixty__meta">
        <span className={`sixty__mult${state.streak > 0 ? " sixty__mult--hot" : ""}`}>
          ×{multiplier.toFixed(2)}
        </span>
        <span className="sixty__streak">
          {state.streak > 0 ? `🔥 ${state.streak} in a row · next worth ${pointsFor(state.streak)}` : `Next worth ${pointsFor(0)}`}
        </span>
      </div>

      {/* The clock is a progress bar as well as digits: a shrinking bar is
          read peripherally while the eye stays on the question. */}
      <div className="sixty__track" aria-hidden="true">
        <div
          className={`sixty__fill${urgent ? " sixty__fill--urgent" : ""}`}
          style={{ width: `${Math.max(0, (state.remainingMs / (ROUND_SECONDS * 1000)) * 100)}%` }}
        />
      </div>

      {question ? (
        <div className="sixty__card">
          {question.flagCode ? (
            <p className="sixty__display">
              <Flag code={question.flagCode} size={92} />
            </p>
          ) : null}
          {question.display ? <p className="sixty__display">{question.display}</p> : null}
          <h3 className="sixty__prompt">{question.prompt}</h3>

          <div className={`sixty__options sixty__options--${question.options.length}`}>
            {question.options.map((option) => {
              const isAnswer = option === question.answer;
              const state_ = !revealed ? "" : isAnswer ? " sixty__opt--right" : option === picked ? " sixty__opt--wrong" : " sixty__opt--dim";
              return (
                <button
                  key={option}
                  type="button"
                  className={`sixty__opt${state_}`}
                  disabled={revealed}
                  onClick={() => answer(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {/* Only shown after a mistake. Being told the answer you just got
              right is noise; being told the one you missed is the only
              teaching this format has room for. */}
          {revealed && picked !== question.answer ? (
            <p className="sixty__explain">{question.explanation}</p>
          ) : null}
        </div>
      ) : (
        <div className="sixty__card">
          <p className="sixty__prompt">Out of questions. That is a first.</p>
        </div>
      )}
    </section>
  );
}
