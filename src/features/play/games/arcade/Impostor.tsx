import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import { IMPOSTOR_ROUNDS, buildImpostorGame, impostorPoints, impostorShare } from "./factGames";
import "./arcade.css";

/**
 * The Impostor - five statements, exactly one is false.
 *
 * A different kind of thinking from the other games in the hub. Those ask
 * whether you know something; this asks which of five is the weak one, which
 * you can often reason out from the two you are sure about even when the
 * other three mean nothing to you. That is why it works for people who would
 * bounce off a straight quiz.
 *
 * Scored on speed as well as correctness, because with only five statements a
 * player who spots it should beat one who reads all five three times over.
 */

type Phase = "intro" | "playing" | "over";
const REVEAL_MS = 3000;

export function Impostor({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("impostor").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [found, setFound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const rounds = useMemo(() => buildImpostorGame(seed), [seed]);
  const current = rounds[Math.min(round, rounds.length - 1)];
  const askedAt = useRef<number>(Date.now());
  const timer = useRef<number | null>(null);
  const recorded = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  // Reset the stopwatch whenever a new set of statements appears.
  useEffect(() => {
    askedAt.current = Date.now();
  }, [round, phase]);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({
      gameId: "impostor",
      score,
      outcome: "complete",
      perfect: found === rounds.length,
      flags: found === rounds.length ? ["impostor:clean"] : undefined,
    });
  }, [phase, score, found, rounds.length, recordRound]);

  const start = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    recorded.current = false;
    setSeed(Date.now());
    setRound(0);
    setScore(0);
    setFound(0);
    setPicked(null);
    setPhase("playing");
  }, []);

  const answer = useCallback(
    (id: string) => {
      if (picked !== null || !current) return;
      const correct = id === current.impostorId;
      const seconds = (Date.now() - askedAt.current) / 1000;
      setPicked(id);
      if (soundEnabled) playTone(correct ? 880 : 200, 0.09);
      if (correct) {
        setScore((s) => s + impostorPoints(true, seconds));
        setFound((f) => f + 1);
      }
      timer.current = window.setTimeout(() => {
        setPicked(null);
        // Unlike Impossible or Real, a miss does not end the game - with five
        // statements a wrong pick is often a near miss, and ending there would
        // make most runs one round long.
        if (round + 1 >= rounds.length) setPhase("over");
        else setRound((r) => r + 1);
      }, REVEAL_MS);
    },
    [picked, current, round, rounds.length, soundEnabled]
  );

  const share = async () => {
    const card = buildScoreCard({
      game: "The Impostor",
      score,
      stats: [
        { label: "Caught", value: `${found}/${rounds.length}` },
        { label: "Your best", value: Math.max(best, score).toLocaleString() },
      ],
    });
    const outcome = await shareScoreCard(card, impostorShare(score, found, rounds.length));
    setShared(outcome === "downloaded" ? "Saved as an image" : outcome === "shared" ? "Shared" : null);
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="arc" aria-label="The Impostor">
        <p className="arc__eyebrow">The Impostor</p>
        <h2 className="arc__title">Five statements. One of them is lying.</h2>
        <p className="arc__lede">
          Four are true and one is not. Find the fake. Some are obvious, some are written to fool you.
        </p>
        <ul className="arc__rules">
          <li>{IMPOSTOR_ROUNDS} rounds. A miss does not end the game.</li>
          <li>The faster you spot it, the more it is worth.</li>
          <li>Every statement shows its source afterwards.</li>
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
      <section className="arc" aria-label="The Impostor result">
        <p className="arc__eyebrow">Finished</p>
        <p className="arc__final">{score.toLocaleString()}</p>
        {score >= best && score > 0 ? <p className="arc__pb">New personal best</p> : null}
        <dl className="arc__stats">
          <div>
            <dt>Caught</dt>
            <dd>
              {found}/{rounds.length}
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
  const impostorFact = current?.statements.find((s) => s.id === current.impostorId);

  return (
    <section className="arc" aria-label="The Impostor, in play">
      <header className="arc__bar">
        <button type="button" className="arc__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="arc__progress">
          Round {round + 1} of {rounds.length}
        </p>
        <p className="arc__score">{score.toLocaleString()}</p>
      </header>

      <div className="arc__card">
        <p className="arc__eyebrow">Which one is false?</p>

        <div className="arc__options arc__options--stack">
          {current?.statements.map((statement) => {
            const isImpostor = statement.id === current.impostorId;
            const tone = !revealed
              ? ""
              : isImpostor
                ? " arc__opt--right"
                : statement.id === picked
                  ? " arc__opt--wrong"
                  : " arc__opt--dim";
            return (
              <button
                key={statement.id}
                type="button"
                className={`arc__opt${tone}`}
                disabled={revealed}
                onClick={() => answer(statement.id)}
              >
                {statement.claim}
              </button>
            );
          })}
        </div>

        <p className="arc__reveal">
          {revealed && impostorFact ? (
            <>
              <strong>{picked === current?.impostorId ? "Caught it. " : "That one was true. "}</strong>
              {impostorFact.because}
              <span className="arc__source">Source: {impostorFact.source}</span>
            </>
          ) : (
            " "
          )}
        </p>
      </div>
    </section>
  );
}
