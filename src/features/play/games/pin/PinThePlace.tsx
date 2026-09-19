import { useCallback, useMemo, useRef, useState } from "react";
import { GameMap } from "../../components/GameMap";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { formatDistanceKm, judgePin, pickRoundPlaces, MAX_PIN_SCORE, type PinDifficulty } from "./pinScoring";
import { scoreBar } from "../../share";
import { playTone } from "../../sound";
import type { Place } from "../../data/world";

const ROUNDS = 5;
const DIFFICULTY_LABEL: Record<PinDifficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

interface RoundRecord {
  place: Place;
  distanceKm: number;
  score: number;
  verdict: string;
}

/**
 * Pin the Place — you're shown a name, you click where you think it is on a
 * label-free world map, and you're scored on how close you got.
 *
 * The scoring curve is in pinScoring.ts and is exponential, so precision
 * genuinely pays. The answer is always revealed with the real distance, which
 * is what makes the game teach you something rather than just rank you.
 */
export function PinThePlace({
  onBackToHub,
  seed,
  daily = false,
}: {
  onBackToHub: () => void;
  seed?: string;
  daily?: boolean;
}) {
  const [difficulty, setDifficulty] = useState<PinDifficulty>("normal");
  const [nonce, setNonce] = useState(0);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState<{ lat: number; lon: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [applied, setApplied] = useState<AppliedRound | null>(null);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);

  // A fixed seed (the Daily Challenge) gives everyone the same five places;
  // otherwise `nonce` makes each new game a different set.
  const places = useMemo(
    () => pickRoundPlaces(ROUNDS, difficulty, seed ?? `pin-${difficulty}-${nonce}`),
    [difficulty, seed, nonce]
  );

  const place = places[index];
  const finished = index >= places.length;

  const restart = useCallback(() => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIndex(0);
    setGuess(null);
    setRevealed(false);
    setRecords([]);
    setApplied(null);
  }, []);

  const submit = () => {
    if (!guess || !place || revealed) return;
    const judged = judgePin(guess.lat, guess.lon, place);
    setRecords((r) => [...r, { place, ...judged }]);
    setRevealed(true);
    if (soundEnabled) playTone(judged.distanceKm < 100 ? 700 : 300, 0.12);
  };

  const next = () => {
    const nextIndex = index + 1;
    setGuess(null);
    setRevealed(false);
    setIndex(nextIndex);

    if (nextIndex >= places.length && !recordedRef.current) {
      recordedRef.current = true;
      const all = records;
      const total = all.reduce((n, r) => n + r.score, 0);
      // Flags come from the distances actually achieved this game, one entry
      // per qualifying guess — the "5 within 100 km" achievement counts
      // guesses, so each one has to be reported.
      const earned = all.flatMap((r) => {
        const out: string[] = [];
        if (r.distanceKm <= 25) out.push("pin-the-place:within-25km");
        if (r.distanceKm <= 100) out.push("pin-the-place:within-100km");
        return out;
      });
      setApplied(
        recordRound({
          gameId: daily ? "daily" : "pin-the-place",
          score: total,
          outcome: "complete",
          flags: earned,
          daily,
          perfect: all.every((r) => r.distanceKm <= 25),
        })
      );
    }
  };

  const totalScore = records.reduce((n, r) => n + r.score, 0);

  if (finished) {
    const bestRound = records.reduce((b, r) => (r.score > b.score ? r : b), records[0]!);
    return (
      <div className="game">
        <RoundSummary
          gameTitle="Pin the Place"
          headline={`${records.length} places · ${totalScore.toLocaleString()} points`}
          detail={`Your best was ${bestRound.place.name}, ${formatDistanceKm(bestRound.distanceKm)} away.`}
          score={totalScore}
          applied={applied}
          lines={records.map(
            (r) => `${scoreBar(r.score, MAX_PIN_SCORE)} ${r.place.name}: ${formatDistanceKm(r.distanceKm)}`
          )}
          onPlayAgain={restart}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  if (!place) return null;

  return (
    <div className="game game--pin">
      {!daily && (
        <div className="play-controls">
          <div className="play-segmented play-segmented--small" role="group" aria-label="Difficulty">
            {(["easy", "normal", "hard"] as PinDifficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                className={difficulty === d ? "active" : ""}
                onClick={() => {
                  setDifficulty(d);
                  restart();
                }}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="play-roundbar">
        <span>
          Round {index + 1} of {places.length}
        </span>
        <span>{totalScore.toLocaleString()} pts</span>
      </div>

      <p className="play-prompt">
        Where is <strong>{place.name}</strong>?
        {difficulty !== "easy" && <span className="play-prompt__hint"> ({place.country})</span>}
      </p>

      <GameMap
        style="world"
        center={[0, 20]}
        zoom={0.7}
        interactive={!revealed}
        onPick={revealed ? undefined : (lat, lon) => setGuess({ lat, lon })}
        pins={[
          ...(guess ? [{ lat: guess.lat, lon: guess.lon, kind: "guess" as const, label: "Your guess" }] : []),
          ...(revealed ? [{ lat: place.lat, lon: place.lon, kind: "answer" as const, label: place.name }] : []),
        ]}
        showConnector={revealed}
        ariaLabel={`World map: click to place your guess for ${place.name}`}
      />

      {revealed ? (
        <div className="play-reveal">
          <p className="play-reveal__verdict">{records[records.length - 1]!.verdict}</p>
          <p className="play-reveal__detail">
            You were <strong>{formatDistanceKm(records[records.length - 1]!.distanceKm)}</strong> away ·{" "}
            {records[records.length - 1]!.score.toLocaleString()} points
          </p>
          <button type="button" className="play-btn play-btn--primary" onClick={next}>
            {index + 1 >= places.length ? "See results" : "Next place"}
          </button>
        </div>
      ) : (
        <div className="play-reveal">
          <p className="play-reveal__detail">{guess ? "Happy with that? Lock it in." : "Click anywhere on the map to place your pin."}</p>
          <button type="button" className="play-btn play-btn--primary" onClick={submit} disabled={!guess}>
            Lock in my guess
          </button>
        </div>
      )}
    </div>
  );
}
