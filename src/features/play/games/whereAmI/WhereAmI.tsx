import { useCallback, useMemo, useRef, useState } from "react";
import { GameMap } from "../../components/GameMap";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { PLACES, type Place } from "../../data/world";
import { createRng } from "../../lib/random";
import { playTone } from "../../sound";

const ROUNDS = 5;
const OPTION_COUNT = 4;

interface Answered {
  place: Place;
  chosen: string;
  correct: boolean;
  points: number;
}

/**
 * Where Am I? - you're dropped on real satellite imagery with every label
 * stripped out, and you pick which place you're looking at.
 *
 * The imagery is genuinely the place in question (Esri World Imagery at the
 * real coordinates), not a stock photo - which is what makes it a geography
 * game rather than a picture quiz. Distractors come from the same country
 * where possible so the shapes and terrain actually have to be read.
 *
 * You can pan and zoom out to look around; zooming out far enough will
 * eventually give the answer away, which is fine - that's the player choosing
 * to spend the points, and the score reflects it.
 */
export function WhereAmI({ onBackToHub, seed, daily = false }: { onBackToHub: () => void; seed?: string; daily?: boolean }) {
  const [nonce, setNonce] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);

  const rounds = useMemo(() => {
    const rng = createRng(seed ?? `where-${nonce}`);
    // Prefer places whose satellite view is actually distinctive - a random
    // suburb of a random city is not a fair question.
    const pool = PLACES.filter((p) => p.landmark || p.fame <= 2);
    return rng.sample(pool, ROUNDS).map((place) => {
      const others = rng
        .shuffle(PLACES.filter((p) => p.name !== place.name))
        // Same country first: telling Mumbai from Chennai is a real question,
        // telling Mumbai from Reykjavík is not.
        .sort((a, b) => Number(b.countryCode === place.countryCode) - Number(a.countryCode === place.countryCode))
        .slice(0, OPTION_COUNT - 1)
        .map((p) => p.name);
      return { place, options: rng.shuffle([place.name, ...others]) };
    });
  }, [seed, nonce]);

  const current = rounds[index];
  const finished = index >= rounds.length;

  const restart = useCallback(() => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIndex(0);
    setAnswers([]);
    setChosen(null);
    setApplied(null);
  }, []);

  const choose = (option: string) => {
    if (chosen || !current) return;
    const correct = option === current.place.name;
    setChosen(option);
    setAnswers((a) => [...a, { place: current.place, chosen: option, correct, points: correct ? 200 : 0 }]);
    if (soundEnabled) playTone(correct ? 700 : 200, 0.12);
  };

  const next = () => {
    const nextIndex = index + 1;
    setChosen(null);
    setIndex(nextIndex);
    if (nextIndex >= rounds.length && !recordedRef.current) {
      recordedRef.current = true;
      const total = answers.reduce((n, a) => n + a.points, 0);
      const allRight = answers.every((a) => a.correct);
      setApplied(
        recordRound({
          gameId: daily ? "daily" : "where-am-i",
          score: total,
          outcome: "complete",
          daily,
          perfect: allRight,
        })
      );
    }
  };

  if (finished) {
    const right = answers.filter((a) => a.correct).length;
    const total = answers.reduce((n, a) => n + a.points, 0);
    return (
      <div className="game">
        <RoundSummary
          gameTitle="Where Am I?"
          headline={`${right} of ${answers.length} correct`}
          score={total}
          applied={applied}
          lines={answers.map((a) => `${a.correct ? "✅" : "❌"} ${a.place.name}${a.correct ? "" : ` (you said ${a.chosen})`}`)}
          onPlayAgain={restart}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="game game--where">
      <div className="play-roundbar">
        <span>
          Round {index + 1} of {rounds.length}
        </span>
        <span>{answers.filter((a) => a.correct).length} correct</span>
      </div>

      <p className="play-prompt">Which place is this?</p>

      <GameMap
        style="satellite"
        center={[current.place.lon, current.place.lat]}
        zoom={current.place.landmark ? 14 : 11.5}
        interactive
        pins={chosen ? [{ lat: current.place.lat, lon: current.place.lon, kind: "answer", label: current.place.name }] : []}
        ariaLabel="Satellite imagery of an unnamed place"
      />

      <div className="play-options">
        {current.options.map((option) => {
          const isAnswer = option === current.place.name;
          const state = !chosen ? "" : isAnswer ? " play-option--right" : option === chosen ? " play-option--wrong" : "";
          return (
            <button key={option} type="button" className={`play-option${state}`} onClick={() => choose(option)} disabled={!!chosen}>
              {option}
            </button>
          );
        })}
      </div>

      {chosen && (
        <div className="play-reveal">
          <p className="play-reveal__verdict">
            {chosen === current.place.name ? "Correct" : `It was ${current.place.name}`}
          </p>
          <p className="play-reveal__detail">
            {current.place.name}, {current.place.country}
          </p>
          <button type="button" className="play-btn play-btn--primary" onClick={next}>
            {index + 1 >= rounds.length ? "See results" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
