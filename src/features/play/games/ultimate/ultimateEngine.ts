/**
 * Ultimate Tic-Tac-Toe.
 *
 * Plain 3×3 was removed from the hub because it is a SOLVED game: two players
 * who know what they are doing draw every single time, so there is nothing to
 * get better at. That is not a polish problem, and no amount of animation
 * fixes it.
 *
 * Ultimate keeps the rules everybody already knows and makes them deep. Nine
 * small boards arranged in a 3×3 grid. Win a small board and you claim that
 * cell of the big board; win three cells in a line and you win the game. The
 * twist that creates the whole strategy:
 *
 *   THE CELL YOU PLAY IN DECIDES WHICH BOARD YOUR OPPONENT MUST PLAY IN NEXT.
 *
 * Play the middle cell of any board and your opponent is sent to the middle
 * board. So every move is two decisions at once: what it does here, and where
 * it sends them. It takes ten seconds to explain and nobody has solved it.
 *
 * Classic 3×3 is still available as a mode, because someone will want it and
 * refusing to include it would be precious. It is just not the headline.
 */

export type Player = "X" | "O";
export type Cell = Player | null;
/** A finished small board is won by someone, or drawn ("draw"), or still open (null). */
export type BoardStatus = Player | "draw" | null;

export interface UltimateState {
  /** Nine boards of nine cells, both in reading order. */
  boards: Cell[][];
  /** Result of each small board, in the same order. */
  status: BoardStatus[];
  turn: Player;
  /**
   * Which small board the current player MUST play in, or null for "anywhere".
   * Null happens on the first move and whenever you are sent to a board that
   * is already finished.
   */
  activeBoard: number | null;
  winner: BoardStatus;
  /** Move history as [board, cell], so a game can be replayed or undone. */
  moves: Array<[number, number]>;
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function createUltimate(first: Player = "X"): UltimateState {
  return {
    boards: Array.from({ length: 9 }, () => Array<Cell>(9).fill(null)),
    status: Array<BoardStatus>(9).fill(null),
    turn: first,
    activeBoard: null,
    winner: null,
    moves: [],
  };
}

/** Winner of one nine-cell board, "draw" when full, null while still open. */
export function lineWinner(cells: readonly Cell[]): BoardStatus {
  for (const [a, b, c] of LINES) {
    const v = cells[a];
    if (v && v === cells[b] && v === cells[c]) return v;
  }
  return cells.every((c) => c !== null) ? "draw" : null;
}

/**
 * The big board is decided by the SMALL BOARD RESULTS, and a drawn small board
 * belongs to nobody. Treating "draw" as a claimable value would let a player
 * win the game with squares neither of them actually won.
 */
export function overallWinner(status: readonly BoardStatus[]): BoardStatus {
  const owned = status.map((s) => (s === "X" || s === "O" ? s : null));
  for (const [a, b, c] of LINES) {
    const v = owned[a];
    if (v && v === owned[b] && v === owned[c]) return v;
  }
  return status.every((s) => s !== null) ? "draw" : null;
}

/** Every legal [board, cell] the player to move may take. */
export function legalMoves(state: UltimateState): Array<[number, number]> {
  if (state.winner) return [];
  const boards =
    state.activeBoard !== null && state.status[state.activeBoard] === null
      ? [state.activeBoard]
      : state.status.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);

  const moves: Array<[number, number]> = [];
  for (const b of boards) {
    for (let c = 0; c < 9; c++) {
      if (state.boards[b]![c] === null) moves.push([b, c]);
    }
  }
  return moves;
}

export function isLegal(state: UltimateState, board: number, cell: number): boolean {
  return legalMoves(state).some(([b, c]) => b === board && c === cell);
}

/**
 * Plays a move. Returns the SAME object when the move is illegal, so a caller
 * can detect a rejected click by reference without a thrown error - the same
 * contract the four-in-a-row engine used.
 */
export function applyMove(state: UltimateState, board: number, cell: number): UltimateState {
  if (!isLegal(state, board, cell)) return state;

  const boards = state.boards.map((b, i) => (i === board ? b.slice() : b));
  boards[board]![cell] = state.turn;

  const status = state.status.slice();
  status[board] = lineWinner(boards[board]!);

  // Being sent to a finished board means "play anywhere" - otherwise the game
  // would deadlock with a player who has no legal move.
  const nextActive = status[cell] === null ? cell : null;

  return {
    boards,
    status,
    turn: state.turn === "X" ? "O" : "X",
    activeBoard: nextActive,
    winner: overallWinner(status),
    moves: [...state.moves, [board, cell]],
  };
}

// ── AI ────────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Search depth in plies.
 *
 * Ultimate has a far larger branching factor than 3×3 - up to 81 openings -
 * so depth is expensive and these are tuned to stay responsive in a browser
 * rather than to play perfectly. Easy is deliberately beatable; hard should
 * make a good player concentrate.
 */
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 5 };

/** Corners and the centre of a small board are worth more, as in the plain game. */
const CELL_WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

/**
 * Position score from X's point of view.
 *
 * Won small boards dominate, because they are what actually wins the game;
 * cell-level control is a tiebreaker. The middle board counts extra: it takes
 * part in four of the eight winning lines.
 */
