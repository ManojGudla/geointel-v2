import { useCallback, useMemo, useRef, useState } from "react";
import { GameMap } from "../../components/GameMap";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { Flag } from "../../components/Flag";
import {
  MAX_ROUND_SCORE,
  ROUNDS,
  buildRounds,
  formatKm,
  hintsFor,
  judge,
  verdictFor,
  type CountryResult,
  type Difficulty,
  type HintKind,
} from "./countryEngine";
import "./CountryHunt.css";

/**
 * Country Hunt — you are told a country, you click where it is.
 *
 * Built because "improve the country/map games" needed something that is not
 * another multiple-choice quiz. Clicking a map uses knowledge a quiz throws
 * away: knowing roughly where Paraguay is deserves more than nothing and less
 * than full marks, and only a distance score can say that.
 *
 * The hints are the part worth explaining. Each one costs a share of the
 * round, shown on the button before you press it. A free hint would make every
 * score identical and turn the button into a "win" button; paying for help is
 * what keeps a hinted round comparable to an unhinted one, and makes taking it
 * a decision rather than a reflex.
 */
export function CountryHunt({ onBackToHub }: { onBackToHub: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [nonce, setNonce] = useState(0);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState<{ lat: number; lon: number } | null>(null);
  const [results, setResults] = useState<CountryResult[]>([]);
  const [usedHints, setUsedHints] = useState<HintKind[]>([]);
  const [revealed, setRevealed] = useState(false);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);

  const rounds = useMemo(
    () => buildRounds(ROUNDS, difficulty, `country-${difficulty}-${nonce}`),
    [difficulty, nonce]
  );
  const round = rounds[index];
  const finished = index >= rounds.length;
  const hints = useMemo(() => (round ? hintsFor(round) : []), [round]);
  const current = results[index];

  const restart = useCallback(() => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIndex(0);
    setGuess(null);
    setResults([]);
    setUsedHints([]);
    setRevealed(false);
  }, []);

  const submit = () => {
    if (!guess || !round) return;
    const result = judge(round.country, guess, difficulty, usedHints);
    setResults((prev) => [...prev, result]);
    setRevealed(true);
    if (soundEnabled) playTone(result.score >= 600 ? 820 : 320, 0.1);
  };

  const next = () => {
    if (index + 1 >= rounds.length) {
      const total = [...results].reduce((s, r) => s + r.score, 0);
      if (!recordedRef.current) {
        recordedRef.current = true;
        recordRound({
          gameId: "country-hunt",
          score: total,
          outcome: "complete",
          perfect: results.length === ROUNDS && results.every((r) => r.score === MAX_ROUND_SCORE),
          flags: results.every((r) => r.hintPenalty === 0) ? ["country-hunt:no-hints"] : undefined,
        });
      }
    }
    setIndex((i) => i + 1);
    setGuess(null);
    setUsedHints([]);
    setRevealed(false);
  };

  const total = results.reduce((s, r) => s + r.score, 0);

  if (finished) {
    const noHints = results.every((r) => r.hintPenalty === 0);
    return (
      <section className="hunt hunt--done" aria-label="Country Hunt result">
        <p className="hunt__eyebrow">Country Hunt · {difficulty}</p>
        <p className="hunt__total">
          {total.toLocaleString()}
          <span className="hunt__outof">/ {(ROUNDS * MAX_ROUND_SCORE).toLocaleString()}</span>
        </p>
        <p className="hunt__note">
          {noHints ? "No hints used. That is the full score." : "Some rounds used hints, which cost points."}
        </p>
        <ol className="hunt__review">
          {results.map((r) => (
            <li key={r.country.code}>
              <span className="hunt__review-name">
                <Flag code={r.country.code} name={r.country.name} className="flag--inline" /> {r.country.name}
              </span>
              <span className="hunt__review-score">
                {formatKm(r.distanceKm)} · {r.score}
                {r.hintPenalty > 0 ? <em> (−{r.hintPenalty} hints)</em> : null}
              </span>
            </li>
          ))}
        </ol>
        <div className="hunt__actions">
          <button type="button" className="hunt__primary" onClick={restart}>
            Play again
          </button>
          <button type="button" className="hunt__ghost" onClick={onBackToHub}>
            ← All games
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="hunt" aria-label={`Country Hunt, round ${index + 1} of ${ROUNDS}`}>
      <header className="hunt__bar">
        <div className="hunt__group" role="group" aria-label="Difficulty">
          {(["easy", "normal", "hard"] as const).map((d) => (
            <button key={d} type="button" className={difficulty === d ? "active" : ""} onClick={() => { setDifficulty(d); restart(); }} aria-pressed={difficulty === d}>
              {d[0]!.toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <p className="hunt__progress">
          Round {index + 1} of {ROUNDS}
        </p>
        <p className="hunt__running">{total.toLocaleString()} pts</p>
      </header>

      <h2 className="hunt__prompt">
        Where is <strong>{round!.country.name}</strong>?
      </h2>

      <div className="hunt__map">
        <GameMap
          style="world"
          center={revealed ? [round!.country.lon, round!.country.lat] : [10, 20]}
          zoom={revealed ? 3 : 0.6}
          interactive={!revealed}
          showConnector={revealed}
          pins={
            revealed && current
              ? [
                  { lat: current.guess.lat, lon: current.guess.lon, kind: "guess" as const },
                  { lat: round!.country.lat, lon: round!.country.lon, kind: "answer" as const, label: round!.country.name },
                ]
              : guess
                ? [{ lat: guess.lat, lon: guess.lon, kind: "guess" as const }]
                : []
          }
          onPick={revealed ? undefined : (lat, lon) => setGuess({ lat, lon })}
          ariaLabel="World map with no labels. Click where you think the country is."
        />
      </div>

      {!revealed && (
        <div className="hunt__hints">
          <p className="hunt__hints-title">Stuck? A hint costs part of this round.</p>
          <div className="hunt__hints-row">
            {hints.map((hint) => {
              const taken = usedHints.includes(hint.kind);
              return (
                <button
                  key={hint.kind}
                  type="button"
                  className={`hunt__hint${taken ? " hunt__hint--taken" : ""}`}
                  onClick={() => setUsedHints((u) => (u.includes(hint.kind) ? u : [...u, hint.kind]))}
                  disabled={taken}
                >
                  <span className="hunt__hint-label">{hint.label}</span>
                  <span className="hunt__hint-cost">−{Math.round(hint.cost * 100)}%</span>
                </button>
              );
            })}
          </div>
          {usedHints.length > 0 && (
            <ul className="hunt__hints-shown">
              {hints
                .filter((h) => usedHints.includes(h.kind))
                .map((h) => (
                  <li key={h.kind}>{h.text}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      {revealed && current ? (
        <div className="hunt__answer">
          <p className="hunt__answer-head">
            <Flag code={round!.country.code} name={round!.country.name} className="flag--inline" /> <strong>{round!.country.name}</strong>, capital{" "}
            {round!.country.capital}
          </p>
          <p className="hunt__answer-score">
            {verdictFor(current.distanceKm)} You were {formatKm(current.distanceKm)} away ·{" "}
            {current.score.toLocaleString()} points
            {current.hintPenalty > 0 ? ` (${current.hintPenalty} given up to hints)` : ""}
          </p>
          <button type="button" className="hunt__primary" onClick={next}>
            {index + 1 >= ROUNDS ? "See your score" : "Next country"}
          </button>
        </div>
      ) : (
        <div className="hunt__actions">
          <button type="button" className="hunt__primary" disabled={!guess} onClick={submit}>
            {guess ? "Lock in this guess" : "Click the map to place your pin"}
          </button>
          <button type="button" className="hunt__ghost" onClick={onBackToHub}>
            ← All games
          </button>
        </div>
      )}

      <p className="hunt__caveat">
        Scored against the country's capital, not its borders, so for very large countries, landing anywhere inside
        still loses a little distance.
      </p>
    </section>
  );
}
