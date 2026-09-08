import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FIFTY_FIFTY_COST, applyHint, buildQuiz, fiftyFifty, scoreAnswer, type QuizKind } from "./quizEngine";
import { Flag } from "../../components/Flag";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { playTone } from "../../sound";

interface Props {
  gameId: string;
  gameTitle: string;
  kinds: QuizKind[];
  count?: number;
  onBackToHub: () => void;
  seed?: string;
  daily?: boolean;
}

interface Answered {
  prompt: string;
  correct: boolean;
  answer: string;
  chosen: string;
  points: number;
}

/**
 * The quiz surface, shared by World Quiz and Flag Quiz (and the quiz leg of
 * the Daily Challenge). One component means the answer feedback, the speed
 * bonus and the scoring behave identically everywhere instead of drifting
 * apart per quiz.
 *
 * Answering fast is worth more, so the clock starts on each question — but
 * there's no time LIMIT, because a countdown that fails you mid-thought is
 * stressful rather than fun and makes the quiz unusable for anyone who reads
 * slowly.
 */
export function QuizGame({ gameId, gameTitle, kinds, count = 10, onBackToHub, seed, daily = false }: Props) {
  const [nonce, setNonce] = useState(0);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  /**
   * Options left after a 50/50 on THIS question, and whether it was used.
   * Kept per-question rather than globally so moving on always restores the
   * full four options.
   */
  const [narrowed, setNarrowed] = useState<string[] | null>(null);
  const [usedFiftyFifty, setUsedFiftyFifty] = useState(false);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);
  const askedAtRef = useRef(Date.now());

  const questions = useMemo(
    () => buildQuiz({ count, kinds, seed: seed ?? `${gameId}-${nonce}` }),
    [count, kinds, seed, gameId, nonce]
  );

  const question = questions[index];
  const finished = index >= questions.length;

  useEffect(() => {
    askedAtRef.current = Date.now();
  }, [index]);

  const restart = useCallback(() => {
    recordedRef.current = false;
    setNonce((n) => n + 1);
    setIndex(0);
    setChosen(null);
    setNarrowed(null);
    setUsedFiftyFifty(false);
    setAnswers([]);
    setApplied(null);
  }, []);

  const choose = (option: string) => {
    if (chosen || !question) return;
    const correct = option === question.answer;
    const seconds = (Date.now() - askedAtRef.current) / 1000;
    setChosen(option);
    setAnswers((a) => [
      ...a,
      { prompt: question.prompt, correct, answer: question.answer, chosen: option, points: applyHint(scoreAnswer(correct, seconds), usedFiftyFifty) },
    ]);
    if (soundEnabled) playTone(correct ? 680 : 200, 0.1);
  };

  const next = () => {
    const nextIndex = index + 1;
    setChosen(null);
    setNarrowed(null);
    setUsedFiftyFifty(false);
    setIndex(nextIndex);
    if (nextIndex >= questions.length && !recordedRef.current) {
      recordedRef.current = true;
      const total = answers.reduce((n, a) => n + a.points, 0);
      setApplied(
        recordRound({
          gameId: daily ? "daily" : gameId,
          score: total,
          outcome: "complete",
          daily,
          perfect: answers.length > 0 && answers.every((a) => a.correct),
        })
      );
    }
  };

  if (questions.length === 0) {
    return <p className="play-empty">No questions available for this quiz.</p>;
  }

  if (finished) {
    const right = answers.filter((a) => a.correct).length;
    const total = answers.reduce((n, a) => n + a.points, 0);
    return (
      <div className="game">
        <RoundSummary
          gameTitle={gameTitle}
          headline={`${right} of ${answers.length} correct`}
          detail={right === answers.length ? "A perfect round." : undefined}
          score={total}
          applied={applied}
          lines={answers.map((a) => `${a.correct ? "✅" : "❌"} ${a.correct ? a.answer : `${a.chosen} → ${a.answer}`}`)}
          onPlayAgain={restart}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="game game--quiz">
      <div className="play-roundbar">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span>{answers.filter((a) => a.correct).length} correct</span>
      </div>

      {/* The flag is the question in the Flag Quiz, so it carries NO alt text
          and no country name — see the note in Flag.tsx. */}
      {question.flagCode && (
        <div className="quiz__display">
          <Flag code={question.flagCode} size={220} className="flag--display" />
        </div>
      )}
      {question.display && (
        <div className="quiz__display" aria-hidden="true">
          {question.display}
        </div>
      )}

      <p className="play-prompt">{question.prompt}</p>

      {/* Stuck? Remove two wrong answers — at half the points for this
          question. Priced because a free 50/50 just inflates every score
          equally and makes the number mean less. */}
      {chosen === null && (
        <button
          type="button"
          className="quiz__hint"
          disabled={usedFiftyFifty}
          onClick={() => {
            setNarrowed(fiftyFifty(question));
            setUsedFiftyFifty(true);
          }}
        >
          {usedFiftyFifty
            ? "Two answers removed — this question is worth half"
            : `Remove two wrong answers (−${Math.round(FIFTY_FIFTY_COST * 100)}% of this question)`}
        </button>
      )}

      <div className="play-options">
        {(narrowed ?? question.options).map((option) => {
          const isAnswer = option === question.answer;
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
          <p className="play-reveal__verdict">{chosen === question.answer ? "Correct" : "Not quite"}</p>
          <p className="play-reveal__detail">{question.explanation}</p>
          <button type="button" className="play-btn play-btn--primary" onClick={next}>
            {index + 1 >= questions.length ? "See results" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
