import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameMap } from "../../components/GameMap";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import { Flag } from "../../components/Flag";
import { localDateKey } from "../../lib/random";
import { useDailyStore } from "./dailyStore";
import { REGION_VIEW } from "./dailyLocations";
import {
  MAX_CLUES,
  MAX_DAY_SCORE,
  ROUNDS_PER_DAY,
  bandFor,
  clueMultiplier,
  cluesRevealed,
  formatCountdown,
  formatDistance,
  msUntilNextDay,
  puzzleNumber,
  roundsForDate,
  scoreGuess,
  shareText,
  totalScore,
  type RoundResult,
} from "./dailyEngine";
import "./DailyChallenge.css";

/**
 * maNOWj Daily — five satellite views, one guess each, the same five for
 * everyone, once a day.
 *
 * This replaced ten games that could each be played endlessly. The reason is
 * not that those games were badly built; it is that "play whenever you like,
 * as much as you like" gives nobody a reason to come back tomorrow, and none
 * of them used the one thing this product has that a games site doesn't: real
 * satellite imagery of the whole world.
 *
 * Three decisions carry the whole design:
 *
 *   One run a day. Scarcity is what makes a score worth comparing and worth
 *   returning for. Unlimited replays would make the shared card meaningless.
 *
 *   The answer always teaches something. Every location ends with a fact, so
 *   a bad guess is still worth having made. This is what separates it from a
 *   quiz that only tells you that you were wrong.
 *
 *   The shared result is colours only. It proves how you did without spoiling
 *   the day for whoever reads it — the property that let Wordle spread.
 */

type Phase = "intro" | "guessing" | "revealed" | "finished";

const BAND_SQUARE: Record<ReturnType<typeof bandFor>, string> = {
  perfect: "🟩",
  great: "🟨",
  good: "🟧",
  fair: "🟥",
  miss: "⬜",
};

/**
 * The clue button says the price up front, every time.
 *
 * A help button that quietly costs points is worse than no help at all,
 * because the player only finds out when the score comes back lower than they
 * expected and the game looks like it cheated them.
 */
function clueButtonLabel(used: number): string {
  if (used === 0) return "No idea? Take a free clue";
  if (used === 1) return "Another clue: costs 20% of this round";
  return "Last clue: costs another 35%";
}

