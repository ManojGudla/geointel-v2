/**
 * Four-in-a-Row (Connect Four) - the real thing: a 7-wide, 6-tall board where
 * discs fall to the lowest empty cell in the column you pick, and you win by
 * making four in a row horizontally, vertically or on either diagonal.
 *
 * A NOTE ON THE BOARD SIZE, because it caused confusion:
 * this is a NEW game, separate from Tic-Tac-Toe. Tic-Tac-Toe in this product
 * is, and has always been, a 3×3 board with 8 win lines - that's what's in
 * src/features/games/tictactoe/engine.ts and what its tests assert. Nothing
 * here changes it. If you want "four in a row", this file is that game,
 * played the way Connect Four is actually played (gravity, 7×6), rather than
 * a 4×4 noughts-and-crosses variant, which plays badly: on 4×4 the first
 * player has an overwhelming forced advantage and most games between two
 * competent players are decided in the opening.
 *
 * Pure and immutable throughout, like the Tic-Tac-Toe engine: every function
 * takes a board and returns a value or a new board, so the UI, the AI and the
 * tests all reason about the same thing with no hidden state.
 */

export const COLUMNS = 7;
export const ROWS = 6;
export const WIN_LENGTH = 4;

export type Player = "R" | "Y";
export type Cell = Player | null;
/** Row-major, index = row * COLUMNS + column. Row 0 is the TOP row. */
export type Board = readonly Cell[];

export const EMPTY_BOARD: Board = Object.freeze(Array<Cell>(COLUMNS * ROWS).fill(null));

export function indexOf(row: number, column: number): number {
  return row * COLUMNS + column;
}

export function cellAt(board: Board, row: number, column: number): Cell {
  if (row < 0 || row >= ROWS || column < 0 || column >= COLUMNS) return null;
  return board[indexOf(row, column)] ?? null;
}

/**
 * Whose turn it is, derived from the board rather than tracked separately -
 * so it can never disagree with what's actually on the board (the bug class
 * that produces "it's your turn" while the AI is still thinking).
 */
export function turnOf(board: Board): Player {
  const played = board.reduce<number>((n, c) => (c ? n + 1 : n), 0);
  return played % 2 === 0 ? "R" : "Y";
}

/** The row a disc would land in for this column, or -1 if the column is full. */
export function landingRow(board: Board, column: number): number {
  if (column < 0 || column >= COLUMNS) return -1;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[indexOf(row, column)]) return row;
  }
  return -1;
}

export function legalColumns(board: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLUMNS; c++) if (landingRow(board, c) >= 0) out.push(c);
  return out;
}

/**
 * Drops a disc. Returns the SAME board reference for an illegal move (full
 * column, out of range, or a finished game), so a caller can cheaply detect
 * "nothing happened" - this is what stops rapid clicking from queueing extra
 * moves through the AI's think delay.
 */
export function applyMove(board: Board, column: number): Board {
  if (getWinner(board)) return board;
  const row = landingRow(board, column);
  if (row < 0) return board;
  const next = board.slice();
  next[indexOf(row, column)] = turnOf(board);
  return next;
}

/** The four directions a line can run in. Their opposites are redundant. */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // →
  [1, 0], // ↓
  [1, 1], // ↘
  [1, -1], // ↙
];

export interface Win {
  player: Player;
  /** Board indices of the four winning cells, for highlighting. */
  line: number[];
}

export function getWinner(board: Board): Win | null {
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const player = cellAt(board, row, column);
      if (!player) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [indexOf(row, column)];
        for (let step = 1; step < WIN_LENGTH; step++) {
          if (cellAt(board, row + dr * step, column + dc * step) !== player) break;
          line.push(indexOf(row + dr * step, column + dc * step));
        }
        if (line.length === WIN_LENGTH) return { player, line };
      }
    }
  }
  return null;
}

export function isDraw(board: Board): boolean {
  return !getWinner(board) && legalColumns(board).length === 0;
}

export type GameStatus =
  | { kind: "playing"; turn: Player }
  | { kind: "won"; player: Player; line: number[] }
  | { kind: "draw" };

export function statusOf(board: Board): GameStatus {
  const win = getWinner(board);
  if (win) return { kind: "won", player: win.player, line: win.line };
  if (isDraw(board)) return { kind: "draw" };
  return { kind: "playing", turn: turnOf(board) };
}

export function columnLabel(board: Board, column: number): string {
  const row = landingRow(board, column);
  if (row < 0) return `Column ${column + 1}, full`;
  return `Drop in column ${column + 1}, lands in row ${ROWS - row}`;
}
