import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLUMNS,
  ROWS,
  EMPTY_BOARD,
  applyMove,
  columnLabel,
  landingRow,
  statusOf,
  type Board,
  type Player,
} from "./engine";
import { chooseColumn, type Difficulty } from "./ai";
import { usePlayStore } from "../../progress/playStore";
import { RoundSummary } from "../../components/RoundSummary";
import type { AppliedRound } from "../../progress/applyRound";
import { playTone } from "../../sound";

type Mode = "computer" | "friend";

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const PLAYER_NAME: Record<Player, string> = { R: "Red", Y: "Yellow" };

/**
 * Four-in-a-Row. Unlimited rounds, no timer, no lives, no paywall — press
 * "New game" as many times as you like.
 *
 * You play Red and always move first against the computer, which is the
 * convention people expect and also the fairer side to give a human against a
 * searching opponent.
 */
export function FourInARow({ onBackToHub }: { onBackToHub: () => void }) {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [mode, setMode] = useState<Mode>("computer");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [thinking, setThinking] = useState(false);
  const [applied, setApplied] = useState<AppliedRound | null>(null);
  const [lastColumn, setLastColumn] = useState<number | null>(null);

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  // Guards against recording the same finished game twice — the status
  // effect below runs on every render while the board sits in its final
  // state, and each run would otherwise be another round in the stats.
  const recordedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const status = statusOf(board);
  const humanPlayer: Player = "R";

  const reset = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    recordedRef.current = false;
    setBoard(EMPTY_BOARD);
    setThinking(false);
    setApplied(null);
    setLastColumn(null);
  }, []);

  // Changing the mode or difficulty starts a fresh game — continuing a
  // half-played board against a different opponent isn't a meaningful result.
  useEffect(() => {
    reset();
  }, [mode, difficulty, reset]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const drop = (column: number) => {
    if (status.kind !== "playing") return;
    if (thinking) return;
    if (mode === "computer" && status.turn !== humanPlayer) return;
    const next = applyMove(board, column);
    // applyMove returns the SAME reference for an illegal move, which is how
    // a full column or a rapid double-click is rejected without a second check.
    if (next === board) return;
    setBoard(next);
    setLastColumn(column);
    if (soundEnabled) playTone(mode === "computer" ? 320 : 300, 0.06);
  };

  // The computer's reply, on a short delay so it reads as a move rather than
  // a board that changed instantly under your finger.
  useEffect(() => {
    if (mode !== "computer") return;
    const current = statusOf(board);
    if (current.kind !== "playing" || current.turn === humanPlayer) return;

    setThinking(true);
    timerRef.current = window.setTimeout(() => {
      const column = chooseColumn(board, difficulty);
      setThinking(false);
      if (column === null) return;
      setBoard((b) => {
        // Re-derive from the latest board: a reset while the timer was
        // pending must not have the AI's move land on the fresh board.
        // Bound to a local so the union narrows — calling statusOf() twice
        // gives TypeScript two unrelated values and `.turn` isn't on both.
        const latest = statusOf(b);
        if (latest.kind !== "playing" || latest.turn === humanPlayer) return b;
        return applyMove(b, column);
      });
      setLastColumn(column);
      if (soundEnabled) playTone(260, 0.06);
    }, 380);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [board, mode, difficulty, soundEnabled]);

  // Record the finished game exactly once.
  useEffect(() => {
    if (status.kind === "playing" || recordedRef.current) return;
    recordedRef.current = true;

    const won = status.kind === "won" && status.player === humanPlayer;
    const flags: string[] = [];
    if (mode === "computer" && won && difficulty === "hard") flags.push("four-in-a-row:beat-hard");

    setApplied(
      recordRound({
        gameId: "four-in-a-row",
        // Board games have no natural score; 1 for a win keeps "best score"
        // meaningful without inventing a points system that isn't there.
        score: won ? 1 : 0,
        outcome: status.kind === "draw" ? "draw" : won ? "win" : mode === "friend" ? "complete" : "loss",
        flags,
      })
    );
    if (soundEnabled) playTone(won ? 660 : 200, 0.18);
  }, [status, mode, difficulty, recordRound, soundEnabled]);

  const winningCells = status.kind === "won" ? new Set(status.line) : new Set<number>();

  const statusText = () => {
    if (status.kind === "won") {
      if (mode === "friend") return `${PLAYER_NAME[status.player]} wins!`;
      return status.player === humanPlayer ? "You win! 🎉" : "Computer wins";
    }
    if (status.kind === "draw") return "Draw, board full";
    if (thinking) return "Computer is thinking…";
    if (mode === "friend") return `${PLAYER_NAME[status.turn]}'s turn`;
    return status.turn === humanPlayer ? "Your turn (Red)" : "Computer's turn";
  };

  const finished = status.kind !== "playing";

  return (
    <div className="game game--four">
      <div className="play-controls">
        <div className="play-segmented" role="group" aria-label="Opponent">
          <button type="button" className={mode === "computer" ? "active" : ""} onClick={() => setMode("computer")}>
            vs Computer
          </button>
          <button type="button" className={mode === "friend" ? "active" : ""} onClick={() => setMode("friend")}>
            2 Players
          </button>
        </div>

        {mode === "computer" && (
          <div className="play-segmented play-segmented--small" role="group" aria-label="Difficulty">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button key={d} type="button" className={difficulty === d ? "active" : ""} onClick={() => setDifficulty(d)}>
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={`play-status ${status.kind === "won" ? "play-status--won" : ""}`} role="status" aria-live="polite">
        {statusText()}
      </p>

      {/* One button per column rather than per cell: you choose a column in
          Connect Four, and 7 large targets are far easier to hit on a phone
          than 42 small ones. */}
      <div className="four">
        <div className="four__columns">
          {Array.from({ length: COLUMNS }, (_, column) => (
            <button
              key={column}
              type="button"
              className="four__column"
              onClick={() => drop(column)}
              disabled={finished || thinking || landingRow(board, column) < 0 || (mode === "computer" && status.kind === "playing" && status.turn !== humanPlayer)}
              aria-label={columnLabel(board, column)}
            >
              <span aria-hidden="true">▼</span>
            </button>
          ))}
        </div>

        <div className="four__board" role="grid" aria-label="Four in a row board">
          {Array.from({ length: ROWS }, (_, row) => (
            <div key={row} className="four__row" role="row">
              {Array.from({ length: COLUMNS }, (_, column) => {
                const index = row * COLUMNS + column;
                const cell = board[index];
                return (
                  <div
                    key={column}
                    role="gridcell"
                    aria-label={cell ? `${PLAYER_NAME[cell]} disc` : "empty"}
                    className={[
                      "four__cell",
                      cell ? `four__cell--${cell.toLowerCase()}` : "",
                      winningCells.has(index) ? "four__cell--winning" : "",
                      lastColumn === column && cell ? "four__cell--dropped" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {finished ? (
        <RoundSummary
          gameTitle="Four-in-a-Row"
          headline={statusText()}
          detail={mode === "computer" ? `Opponent: ${DIFFICULTY_LABEL[difficulty]}` : "Two players"}
          score={status.kind === "won" && status.player === humanPlayer ? 1 : 0}
          // Only a real win, and only against the computer: beating a friend
          // sitting next to you is not something to hand out a certificate for,
          // and a draw is not a win.
          won={status.kind === "won" && status.player === humanPlayer && mode === "computer"}
          scoreLabel="Result"
          applied={applied}
          onPlayAgain={reset}
          onBackToHub={onBackToHub}
        />
      ) : (
        <button type="button" className="play-btn play-btn--quiet" onClick={reset}>
          Restart
        </button>
      )}
    </div>
  );
}
