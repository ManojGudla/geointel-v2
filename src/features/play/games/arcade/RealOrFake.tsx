import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import { buildRealOrFakeQueue, realOrFakePoints, realOrFakeShare } from "./factGames";
import "./arcade.css";

/**
 * Impossible or Real — survival.
 *
 * One claim at a time, REAL or FAKE, and a single wrong answer ends the run.
 * Survival rather than a timer for two reasons: the result is one number
 * anyone understands without explanation ("I got 14"), and every answer
 * carries real weight, which is exactly what 60 Seconds deliberately gives up
 * in exchange for pace. Two games, two different feelings.
 *
 * The reveal always shows the source. Being wrong here should end in learning
 * where the real answer comes from, which is the whole reason these are built
 * on a sourced bank instead of scraped trivia.
 */

type Phase = "intro" | "playing" | "over";
const REVEAL_MS = 2200;

export function RealOrFake({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("real-or-fake").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const queue = useMemo(() => buildRealOrFakeQueue(seed), [seed]);
  const fact = queue[Math.min(index, queue.length - 1)];
  const timer = useRef<number | null>(null);
  const recorded = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({ gameId: "real-or-fake", score, outcome: "complete", flags: streak >= 10 ? ["real:ten"] : undefined });
  }, [phase, score, streak, recordRound]);

  const start = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    recorded.current = false;
    setSeed(Date.now());
    setIndex(0);
    setStreak(0);
    setScore(0);
    setPicked(null);
    setPhase("playing");
  }, []);

  const answer = useCallback(
    (saidReal: boolean) => {
      if (picked !== null || !fact) return;
      const correct = saidReal === fact.isTrue;
      setPicked(saidReal);
      if (soundEnabled) playTone(correct ? 880 : 200, 0.09);

      if (correct) {
        setScore((s) => s + realOrFakePoints(streak));
        setStreak((s) => s + 1);
      }

      timer.current = window.setTimeout(() => {
        setPicked(null);
        // A wrong answer ends the run. That is the entire mechanic — without
        // it there is nothing at stake and the streak means nothing.
        if (correct) setIndex((i) => i + 1);
        else setPhase("over");
      }, REVEAL_MS);
    },
    [picked, fact, streak, soundEnabled]
  );

  const share = async () => {
    const card = buildScoreCard({
      game: "Impossible or Real",
      score: streak,
      stats: [
        { label: "In a row", value: streak },
        { label: "Points", value: score.toLocaleString() },
        { label: "Your best", value: Math.max(best, score).toLocaleString() },
      ],
    });
    const outcome = await shareScoreCard(card, realOrFakeShare(streak, 0));
    setShared(outcome === "downloaded" ? "Saved as an image" : outcome === "shared" ? "Shared" : null);
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="arc" aria-label="Impossible or Real">
        <p className="arc__eyebrow">Impossible or Real</p>
        <h2 className="arc__title">One wrong answer ends the run.</h2>
        <p className="arc__lede">
          A claim appears. Decide whether it is genuinely true or made up. Keep going for as long as you can.
        </p>
        <ul className="arc__rules">
          <li>Every correct answer is worth more than the last.</li>
          <li>One mistake and the run is over.</li>
          <li>Each answer shows why, and where it comes from.</li>
        </ul>
        {best > 0 ? <p className="arc__pb">Your best: {best.toLocaleString()} points</p> : null}
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
      <section className="arc" aria-label="Impossible or Real result">
        <p className="arc__eyebrow">Run over</p>
        <p className="arc__final">{streak}</p>
        <p className="arc__lede">{streak === 1 ? "claim in a row" : "claims in a row"}</p>
        {score >= best && score > 0 ? <p className="arc__pb">New personal best</p> : null}
        <dl className="arc__stats">
          <div>
            <dt>Points</dt>
            <dd>{score.toLocaleString()}</dd>
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
  const wasRight = revealed && picked === fact?.isTrue;

  return (
    <section className="arc" aria-label="Impossible or Real, in play">
      <header className="arc__bar">
        <button type="button" className="arc__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="arc__progress">{streak} in a row</p>
        <p className="arc__score">{score.toLocaleString()}</p>
      </header>

      <div className="arc__card">
        <p className="arc__claim">{fact?.claim}</p>

        <div className="arc__options">
          <button
            type="button"
            className={`arc__opt arc__opt--big${
              !revealed ? "" : fact?.isTrue ? " arc__opt--right" : picked === true ? " arc__opt--wrong" : " arc__opt--dim"
            }`}
            disabled={revealed}
            onClick={() => answer(true)}
          >
            REAL
          </button>
          <button
            type="button"
            className={`arc__opt arc__opt--big${
              !revealed ? "" : !fact?.isTrue ? " arc__opt--right" : picked === false ? " arc__opt--wrong" : " arc__opt--dim"
            }`}
            disabled={revealed}
            onClick={() => answer(false)}
          >
            FAKE
          </button>
        </div>

        <p className="arc__reveal">
          {revealed && fact ? (
            <>
              <strong>{wasRight ? "Correct. " : "Not quite. "}</strong>
              {fact.because}
              <span className="arc__source">Source: {fact.source}</span>
            </>
          ) : (
            " "
          )}
        </p>
      </div>
    </section>
  );
}
