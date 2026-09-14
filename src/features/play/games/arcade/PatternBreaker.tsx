import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { buildScoreCard, shareScoreCard } from "../../share/shareCard";
import { buildPatternGame, puzzlePoints } from "./puzzles";
import "./arcade.css";
import { PLAY_URL } from "@/features/play/share";

/**
 * Pattern Breaker — continue the sequence, against a clock.
 *
 * The clock is per puzzle rather than per game. A whole-game timer makes the
 * last puzzles worthless when you are behind; a per-puzzle one keeps every
 * single question tense right to the end, which is what the aptitude-test
 * sites this could otherwise resemble are missing.
 *
 * Every rule produces exactly one defensible continuation — see puzzles.ts.
 * Ambiguous sequences are the standard complaint magnet for this genre: the
 * player reasons correctly, the game marks them wrong, and they leave.
 */

type Phase = "intro" | "playing" | "over";
const SECONDS_PER_PUZZLE = 15;
const REVEAL_MS = 2400;

export function PatternBreaker({ onBackToHub }: { onBackToHub: () => void }) {
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const best = usePlayStore((s) => s.statsFor("pattern-breaker").bestScore);

  const [phase, setPhase] = useState<Phase>("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(SECONDS_PER_PUZZLE * 1000);
  const [shared, setShared] = useState<string | null>(null);

  const puzzles = useMemo(() => buildPatternGame(seed), [seed]);
  const puzzle = puzzles[Math.min(round, puzzles.length - 1)];
  const askedAt = useRef(Date.now());
  const timer = useRef<number | null>(null);
  const recorded = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  /**
   * Per-puzzle clock. Depends on the round and whether an answer is showing,
   * never on the value it writes — the create-cancel-create cycle that froze
   * Ultimate Tic-Tac-Toe in this project came from exactly that mistake.
   */
  useEffect(() => {
    if (phase !== "playing" || picked !== null) return;
    askedAt.current = Date.now();
    setRemaining(SECONDS_PER_PUZZLE * 1000);
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setRemaining((ms) => Math.max(0, ms - elapsed));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, picked, round]);

  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    recordRound({ gameId: "pattern-breaker", score, outcome: "complete", perfect: solved === puzzles.length });
  }, [phase, score, solved, puzzles.length, recordRound]);

  const start = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    recorded.current = false;
    setSeed(Date.now());
    setRound(0);
    setScore(0);
    setSolved(0);
    setPicked(null);
    setRemaining(SECONDS_PER_PUZZLE * 1000);
    setPhase("playing");
  }, []);

  const advance = useCallback(() => {
    setPicked(null);
    /**
     * The clock is refilled HERE, not only in the interval effect below.
     *
     * Without this line a timeout skipped the next puzzle entirely — seen in
     * a browser going straight from "1 of 10" to "3 of 10". Clearing `picked`
     * produces one render where nothing is picked and `remaining` is still
     * zero from the puzzle that just expired, and the timeout effect fires
     * again on that render before the interval effect has refilled the clock.
     *
     * Setting both in the same update closes that window. The effect below
     * still refills it too, which is harmless: it writes the same value.
     */
    setRemaining(SECONDS_PER_PUZZLE * 1000);
    if (round + 1 >= puzzles.length) setPhase("over");
    else setRound((r) => r + 1);
  }, [round, puzzles.length]);

  const answer = useCallback(
    (value: number | null) => {
      if (picked !== null || !puzzle) return;
      const correct = value === puzzle.answer;
      // -1 marks a timeout, so the reveal can still show which option was
      // right without highlighting a choice the player never made.
      setPicked(value ?? -1);
      if (soundEnabled) playTone(correct ? 880 : 200, 0.09);
      if (correct) {
        setScore((s) => s + puzzlePoints(round, (Date.now() - askedAt.current) / 1000));
        setSolved((n) => n + 1);
      }
      timer.current = window.setTimeout(advance, REVEAL_MS);
    },
    [picked, puzzle, round, soundEnabled, advance]
  );

  // Running out of time counts as a miss and moves on by itself.
  useEffect(() => {
    if (phase === "playing" && picked === null && remaining <= 0) answer(null);
  }, [phase, picked, remaining, answer]);

  const share = async () => {
    const card = buildScoreCard({
      game: "Pattern Breaker",
      score,
      stats: [
        { label: "Solved", value: `${solved}/${puzzles.length}` },
        { label: "Your best", value: Math.max(best, score).toLocaleString() },
      ],
    });
    const outcome = await shareScoreCard(card, `maNOWj Pattern Breaker — ${score.toLocaleString()}\n${PLAY_URL}`);
    setShared(outcome === "downloaded" ? "Saved as an image" : outcome === "shared" ? "Shared" : null);
    if (outcome !== "cancelled") window.setTimeout(() => setShared(null), 2600);
  };

  if (phase === "intro") {
    return (
      <section className="arc" aria-label="Pattern Breaker">
        <p className="arc__eyebrow">Pattern Breaker</p>
        <h2 className="arc__title">Find the rule. Then break it forward.</h2>
        <p className="arc__lede">A sequence of numbers appears. Work out what comes next before the clock runs out.</p>
        <ul className="arc__rules">
          <li>{SECONDS_PER_PUZZLE} seconds per puzzle, {puzzles.length} puzzles.</li>
          <li>The rules get harder as you go, and later puzzles are worth more.</li>
          <li>Every sequence has exactly one correct continuation.</li>
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
      <section className="arc" aria-label="Pattern Breaker result">
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
  const seconds = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <section className="arc" aria-label="Pattern Breaker, in play">
      <header className="arc__bar">
        <button type="button" className="arc__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="arc__progress">
          {round + 1} of {puzzles.length} · {seconds}s
        </p>
        <p className="arc__score">{score.toLocaleString()}</p>
      </header>

      <div className="arc__card">
        <p className="arc__sequence">{puzzle ? `${puzzle.terms.join("  →  ")}  →  ?` : ""}</p>
        <p className="arc__eyebrow" style={{ textAlign: "center" }}>
          What comes next?
        </p>

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
              <strong>
                {picked === puzzle.answer ? "Right. " : picked === -1 ? "Out of time. " : "Not that one. "}
              </strong>
              <span className="arc__source">{puzzle.rule}</span>
            </>
          ) : (
            " "
          )}
        </p>
      </div>
    </section>
  );
}
