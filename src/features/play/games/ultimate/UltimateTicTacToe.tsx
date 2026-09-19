import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayStore } from "../../progress/playStore";
import { playTone } from "../../sound";
import {
  applyClassic,
  applyMove,
  bestClassicMove,
  bestMove,
  createClassic,
  createUltimate,
  legalMoves,
  type ClassicState,
  type Difficulty,
  type Player,
  type UltimateState,
} from "./ultimateEngine";
import "./UltimateTicTacToe.css";

/**
 * Tic-Tac-Toe, in the version that is actually worth playing.
 *
 * The plain 3×3 game is solved: two people who know what they are doing draw
 * every time, which is why it was the least liked thing in the hub. Ultimate
 * keeps the familiar rules and adds one twist that creates real depth — the
 * cell you take decides which board your opponent must play in next — so every
 * move is two decisions, and nobody has solved it.
 *
 * Classic is still here as a mode. Some people want it, and hiding it to make
 * a point would be precious. It is simply not the default.
 */

type Mode = "ultimate" | "classic";
type Opponent = "computer" | "friend";

const MODE_BLURB: Record<Mode, string> = {
  ultimate:
    "Win a small board to claim that square of the big board. The cell you play decides which board your opponent must play in next.",
  classic: "The 3×3 everyone knows. On Hard the computer plays perfectly, so the best you can get is a draw.",
};

