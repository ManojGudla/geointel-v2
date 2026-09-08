/**
 * Tic-tac-toe rules, with no notion that a user interface exists.
 *
 * The UI must never be responsible for deciding whether a move is legal or
 * whether a game is over — that is how you end up with two moves landing at
 * once on a fast double-tap, or a click registering on a board that has
 * already been won. Everything here is a pure function over an immutable
 * board, so the same sequence of moves always produces the same result and
 * every rule can be tested without rendering anything.
 */

export type Player = "X" | "O";
export type Cell = Player | null;
/** Nine cells, row-major from the top-left. */
export type Board = readonly Cell[];

export type GameStatus = { kind: "playing"; turn: Player } | { kind: "won"; winner: Player; line: readonly number[] } | { kind: "draw" };

export const EMPTY_BOARD: Board = Object.freeze(Array(9).fill(null)) as Board;

/** Rows, then columns, then the two diagonals. */
export const WIN_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function legalMoves(board: Board): number[] {
  return board.reduce<number[]>((moves, cell, index) => (cell === null ? [...moves, index] : moves), []);
}

export function isLegalMove(board: Board, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < 9 && board[index] === null && status(board).kind === "playing";
}

/**
 * Whose turn it is, derived from the board rather than tracked separately.
 * X always starts, so a board with equal counts is X's turn. Deriving it
 * means the turn indicator can never drift out of step with the position —
 * a whole class of bug that simply cannot occur.
 */
export function turnOf(board: Board): Player {
  const placed = board.filter((c) => c !== null).length;
  return placed % 2 === 0 ? "X" : "O";
}

export function status(board: Board): GameStatus {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const value = board[a];
    if (value && value === board[b] && value === board[c]) {
      return { kind: "won", winner: value, line };
    }
  }
  if (board.every((cell) => cell !== null)) return { kind: "draw" };
  return { kind: "playing", turn: turnOf(board) };
}

/**
 * Returns a NEW board with the move applied, or the same board unchanged if
 * the move is illegal. Never throws and never mutates: an illegal move from
 * a double-click or a stale render is a no-op, not a crash and not a
 * corrupted position.
 */
export function applyMove(board: Board, index: number): Board {
  if (!isLegalMove(board, index)) return board;
  const next = [...board];
  next[index] = turnOf(board);
  return Object.freeze(next) as Board;
}

const POSITION_NAMES = [
  "Top left",
  "Top centre",
  "Top right",
  "Middle left",
  "Centre",
  "Middle right",
  "Bottom left",
  "Bottom centre",
  "Bottom right",
];

/** Screen-reader label for a cell: position plus what is in it. */
export function cellLabel(board: Board, index: number): string {
  const value = board[index];
  return `${POSITION_NAMES[index]}, ${value ? `occupied by ${value}` : "empty"}`;
}