export function evaluate(state: UltimateState): number {
  const winner = state.winner;
  if (winner === "X") return 100_000;
  if (winner === "O") return -100_000;

  let score = 0;
  for (let b = 0; b < 9; b++) {
    const owner = state.status[b];
    const boardWeight = CELL_WEIGHT[b]!;
    if (owner === "X") score += 200 * boardWeight;
    else if (owner === "O") score -= 200 * boardWeight;
    else if (owner === null) {
      for (let c = 0; c < 9; c++) {
        const v = state.boards[b]![c];
        if (v === "X") score += CELL_WEIGHT[c]!;
        else if (v === "O") score -= CELL_WEIGHT[c]!;
      }
    }
  }

  // Two-in-a-line on the big board, with the third still winnable.
  for (const [a, b, c] of LINES) {
    const line = [state.status[a], state.status[b], state.status[c]];
    for (const p of ["X", "O"] as const) {
      const mine = line.filter((s) => s === p).length;
      const open = line.filter((s) => s === null).length;
      if (mine === 2 && open === 1) score += p === "X" ? 400 : -400;
    }
  }
  return score;
}

function search(state: UltimateState, depth: number, alpha: number, beta: number): number {
  if (state.winner || depth === 0) return evaluate(state);

  const moves = legalMoves(state);
  if (moves.length === 0) return evaluate(state);

  if (state.turn === "X") {
    let best = -Infinity;
    for (const [b, c] of moves) {
      best = Math.max(best, search(applyMove(state, b, c), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const [b, c] of moves) {
    best = Math.min(best, search(applyMove(state, b, c), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * The computer's move.
 *
 * An immediate win is taken before any search, and an immediate loss blocked,
 * regardless of difficulty. A search that misses a win on the board in front
 * of it looks broken to a player no matter how sound the reasoning underneath.
 *
 * `pickIndex` exists so tests can make the choice deterministic instead of
 * depending on Math.random for tie-breaks.
 */
export function bestMove(
  state: UltimateState,
  difficulty: Difficulty,
  pickIndex: (count: number) => number = (n) => Math.floor(Math.random() * n)
): [number, number] | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  const me = state.turn;
  const opponent: Player = me === "X" ? "O" : "X";

  for (const [b, c] of moves) {
    if (applyMove(state, b, c).winner === me) return [b, c];
  }
  for (const [b, c] of moves) {
    const theirs: UltimateState = { ...state, turn: opponent };
    if (isLegal(theirs, b, c) && applyMove(theirs, b, c).winner === opponent) return [b, c];
  }

  if (difficulty === "easy") return moves[pickIndex(moves.length)]!;

  const depth = DEPTH[difficulty];
  let bestScore = me === "X" ? -Infinity : Infinity;
  let bestMoves: Array<[number, number]> = [];

  for (const [b, c] of moves) {
    const score = search(applyMove(state, b, c), depth - 1, -Infinity, Infinity);
    const better = me === "X" ? score > bestScore : score < bestScore;
    if (better) {
      bestScore = score;
      bestMoves = [[b, c]];
    } else if (score === bestScore) {
      bestMoves.push([b, c]);
    }
  }
  return bestMoves[pickIndex(bestMoves.length)]!;
}

// ── Classic 3×3, kept as a mode ───────────────────────────────────────────

export interface ClassicState {
  cells: Cell[];
  turn: Player;
  winner: BoardStatus;
}

export function createClassic(first: Player = "X"): ClassicState {
  return { cells: Array<Cell>(9).fill(null), turn: first, winner: null };
}

export function applyClassic(state: ClassicState, cell: number): ClassicState {
  if (state.winner || state.cells[cell] !== null) return state;
  const cells = state.cells.slice();
  cells[cell] = state.turn;
  return { cells, turn: state.turn === "X" ? "O" : "X", winner: lineWinner(cells) };
}

/**
 * Perfect play for the classic board - it is small enough to solve outright,
 * so there is no reason to approximate. On "hard" this cannot be beaten, which
 * is exactly the point being made: the classic game has a ceiling.
 */
export function bestClassicMove(
  state: ClassicState,
  difficulty: Difficulty,
  pickIndex: (count: number) => number = (n) => Math.floor(Math.random() * n)
): number | null {
  const open = state.cells.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  if (open.length === 0 || state.winner) return null;

  const me = state.turn;
  const opponent: Player = me === "X" ? "O" : "X";
  for (const i of open) if (applyClassic(state, i).winner === me) return i;
  for (const i of open) if (applyClassic({ ...state, turn: opponent }, i).winner === opponent) return i;
  if (difficulty === "easy") return open[pickIndex(open.length)]!;

  const solve = (s: ClassicState, depth: number): number => {
    if (s.winner === "X") return 10 - depth;
    if (s.winner === "O") return depth - 10;
    if (s.winner === "draw") return 0;
    const spots = s.cells.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
    const scores = spots.map((i) => solve(applyClassic(s, i), depth + 1));
    return s.turn === "X" ? Math.max(...scores) : Math.min(...scores);
  };

  let bestScore = me === "X" ? -Infinity : Infinity;
  let best: number[] = [];
  for (const i of open) {
    const score = solve(applyClassic(state, i), 0);
    const better = me === "X" ? score > bestScore : score < bestScore;
    if (better) {
      bestScore = score;
      best = [i];
    } else if (score === bestScore) best.push(i);
  }
  return best[pickIndex(best.length)]!;
}
