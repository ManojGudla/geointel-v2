import { applyMove, legalMoves, status, turnOf, type Board, type Player } from "./engine";

/**
 * The computer opponent. Three genuinely different strategies — not one
 * strategy with three labels on it.
 *
 *   Easy    plays at random. Beatable, and meant to be.
 *   Medium  takes a win and blocks a loss, otherwise plays at random. This
 *           is roughly how a person plays without thinking hard: it punishes
 *           obvious mistakes but misses forks.
 *   Hard    full minimax over the whole game tree. Tic-tac-toe is small
 *           enough (fewer than 550k positions from an empty board, and
 *           trivial in practice with alpha-beta) to solve exactly, so Hard
 *           is genuinely unbeatable — the best any opponent can achieve
 *           against it is a draw.
 *
 * Depth is included in the score so that, among equally-good outcomes, the
 * AI prefers to win sooner and lose later. Without it a solved position
 * makes every losing move look identical and the AI plays listlessly toward
 * a loss it could have delayed — which reads as a bug even though the
 * result is the same.
 */
export type Difficulty = "easy" | "medium" | "hard";

function other(player: Player): Player {
  return player === "X" ? "O" : "X";
}

function pickRandom(moves: number[], random: () => number): number {
  return moves[Math.floor(random() * moves.length)]!;
}

/** A move that immediately wins for `player`, if one exists. */
function winningMove(board: Board, player: Player): number | null {
  for (const move of legalMoves(board)) {
    if (turnOf(board) !== player) break;
    const next = applyMove(board, move);
    const result = status(next);
    if (result.kind === "won" && result.winner === player) return move;
  }
  return null;
}

function minimax(board: Board, maximisingFor: Player, depth: number, alpha: number, beta: number): { score: number; move: number | null } {
  const result = status(board);
  if (result.kind === "won") {
    return { score: result.winner === maximisingFor ? 10 - depth : depth - 10, move: null };
  }
  if (result.kind === "draw") return { score: 0, move: null };

  const isMaximising = result.turn === maximisingFor;
  let best: { score: number; move: number | null } = { score: isMaximising ? -Infinity : Infinity, move: null };

  for (const move of legalMoves(board)) {
    const { score } = minimax(applyMove(board, move), maximisingFor, depth + 1, alpha, beta);

    if (isMaximising) {
      if (score > best.score) best = { score, move };
      alpha = Math.max(alpha, score);
    } else {
      if (score < best.score) best = { score, move };
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }

  return best;
}

/**
 * The AI's move for the side to play, or null if the game is already over.
 *
 * `random` is injectable so the non-deterministic difficulties can be tested
 * deterministically — otherwise "Easy sometimes blunders" is untestable and
 * a regression in it would go unnoticed.
 */
export function chooseMove(board: Board, difficulty: Difficulty, random: () => number = Math.random): number | null {
  const state = status(board);
  if (state.kind !== "playing") return null;

  const moves = legalMoves(board);
  if (moves.length === 0) return null;

  const me = state.turn;

  if (difficulty === "easy") return pickRandom(moves, random);

  if (difficulty === "medium") {
    const win = winningMove(board, me);
    if (win !== null) return win;

    // Block the opponent's immediate win by testing each of our moves and
    // seeing whether the threat survives.
    for (const move of moves) {
      const afterOurMove = applyMove(board, move);
      if (winningMove(afterOurMove, other(me)) === null && legalMoves(afterOurMove).length > 0) {
        const opponentThreat = winningMove(board, other(me));
        if (opponentThreat !== null) return opponentThreat;
      }
    }
    const threat = winningMove(board, other(me));
    if (threat !== null) return threat;

    return pickRandom(moves, random);
  }

  return minimax(board, me, 0, -Infinity, Infinity).move ?? pickRandom(moves, random);
}
