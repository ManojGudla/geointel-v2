import { useCallback, useEffect, useRef, useState } from "react";
import { Flag } from "../../components/Flag";
import {
  GRID_COLUMNS,
  GRID_LABEL,
  buildDeck,
  flipCard,
  PEEK_COST_FRACTION,
  PEEK_MS,
  applyPeek,
  hideUnmatched,
  isComplete,
  memoryScore,
  peekAll,
  type Card,
  type GridSize,
} from "./memoryEngine";
import { RoundSummary } from "../../components/RoundSummary";
import { usePlayStore } from "../../progress/playStore";
import type { AppliedRound } from "../../progress/applyRound";
import { playTone } from "../../sound";
import "./GeoMemory.css";

const SIZES: GridSize[] = [12, 16, 20];

/**
 * Geo Memory. Flip two cards; if the flags match they stay up.
 *
 * The clock starts on your FIRST flip, not when the board appears — so
 * looking at the layout before you begin costs you nothing, and the score
 * measures play rather than reading speed.
 */
export function GeoMemory({ onBackToHub }: { onBackToHub: () => void }) {
  const [size, setSize] = useState<GridSize>(16);
  const [nonce, setNonce] = useState(0);
  const [cards, setCards] = useState<Card[]>(() => buildDeck(16, `memory-0`));
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  /** Whether the peek hint was used this board. Costs part of the score. */
  const [peeked, setPeeked] = useState(false);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const hideTimer = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const reset = useCallback(
    (nextSize: GridSize) => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      const seed = `memory-${nextSize}-${Date.now()}`;
      setCards(buildDeck(nextSize, seed));
      setMoves(0);
      setSeconds(0);
      setRunning(false);
      setFinished(false);
      setApplied(null);
      setPeeked(false);
      recordedRef.current = false;
    },
    []
  );

  useEffect(() => {
    reset(size);
  }, [size, nonce, reset]);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  // The clock. Only runs while playing, and is cleared the moment the board
  // is complete so the recorded time is the time you actually took.
  useEffect(() => {
    if (!running || finished) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, finished]);

  const onFlip = (id: number) => {
    if (finished) return;
    const result = flipCard(cards, id);
    if (result.cards === cards) return; // illegal flip — nothing happened

    if (!running) setRunning(true);
    setCards(result.cards);
    setMoves((m) => m + result.movesDelta);

    if (result.matched) {
      if (soundEnabled) playTone(660, 0.09);
      if (isComplete(result.cards)) {
        setFinished(true);
        setRunning(false);
        if (soundEnabled) window.setTimeout(() => playTone(880, 0.2), 120);
      }
      return;
    }

    if (result.mismatch) {
      if (soundEnabled) playTone(260, 0.06);
      // Long enough to actually see and remember the second card.
      hideTimer.current = window.setTimeout(() => setCards((c) => hideUnmatched(c)), 850);
    }
  };

  useEffect(() => {
    if (!finished || recordedRef.current) return;
    recordedRef.current = true;
    // A perfect board is one pair per move — every flip a match, nothing
    // turned over twice.
    const perfect = moves === size / 2 && !peeked;
    setApplied(
      recordRound({
        gameId: "geo-memory",
        score: applyPeek(memoryScore(size, moves, seconds), peeked),
        outcome: "complete",
        perfect,
        // A peeked board is not a perfect board, whatever the move count.
        flags: perfect && !peeked ? ["geo-memory:perfect"] : [],
      })
    );
  }, [finished, moves, seconds, size, peeked, recordRound]);

  const matchedPairs = cards.filter((c) => c.matched).length / 2;
  const totalPairs = size / 2;

  if (finished) {
    const score = applyPeek(memoryScore(size, moves, seconds), peeked);
    const perfectMoves = totalPairs;
    return (
      <div className="game">
        <RoundSummary
          gameTitle="Geo Memory"
          headline={`All ${totalPairs} pairs found`}
          detail={
            moves === perfectMoves
              ? `Perfect: ${moves} moves, no mistakes, in ${seconds}s.`
              : `${moves} moves in ${seconds}s. A perfect game is ${perfectMoves} moves.`
          }
          score={score}
          applied={applied}
          onPlayAgain={() => setNonce((n) => n + 1)}
          onBackToHub={onBackToHub}
        />
      </div>
    );
  }

  return (
    <div className="game game--memory">
      <div className="play-controls">
        <div className="play-segmented play-segmented--small" role="group" aria-label="Board size">
          {SIZES.map((s) => (
            <button key={s} type="button" className={size === s ? "active" : ""} onClick={() => setSize(s)}>
              {GRID_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="play-roundbar">
        <span>
          {matchedPairs} / {totalPairs} pairs
        </span>
        <span>
          {moves} moves · {seconds}s
        </span>
      </div>

      <div
        className="memory__grid"
        style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS[size]}, 1fr)` }}
        role="group"
        aria-label="Memory board"
      >
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`memory__card${card.flipped || card.matched ? " memory__card--up" : ""}${card.matched ? " memory__card--matched" : ""}`}
            onClick={() => onFlip(card.id)}
            disabled={card.matched}
            // Face-down cards must not leak their contents to a screen reader,
            // or the game is trivially solvable without playing it.
            aria-label={
              card.flipped || card.matched
                ? `${card.face === "flag" ? `Flag of ${card.country}` : card.country}, ${card.matched ? "matched" : "face up"}`
                : "Face-down card"
            }
          >
            <span
              className={`memory__face${card.face === "name" ? " memory__face--name" : ""}`}
              aria-hidden="true"
            >
              {card.flipped || card.matched ? (
                card.face === "flag" ? (
                  <Flag code={card.code} size={54} />
                ) : (
                  card.country
                )
              ) : (
                "🌍"
              )}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="play-btn play-btn--quiet"
        disabled={peeked || finished}
        onClick={() => {
          if (peeked) return;
          setPeeked(true);
          setCards((c) => peekAll(c));
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => setCards((c) => hideUnmatched(c)), PEEK_MS);
        }}
        title="Turn every card over for a moment"
      >
        {peeked ? "Peek used" : `👀 Peek (−${Math.round(PEEK_COST_FRACTION * 100)}% of your score)`}
      </button>

      <button type="button" className="play-btn play-btn--quiet" onClick={() => setNonce((n) => n + 1)}>
        New board
      </button>
    </div>
  );
}