export function DailyChallenge({ onBackToHub }: { onBackToHub: () => void }) {
  const dateKey = useMemo(() => localDateKey(), []);
  const locations = useMemo(() => roundsForDate(dateKey), [dateKey]);

  const today = useDailyStore((s) => s.today);
  const streak = useDailyStore((s) => s.streak);
  const bestTotal = useDailyStore((s) => s.bestTotal);
  const hydrate = useDailyStore((s) => s.hydrate);
  const complete = useDailyStore((s) => s.complete);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);

  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState<{ lat: number; lon: number } | null>(null);
  const [cluesUsed, setCluesUsed] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(() => msUntilNextDay());
  const recordedRef = useRef(false);

  useEffect(() => hydrate(), [hydrate]);

  // Already played today: go straight to the result rather than letting
  // someone start a run whose score can never be recorded.
  useEffect(() => {
    if (today?.dateKey === dateKey && phase === "intro") setPhase("finished");
  }, [today, dateKey, phase]);

  useEffect(() => {
    if (phase !== "finished") return;
    const timer = window.setInterval(() => setCountdown(msUntilNextDay()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const location = locations[index]!;
  const current = results[index];

  const submit = useCallback(() => {
    if (!guess) return;
    const result = scoreGuess(location, guess, cluesUsed);
    setResults((prev) => [...prev, result]);
    setPhase("revealed");
    // Judged on the raw guess, not the clue-adjusted score: someone who used
    // all three clues and still landed on the place deserves the good sound.
    if (soundEnabled) playTone(result.rawScore >= 3500 ? 880 : 320, 0.12);
  }, [guess, location, cluesUsed, soundEnabled]);

  const next = useCallback(() => {
    const done = index + 1 >= ROUNDS_PER_DAY;
    if (!done) {
      setIndex((i) => i + 1);
      setGuess(null);
      // Clues are per round. Carrying them over would silently tax rounds the
      // player never asked for help on.
      setCluesUsed(0);
      setPhase("guessing");
      return;
    }
    setPhase("finished");
  }, [index]);

  // Recording happens once, when the run actually finishes — not on every
  // render of the finished screen, which a stale tab would otherwise repeat.
  useEffect(() => {
    if (phase !== "finished" || recordedRef.current) return;
    if (results.length < ROUNDS_PER_DAY) return;
    recordedRef.current = true;
    complete(results);
    recordRound({
      gameId: "daily",
      score: totalScore(results),
      outcome: "complete",
      daily: true,
      perfect: results.every((r) => bandFor(r.score) === "perfect"),
      flags: results.some((r) => r.distanceKm <= 1) ? ["daily:pinpoint"] : undefined,
    });
  }, [phase, results, complete, recordRound]);

  const total = results.length > 0 ? totalScore(results) : (today?.total ?? 0);
  const grid =
    results.length > 0
      ? results.map((r) => BAND_SQUARE[bandFor(r.score)]).join("")
      : (today?.scores ?? []).map((s) => BAND_SQUARE[bandFor(s)]).join("");

  const share = async () => {
    const text = shareText(
      results.length > 0 ? results : (today?.scores ?? []).map((s) => ({ score: s }) as RoundResult),
      dateKey,
      streak
    );
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Cancelled, or no permission. Nothing to recover from and nothing
      // worth interrupting the player with.
    }
  };

  if (phase === "intro") {
    return (
      <section className="daily daily--intro" aria-label="Daily Challenge">
        <p className="daily__eyebrow">Daily #{puzzleNumber(dateKey)}</p>
        <h2 className="daily__title">Five places. One guess each.</h2>
        <p className="daily__lede">
          You get a satellite view with no labels and no names. Drop a pin where you think it is. The closer you
          land, the more points you score.
        </p>
        <ul className="daily__rules">
          <li>Everyone in the world gets the same five places today.</li>
          <li>One run a day: no retries, so the score means something.</li>
          <li>Every answer ends with something worth knowing about the place.</li>
          <li>Stuck on one? The first clue is free. Two more cost part of that round.</li>
        </ul>
        {streak > 0 ? <p className="daily__streak">🔥 {streak} day streak going</p> : null}
        <button type="button" className="daily__primary" onClick={() => setPhase("guessing")}>
          Start today's challenge
        </button>
      </section>
    );
  }

  if (phase === "finished") {
    return (
      <section className="daily daily--result" aria-label="Daily Challenge result">
        <p className="daily__eyebrow">Daily #{puzzleNumber(dateKey)} · complete</p>
        <p className="daily__total">
          {total.toLocaleString()}
          <span className="daily__outof">/ {MAX_DAY_SCORE.toLocaleString()}</span>
        </p>
        <p className="daily__grid" aria-label="Your round-by-round result">
          {grid}
        </p>

        <dl className="daily__stats">
          <div>
            <dt>Streak</dt>
            <dd>🔥 {streak}</dd>
          </div>
          <div>
            <dt>Your best</dt>
            <dd>{bestTotal.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Next puzzle</dt>
            <dd className="daily__countdown">{formatCountdown(countdown)}</dd>
          </div>
        </dl>

        <button type="button" className="daily__primary" onClick={() => void share()}>
          {copied ? "Copied. Now paste it" : "Share your score"}
        </button>
        <p className="daily__note">
          The shared card shows colours only, never the places, so it can't spoil anyone's day.
        </p>

        {results.length > 0 ? (
          <ol className="daily__review">
            {results.map((r) => (
              <li key={r.location.id}>
                <span className="daily__review-square">{BAND_SQUARE[bandFor(r.score)]}</span>
                <span className="daily__review-name">
                  <Flag code={r.location.countryCode} name={r.location.country} className="flag--inline" /> {r.location.name}
                </span>
                <span className="daily__review-score">
                  {formatDistance(r.distanceKm)} · {r.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <p className="daily__note daily__note--quiet">
          Your streak is saved in this browser only. There are no accounts here, so it won't follow you to another
          device.
        </p>
      </section>
    );
  }

  const revealed = phase === "revealed" && current;

  const shownClues = cluesRevealed(location, cluesUsed);
  const keptShare = clueMultiplier(cluesUsed);
  const regionView = REGION_VIEW[location.region];

  /**
   * The continent is given away from the start, and the guess map opens on it.
   *
   * It used to be the reward for taking the first clue, and the round before
   * that clue was genuinely unanswerable. The player saw a top-down crop of
   * ordinary low-rise buildings — no signs, no vehicles, no vegetation, none
   * of the things that make a street-level guessing game work — beside a map
   * of the entire planet four centimetres wide. There is no skill that turns
   * that into a pin. It is a lottery, and it reads as a broken game.
   *
   * Handing over the continent costs almost nothing: knowing a place is in
   * Asia still leaves 44 million square kilometres to find it in. What it buys
   * is the ability to AIM, which is the difference between a hard question and
   * an impossible one. The clues now narrow within the region instead of
   * rescuing the player from a blank globe.
   */
  const guessCenter: [number, number] = revealed ? [location.lon, location.lat] : regionView.center;
  const guessZoom = revealed ? 3 : regionView.zoom;

  return (
    <section className="daily daily--play" aria-label={`Daily Challenge, round ${index + 1} of ${ROUNDS_PER_DAY}`}>
      <header className="daily__bar">
        <button type="button" className="daily__back" onClick={onBackToHub}>
          ← Quit
        </button>
        <p className="daily__progress">
          Round {index + 1} of {ROUNDS_PER_DAY}
          {/* Named out loud as well as shown on the map, so the player knows
              what they have been given rather than having to infer it from
              where the map happens to be pointing. */}
          {!revealed && <span className="daily__region"> · somewhere in {location.region}</span>}
        </p>
        <p className="daily__running">{totalScore(results).toLocaleString()} pts</p>
      </header>

      <div className="daily__view">
        <p className="daily__viewlabel">The place</p>
        {/* This photo has always been draggable and zoomable, and almost
            nobody realised, because nothing on screen said so. Pulling back to
            find a coastline is the single most useful move in the game and it
            costs nothing, so it should not be a secret.

            Placed ABOVE the map on purpose: the map is sized by a rule in the
            stylesheet, and a paragraph sitting after it used to take that
            height for itself and flatten the map to nothing. */}
        <p className="daily__viewhint">Drag and zoom this photo. Pull back to find the coastline.</p>
        <GameMap
          style="satellite"
          center={[location.lon, location.lat]}
          zoom={location.zoom}
          interactive
          pins={[]}
          ariaLabel="Satellite view of the place to identify. Zoom and pan to look around."
        />
      </div>

      <div className="daily__view">
        <p className="daily__viewlabel">{revealed ? "How close you were" : "Your guess: click the map"}</p>
        <GameMap
          style="world"
          center={guessCenter}
          zoom={guessZoom}
          interactive={!revealed}
          showConnector={Boolean(revealed)}
          pins={
            revealed
              ? [
                  { lat: current!.guess.lat, lon: current!.guess.lon, kind: "guess" as const },
                  { lat: location.lat, lon: location.lon, kind: "answer" as const, label: location.name },
                ]
              : guess
                ? [{ lat: guess.lat, lon: guess.lon, kind: "guess" as const }]
                : []
          }
          onPick={revealed ? undefined : (lat, lon) => setGuess({ lat, lon })}
          ariaLabel="World map. Click where you think the place is."
        />
      </div>

      {revealed ? (
        <div className="daily__answer">
          <p className="daily__answer-head">
            <span className="daily__answer-name">
              <Flag code={location.countryCode} name={location.country} className="flag--inline" /> {location.name}
            </span>
            <span className="daily__answer-country">{location.country}</span>
          </p>
          <p className="daily__answer-score">
            You were <strong>{formatDistance(current!.distanceKm)}</strong> away · {current!.score.toLocaleString()}{" "}
            {current!.score === 1 ? "point" : "points"}
          </p>
          {/* Only when a PAID clue was taken. The first one is free, so saying
              "less 0%" would read as a penalty that never happened. */}
          {current!.cluesUsed > 1 ? (
            <p className="daily__answer-clues">
              {current!.rawScore.toLocaleString()} for the guess, less{" "}
              {Math.round((1 - clueMultiplier(current!.cluesUsed)) * 100)}% for{" "}
              {current!.cluesUsed === 2 ? "a clue" : "two clues"}.
            </p>
          ) : null}
          <p className="daily__answer-fact">{location.fact}</p>
          <button type="button" className="daily__primary" onClick={next}>
            {index + 1 >= ROUNDS_PER_DAY ? "See your result" : "Next place"}
          </button>
        </div>
      ) : (
        <div className="daily__action">
          {shownClues.length > 0 ? (
            <ol className="daily__cluelist">
              {shownClues.map((text) => (
                <li key={text} className="daily__clue">
                  {text}
                </li>
              ))}
            </ol>
          ) : null}

          {cluesUsed < MAX_CLUES ? (
            <button type="button" className="daily__clue-btn" onClick={() => setCluesUsed((n) => n + 1)}>
              {clueButtonLabel(cluesUsed)}
            </button>
          ) : (
            <p className="daily__clue-cost">That is every clue for this one. The rest is up to you.</p>
          )}

          {keptShare < 1 ? (
            <p className="daily__clue-cost">This round is now scoring at {Math.round(keptShare * 100)}%.</p>
          ) : null}

          <button type="button" className="daily__primary" disabled={!guess} onClick={submit}>
            {guess ? "Lock in this guess" : "Click the world map to place your pin"}
          </button>
        </div>
      )}
    </section>
  );
}
