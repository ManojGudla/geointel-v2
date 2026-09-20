import {
  COLUMNS,
  ROWS,
  WIN_LENGTH,
  applyMove,
  cellAt,
  getWinner,
  landingRow,
  legalColumns,
  turnOf,
  type Board,
  type Player,
} from "./engine";

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Connect Four's game tree is far too big to solve exhaustively in a browser
 * tab (about 4.5 × 10^12 positions), so "hard" is minimax to a fixed depth
 * with alpha-beta pruning and a real positional evaluation, not a solver.
 * It plays a strong club-level game: it always takes an immediate win, always
 * blocks an immediate loss, sees most two-move traps, and will beat a casual
 * player consistently. It is beatable by someone who knows the theory, which
 * is the right target - an unbeatable opponent isn't fun.
 */
const SEARCH_DEPTH: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 6 };

const WIN_SCORE = 1_000_000;

/**
 * Centre columns are worth more because more winning lines pass through
 * them - the centre column sits on 7 of the 69 possible lines, an outside
 * column on only 3. Weighting them is the single biggest cheap improvement
 * to play strength.
 */
const COLUMN_WEIGHT = [1, 2, 4, 7, 4, 2, 1];

function other(player: Player): Player {
  return player === "R" ? "Y" : "R";
}

/** Every 4-cell window on the board, computed once and reused. */
const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      for (const [dr, dc] of dirs) {
        const endRow = row + dr * (WIN_LENGTH - 1);
        const endCol = column + dc * (WIN_LENGTH - 1);
        if (endRow < 0 || endRow >= ROWS || endCol < 0 || endCol >= COLUMNS) continue;
        const w: number[] = [];
        for (let s = 0; s < WIN_LENGTH; s++) w.push((row + dr * s) * COLUMNS + (column + dc * s));
        out.push(w);
      }
    }
  }
  return out;
})();

/**
 * Positive is good for `me`. Counts how close each 4-cell window is to being
 * completed, which is what actually decides Connect Four positions - three of
 * yours plus a gap is a threat, three of theirs plus a gap is an emergency.
 */
export function evaluate(board: Board, me: Player): number {
  const them = other(me);
  let score = 0;

  for (let column = 0; column < COLUMNS; column++) {
    for (let row = 0; row < ROWS; row++) {
      if (cellAt(board, row, column) === me) score += COLUMN_WEIGHT[column]!;
      else if (cellAt(board, row, column) === them) score -= COLUMN_WEIGHT[column]!;
    }
  }

  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      const c = board[i];
      if (c === me) mine++;
      else if (c === them) theirs++;
    }
    // A window with both players in it is dead - nobody can complete it.
    if (mine && theirs) continue;
    if (mine === 3) score += 60;
    else if (mine === 2) score += 8;
    if (theirs === 3) score -= 75; // blocking is worth slightly more than building
    else if (theirs === 2) score -= 8;
  }

  return score;
}

/**
 * Move ordering: try the centre first. Alpha-beta prunes far more when it
 * sees good moves early, and in Connect Four the centre is nearly always
 * among the best.
 */
function orderedColumns(board: Board): number[] {
  return legalColumns(board).sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
}

function minimax(board: Board, depth: number, alpha: number, beta: number, me: Player): number {
  const win = getWinner(board);
  if (win) {
    // Prefer winning sooner and losing later, so the AI doesn't dawdle when
    // it has a forced win or give up early when it's losing.
    return win.player === me ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }
  const columns = orderedColumns(board);
  if (depth === 0 || columns.length === 0) return evaluate(board, me);

  const maximising = turnOf(board) === me;
  let best = maximising ? -Infinity : Infinity;

  for (const column of columns) {
    const score = minimax(applyMove(board, column), depth - 1, alpha, beta, me);
    if (maximising) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }

  return best;
}

/** Columns that win immediately for `player`, if any. */
function immediateWins(board: Board, player: Player): number[] {
  if (turnOf(board) !== player) return [];
  return legalColumns(board).filter((c) => getWinner(applyMove(board, c))?.player === player);
}

/**
 * Chooses a column. Returns null only when the board is full or finished.
 *
 * Easy is genuinely easy - it plays a random legal column, but still takes a
 * win that's sitting there, because an opponent that misses a one-move win is
 * frustrating rather than easy. Medium takes wins and blocks losses and looks
 * three moves ahead. Hard runs the full search.
 */
export function chooseColumn(board: Board, difficulty: Difficulty): number | null {
  if (getWinner(board)) return null;
  const columns = legalColumns(board);
  if (columns.length === 0) return null;

  const me = turnOf(board);

  const winNow = immediateWins(board, me);
  if (winNow.length) return winNow[0]!;

  if (difficulty === "easy") {
    return columns[Math.floor(Math.random() * columns.length)]!;
  }

  // Never drop into a column that hands the opponent a win on top of it.
  const safe = columns.filter((c) => {
    const after = applyMove(board, c);
    return immediateWins(after, other(me)).length === 0;
  });
  const candidates = safe.length ? safe : columns;

  let bestColumn = candidates[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const column of candidates.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))) {
    const score = minimax(applyMove(board, column), SEARCH_DEPTH[difficulty] - 1, alpha, Infinity, me);
    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
      alpha = Math.max(alpha, score);
    }
  }

  return bestColumn;
}

/** Landing row for the chosen column, exposed for drop animations. */
export function landingRowFor(board: Board, column: number): number {
  return landingRow(board, column);
}
