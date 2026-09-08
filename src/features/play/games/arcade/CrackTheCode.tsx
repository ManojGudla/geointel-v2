import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import { buildCodeGame, puzzlePoints } from "./puzzles";
import "./arcade.css";

/**
 * Crack the Code — deduce a symbol's value from a system of equations.
 *
 * The version of this puzzle that circulates online is usually broken: three
 * lines that are permutations of the same three symbols, given three
 * different totals. Addition is commutative, so that has no solution. Every
 * system generated here uses a different combination of symbols per line, so
 * it resolves to exactly one answer — see puzzles.ts.
 */

type Phase = "intro" | "playing" | "over";
const REVEAL_MS = 2400;

export function CrackTheCode({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("crack-the-code").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const puzzles = useMemo(() => buildCodeGame(seed), [seed]);
  const puzzle = puzzles[Math.min(round, puzzles.length - 1)];
  const askedAt = useRef(Date.now());
  const timer = useRef<number | null>(null);
  const recorded = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    askedAt.current = Date.now();
  }, [round, phase]);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({ gameId: "crack-the-code", score, outcome: "complete", perfect: solved === puzzles.length });
  }, [phase, score, solved, puzzles.length, recordRound]);

  const start = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    recorded.current = false;
    setSeed(Date.now());
    setRound(0);
    setScore(0);
    setSolved(0);
    setPicked(null);
    setPhase("playing");
  }, []);

  const answer = useCallback(
    (value: number) => {
      if (picked !== null || !puzzle) return;
      const correct = value === puzzle.answer;
      setPicked(value);
      if (soundEnabled) playTone(correct ? 880 : 200, 0.09);
      if (correct) {
        setScore((s) => s + puzzlePoints(round, (Date.now() - askedAt.current) / 1000));
        setSolved((n) => n + 1);
      }
      timer.current = window.setTimeout(() => {
        setPicked(null);
        if (round + 1 >= puzzles.length) setPhase("over");
        else setRound((r) => r + 1);
      }, REVEAL_MS);
    },
    [picked, puzzle, round, puzzles.length, soundEnabled]
  );

  const share = async () => {
    const card = buildScoreCard({
      game: "Crack the Code",
      score,
      stats: [
        { label: "Solved", value: `${solved}/${puzzles.length}` },
        { label: "Your best", value: Math.max(best, score).toLocaleString() },
      ],
    });
    const outcome = await shareScoreCard(card, `maNOWj Crack the Code — ${score.toLocaleString()}\nhttps://www.manowj.com`);
    setShared(outcome === "downloaded" ? "Saved as an image" : outcome === "shared" ? "Shared" : null);
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="arc" aria-label="Crack the Code">
        <p className="arc__eyebrow">Crack the Code</p>
        <h2 className="arc__title">Every symbol is hiding a number.</h2>
        <p className="arc__lede">Work out what each shape is worth, then answer the one being asked for.</p>
        <ul className="arc__rules">
          <li>{puzzles.length} puzzles, each with exactly one answer.</li>
          <li>Later puzzles are worth more, and solving quickly is worth more still.</li>
        </ul>
        {best > 0 ? <p className="arc__pb">Your best: {best.toLocaleString()}</p> : null}
        <div className="arc__actions">
          <button type="button" className="arc__primary" onClick={start}>
            Start
          </button>
          <button type="button" className="arc__quiet" onClick={onBackToHub}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (phase === "over") {
    return (
      <section className="arc" aria-label="Crack the Code result">
        <p className="arc__eyebrow">Finished</p>
        <p className="arc__final">{score.toLocaleString()}</p>
        {score >= best && score > 0 ? <p className="arc__pb">New personal best</p> : null}
        <dl className="arc__stats">
          <div>
            <dt>Solved</dt>
            <dd>
              {solved}/{puzzles.length}
            </dd>
          </div>
          <div>
            <dt>Your best</dt>
            <dd>{Math.max(best, score).toLocaleString()}</dd>
          </div>
        </dl>
        <div className="arc__actions">
          <button type="button" className="arc__primary" onClick={start}>
            Go again
          </button>
          <button type="button" className="arc__quiet" onClick={() => void share()}>
            {shared ?? "Share"}
          </button>
          <button type="button" className="arc__quiet" onClick={onBackToHub}>
            Back to games
          </button>
        </div>
      </section>
    );
  }

  const revealed = picked !== null;

  return (
    <section className="arc" aria-label="Crack the Code, in play">
      <header className="arc__bar">
        <button type="button" className="arc__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="arc__progress">
          Puzzle {round + 1} of {puzzles.length}
        </p>
        <p className="arc__score">{score.toLocaleString()}</p>
      </header>

      <div className="arc__card">
        <div className="arc__mono">
          {puzzle?.equations.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <p className="arc__claim">What is {puzzle?.target} worth?</p>

        <div className="arc__options">
          {puzzle?.options.map((option) => {
            const tone = !revealed
              ? ""
              : option === puzzle.answer
                ? " arc__opt--right"
                : option === picked
                  ? " arc__opt--wrong"
                  : " arc__opt--dim";
            return (
              <button
                key={option}
                type="button"
                className={`arc__opt arc__opt--big${tone}`}
                disabled={revealed}
                onClick={() => answer(option)}
              >
                {option}
              </button>
            );
          })}
        </div>

        <p className="arc__reveal">
          {revealed && puzzle ? (
            <>
              <strong>{picked === puzzle.answer ? "Cracked it. " : "Not this time. "}</strong>
              <span className="arc__source">{puzzle.solution}</span>
            </>
          ) : (
            " "
          )}
        </p>
      </div>
    </section>
  );
}