export function UltimateTicTacToe({ onBackToHub }: { onBackToHub: () => void }) {
  const [mode, setMode] = useState<Mode>("ultimate");
  const [opponent, setOpponent] = useState<Opponent>("computer");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [game, setGame] = useState<UltimateState>(() => createUltimate("X"));
  const [classic, setClassic] = useState<ClassicState>(() => createClassic("X"));

  const recordRound = usePlayStore((s) => s.recordRound);
  const soundEnabled = usePlayStore((s) => s.soundEnabled);
  const recordedRef = useRef(false);

  const winner = mode === "ultimate" ? game.winner : classic.winner;
  const turn: Player = mode === "ultimate" ? game.turn : classic.turn;
  /** The human is always X; O is the computer unless two people are playing. */
  const humanTurn = opponent === "friend" || turn === "X";

  const reset = useCallback(() => {
    recordedRef.current = false;
    setGame(createUltimate("X"));
    setClassic(createClassic("X"));
  }, []);

  useEffect(() => reset(), [mode, opponent, difficulty, reset]);

  /**
   * The computer's reply, deferred a beat so the player's own move paints
   * first — an instant answer reads as if the board moved by itself.
   *
   * There is deliberately no "thinking" state flag here. There was one, and it
   * deadlocked the game completely: setting it re-ran this effect, whose
   * cleanup cleared the timer before it could ever fire, so the computer never
   * moved and the board sat on "thinking…" forever. `humanTurn` already
   * prevents double-scheduling — the effect only runs while it is false, and
   * applying the move flips it back.
   *
   * Every engine test passed throughout. The bug lived entirely in the
   * effect's dependency list, which is why only playing the game in a browser
   * could find it.
   */
  useEffect(() => {
    if (winner || humanTurn) return;
    const timer = window.setTimeout(() => {
      if (mode === "ultimate") {
        setGame((current) => {
          const move = bestMove(current, difficulty);
          return move ? applyMove(current, move[0], move[1]) : current;
        });
      } else {
        setClassic((current) => {
          const move = bestClassicMove(current, difficulty);
          return move === null ? current : applyClassic(current, move);
        });
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [winner, humanTurn, mode, difficulty]);

  useEffect(() => {
    if (!winner || recordedRef.current) return;
    recordedRef.current = true;
    if (soundEnabled) playTone(winner === "X" ? 880 : 300, 0.14);
    recordRound({
      gameId: "tic-tac-toe",
      score: winner === "X" ? 1 : 0,
      outcome: winner === "draw" ? "draw" : winner === "X" ? "win" : "loss",
      flags: winner === "X" && mode === "ultimate" && difficulty === "hard" ? ["ultimate:beat-hard"] : undefined,
    });
  }, [winner, mode, difficulty, recordRound, soundEnabled]);

  const playable = useMemo(() => {
    if (mode !== "ultimate" || winner || !humanTurn) return new Set<string>();
    return new Set(legalMoves(game).map(([b, c]) => `${b}-${c}`));
  }, [game, mode, winner, humanTurn]);

  const take = (board: number, cell: number) => {
    if (winner || !humanTurn) return;
    if (mode === "ultimate") {
      const next = applyMove(game, board, cell);
      if (next === game) return; // illegal; the board says why
      if (soundEnabled) playTone(520, 0.05);
      setGame(next);
    } else {
      const next = applyClassic(classic, cell);
      if (next === classic) return;
      if (soundEnabled) playTone(520, 0.05);
      setClassic(next);
    }
  };

  const status = (() => {
    if (winner === "draw") return "A draw.";
    if (winner) return opponent === "friend" ? `${winner} wins.` : winner === "X" ? "You win." : "The computer wins.";
    if (!humanTurn) return "The computer is thinking…";
    if (mode === "classic") return `Your turn (${turn}).`;
    return game.activeBoard === null
      ? "Your turn. You can play in any board."
      : `Your turn. You must play in the highlighted board.`;
  })();

  return (
    <section className="uttt" aria-label="Tic-Tac-Toe">
      <div className="uttt__controls">
        <div className="uttt__group" role="group" aria-label="Mode">
          {(["ultimate", "classic"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "active" : ""} onClick={() => setMode(m)} aria-pressed={mode === m}>
              {m === "ultimate" ? "Ultimate" : "Classic 3×3"}
            </button>
          ))}
        </div>
        <div className="uttt__group" role="group" aria-label="Opponent">
          {(["computer", "friend"] as const).map((o) => (
            <button key={o} type="button" className={opponent === o ? "active" : ""} onClick={() => setOpponent(o)} aria-pressed={opponent === o}>
              {o === "computer" ? "vs Computer" : "Two players"}
            </button>
          ))}
        </div>
        {opponent === "computer" && (
          <div className="uttt__group" role="group" aria-label="Difficulty">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button key={d} type="button" className={difficulty === d ? "active" : ""} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>
                {d[0]!.toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="uttt__blurb">{MODE_BLURB[mode]}</p>
      <p className={`uttt__status${winner ? " uttt__status--done" : ""}`} role="status">{status}</p>

      {mode === "ultimate" ? (
        <div className="uttt__big" aria-label="Nine boards">
          {game.boards.map((cells, b) => {
            const owner = game.status[b];
            const isActive = !winner && humanTurn && (game.activeBoard === null || game.activeBoard === b) && owner === null;
            return (
              <div
                key={b}
                className={`uttt__board${isActive ? " uttt__board--active" : ""}${owner ? ` uttt__board--won uttt__board--${owner}` : ""}`}
              >
                {owner && owner !== "draw" ? <span className="uttt__claim" aria-label={`Board won by ${owner}`}>{owner}</span> : null}
                {owner === "draw" ? <span className="uttt__claim uttt__claim--draw">–</span> : null}
                {cells.map((v, c) => (
                  <button
                    key={c}
                    type="button"
                    className={`uttt__cell${v ? ` uttt__cell--${v}` : ""}`}
                    disabled={!playable.has(`${b}-${c}`)}
                    onClick={() => take(b, c)}
                    aria-label={`Board ${b + 1}, cell ${c + 1}${v ? `, ${v}` : ", empty"}`}
                  >
                    {v ?? ""}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="uttt__board uttt__board--solo" aria-label="Board">
          {classic.cells.map((v, c) => (
            <button
              key={c}
              type="button"
              className={`uttt__cell${v ? ` uttt__cell--${v}` : ""}`}
              disabled={Boolean(v) || Boolean(winner) || !humanTurn}
              onClick={() => take(0, c)}
              aria-label={`Cell ${c + 1}${v ? `, ${v}` : ", empty"}`}
            >
              {v ?? ""}
            </button>
          ))}
        </div>
      )}

      <div className="uttt__actions">
        <button type="button" className="uttt__primary" onClick={reset}>
          New game
        </button>
        <button type="button" className="uttt__ghost" onClick={onBackToHub}>
          ← All games
        </button>
      </div>
    </section>
  );
}
