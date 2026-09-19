import { useCallback, useEffect, useRef, useState } from "react";
import { useGamesStore, EMPTY_STATS } from "@/stores/gamesStore";
import { applyMove, cellLabel, EMPTY_BOARD, status, type Board } from "./engine";
import { chooseMove, type Difficulty } from "./ai";
import "./TicTacToe.css";

type Mode = "ai" | "local";

const DIFFICULTIES: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: "easy", label: "Easy", blurb: "Plays at random." },
  { id: "medium", label: "Medium", blurb: "Takes wins and blocks losses." },
  { id: "hard", label: "Hard", blurb: "Solved. The best you can get is a draw." },
];

/** A short, honest pause so the AI's move is perceivable rather than instantaneous. */
const AI_THINKING_MS = 320;

export function TicTacToe() {
  const statsByMode = useGamesStore((s) => s.statsByMode);
  const recordResult = useGamesStore((s) => s.recordResult);
  const resetStats = useGamesStore((s) => s.resetStats);

  const [mode, setMode] = useState<Mode>("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [thinking, setThinking] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const modeKey = mode === "ai" ? `tic-tac-toe:ai:${difficulty}` : "tic-tac-toe:local";
  const stats = statsByMode[modeKey] ?? EMPTY_STATS;
  const state = status(board);

  // A finished game must be counted exactly once, however many times React
  // re-renders it. Keying on the board identity is what guarantees that.
  const countedBoard = useRef<Board | null>(null);
  useEffect(() => {
    if (state.kind === "playing" || countedBoard.current === board) return;
    countedBoard.current = board;
    recordResult(modeKey, state.kind === "draw" ? "draw" : state.winner === "X" ? "first" : "second");
  }, [board, state, modeKey, recordResult]);

  const newGame = useCallback(() => {
    setBoard(EMPTY_BOARD);
    setThinking(false);
    countedBoard.current = null;
  }, []);

  // Starting a fresh game when the mode or difficulty changes: continuing a
  // half-played board against a different opponent would make the running
  // score meaningless.
  useEffect(() => {
    newGame();
  }, [mode, difficulty, newGame]);

  /**
   * The AI's turn. The cleanup guard matters: without it, changing mode or
   * pressing New Game while the AI is mid-pause lets a stale timer land a
   * move on the fresh board.
   */
  useEffect(() => {
    if (mode !== "ai") return;
    const current = status(board);
    if (current.kind !== "playing" || current.turn !== "O") return;

    setThinking(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const move = chooseMove(board, difficulty);
      setThinking(false);
      if (move !== null) setBoard((b) => (b === board ? applyMove(b, move) : b));
    }, AI_THINKING_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setThinking(false);
    };
  }, [board, mode, difficulty]);

  // Only the human may click, and only on their turn. applyMove enforces
  // legality itself, so a rapid double-tap or a click after the game ends is
  // a no-op rather than a corrupted board.
  const humanCanPlay = state.kind === "playing" && (mode === "local" || state.turn === "X") && !thinking;

  const playCell = (index: number) => {
    if (!humanCanPlay) return;
    setBoard((b) => applyMove(b, index));
  };

  const message = (() => {
    if (state.kind === "won") {
      if (mode === "local") return `Player ${state.winner} wins`;
      return state.winner === "X" ? "🎉 You win" : "AI wins";
    }
    if (state.kind === "draw") return "Draw, good game";
    if (thinking) return "AI is thinking…";
    if (mode === "local") return `Player ${state.turn}'s turn`;
    return state.turn === "X" ? "Your turn" : "AI's turn";
  })();

  const winningLine = state.kind === "won" ? state.line : [];

  return (
    <div className="ttt">
      <div className="ttt__controls">
        <div className="ttt__segmented" role="group" aria-label="Game mode">
          <button type="button" className={mode === "ai" ? "active" : ""} aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
            Play the computer
          </button>
          <button type="button" className={mode === "local" ? "active" : ""} aria-pressed={mode === "local"} onClick={() => setMode("local")}>
            Two players
          </button>
        </div>

        {mode === "ai" && (
          <div className="ttt__segmented ttt__segmented--small" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={difficulty === d.id ? "active" : ""}
                aria-pressed={difficulty === d.id}
                onClick={() => setDifficulty(d.id)}
                title={d.blurb}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={`ttt__status ttt__status--${state.kind}`} role="status" aria-live="polite">
        {message}
      </p>

      {/* A real grid role so screen readers announce this as a board, and
          every cell carries its position and contents in words — the X and O
          glyphs are not the only way to read the game. */}
      <div className="ttt__board" role="grid" aria-label="Tic-tac-toe board">
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={`ttt__cell${cell ? ` ttt__cell--${cell.toLowerCase()}` : ""}${winningLine.includes(index) ? " ttt__cell--winning" : ""}`}
            onClick={() => playCell(index)}
            disabled={!humanCanPlay || cell !== null}
            aria-label={cellLabel(board, index)}
          >
            <span aria-hidden="true">{cell}</span>
          </button>
        ))}
      </div>

      <div className="ttt__actions">
        <button type="button" className="ttt__primary" onClick={newGame}>
          {state.kind === "playing" ? "New game" : "Play again"}
        </button>
      </div>

      <section className="ttt__scoreboard" aria-label="Scoreboard">
        <div className="ttt__scores">
          <div>
            <dt>{mode === "ai" ? "You (X)" : "Player X"}</dt>
            <dd>{stats.first}</dd>
          </div>
          <div>
            <dt>{mode === "ai" ? "AI (O)" : "Player O"}</dt>
            <dd>{stats.second}</dd>
          </div>
          <div>
            <dt>Draws</dt>
            <dd>{stats.draws}</dd>
          </div>
          <div>
            <dt>Games</dt>
            <dd>{stats.games}</dd>
          </div>
        </div>

        {/* New game and Reset statistics are deliberately far apart and
            differently weighted — wiping a running score by mistake while
            reaching for "play again" would be infuriating. */}
        {confirmingReset ? (
          <p className="ttt__confirm">
            Reset the score for this mode?
            <button
              type="button"
              onClick={() => {
                resetStats(modeKey);
                setConfirmingReset(false);
              }}
            >
              Yes, reset
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </p>
        ) : (
          <button type="button" className="ttt__reset" onClick={() => setConfirmingReset(true)} disabled={stats.games === 0}>
            Reset statistics
          </button>
        )}
      </section>

      <p className="ttt__note">
        Free and unlimited: no sign-in, no limits, no timers. Scores are kept in this browser only and are never sent anywhere.
      </p>
    </div>
  );
}
