import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  ROWS,
  EMPTY_BOARD,
  applyMove,
  cellAt,
  getWinner,
  indexOf,
  isDraw,
  landingRow,
  legalColumns,
  statusOf,
  turnOf,
  type Board,
} from "@/features/play/games/fourInARow/engine";
import { chooseColumn, evaluate } from "@/features/play/games/fourInARow/ai";

/** Plays a list of columns in order onto an empty board. */
function play(columns: number[]): Board {
  return columns.reduce<Board>((b, c) => applyMove(b, c), EMPTY_BOARD);
}

describe("four-in-a-row board", () => {
  it("is 7 wide and 6 tall", () => {
    expect(COLUMNS).toBe(7);
    expect(ROWS).toBe(6);
    expect(EMPTY_BOARD).toHaveLength(42);
  });

  it("starts empty with red to move", () => {
    expect(EMPTY_BOARD.every((c) => c === null)).toBe(true);
    expect(turnOf(EMPTY_BOARD)).toBe("R");
  });

  it("drops discs to the bottom of the column", () => {
    const b = applyMove(EMPTY_BOARD, 3);
    expect(cellAt(b, ROWS - 1, 3)).toBe("R");
    expect(cellAt(b, 0, 3)).toBeNull();
  });

  it("stacks discs on top of each other", () => {
    const b = play([3, 3, 3]);
    expect(cellAt(b, 5, 3)).toBe("R");
    expect(cellAt(b, 4, 3)).toBe("Y");
    expect(cellAt(b, 3, 3)).toBe("R");
  });

  it("alternates turns", () => {
    expect(turnOf(play([0]))).toBe("Y");
    expect(turnOf(play([0, 1]))).toBe("R");
  });

  it("refuses to drop into a full column and returns the same board", () => {
    const full = play([2, 2, 2, 2, 2, 2]);
    expect(landingRow(full, 2)).toBe(-1);
    expect(applyMove(full, 2)).toBe(full);
    expect(legalColumns(full)).not.toContain(2);
  });

  it("refuses out-of-range columns", () => {
    expect(applyMove(EMPTY_BOARD, -1)).toBe(EMPTY_BOARD);
    expect(applyMove(EMPTY_BOARD, COLUMNS)).toBe(EMPTY_BOARD);
  });

  it("never mutates the board it is given", () => {
    const before = EMPTY_BOARD.slice();
    applyMove(EMPTY_BOARD, 3);
    expect(EMPTY_BOARD).toEqual(before);
  });
});

describe("four-in-a-row win detection", () => {
  it("detects a horizontal four", () => {
    // R takes 0,1,2,3 along the bottom; Y answers in column 6 each time.
    const b = play([0, 6, 1, 6, 2, 6, 3]);
    const win = getWinner(b);
    expect(win?.player).toBe("R");
    expect(win?.line.sort((a, z) => a - z)).toEqual([
      indexOf(5, 0),
      indexOf(5, 1),
      indexOf(5, 2),
      indexOf(5, 3),
    ]);
  });

  it("detects a vertical four", () => {
    const b = play([2, 3, 2, 3, 2, 3, 2]);
    expect(getWinner(b)?.player).toBe("R");
  });

  it("detects a rising diagonal", () => {
    //  col:   0    1    2    3
    //  R at (5,0) (4,1) (3,2) (2,3)
    const b = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    const win = getWinner(b);
    expect(win?.player).toBe("R");
    expect(win?.line).toHaveLength(4);
  });

  it("detects a falling diagonal", () => {
    // Mirror of the rising case, built on the right-hand side.
    const b = play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
    expect(getWinner(b)?.player).toBe("R");
  });

  it("does not call three in a row a win", () => {
    expect(getWinner(play([0, 6, 1, 6, 2]))).toBeNull();
  });

  it("does not join two players' discs into a line", () => {
    const b = play([0, 3, 1, 4, 2]); // R at 0,1,2 - Y at 3,4. Not a win.
    expect(getWinner(b)).toBeNull();
  });

  it("freezes the game once someone has won", () => {
    const won = play([0, 6, 1, 6, 2, 6, 3]);
    expect(applyMove(won, 5)).toBe(won);
    expect(statusOf(won).kind).toBe("won");
  });

  it("reports a draw only on a full board with no winner", () => {
    expect(isDraw(EMPTY_BOARD)).toBe(false);
  });
});

describe("four-in-a-row AI", () => {
  it("takes an immediate win at every difficulty", () => {
    // R has three on the bottom row and it is R's move.
    const b = play([0, 6, 1, 6, 2, 6]);
    expect(turnOf(b)).toBe("R");
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      expect(chooseColumn(b, difficulty)).toBe(3);
    }
  });

  it("blocks an opponent's immediate win at medium and hard", () => {
    // R has 0,1,2 on the bottom row and it is Y's move, so Y must play 3.
    // Y's own discs are spread across three different columns on purpose -
    // an earlier version of this test stacked them all in one column, which
    // gave Y a vertical win of its own, and the AI correctly took the win
    // instead of blocking. Taking a win beats blocking; the position has to
    // leave Y with nothing better to do than block.
    //
    //   . . . . . . .
    //   . . . . . . .
    //   . . . . . . .
    //   . . . . . . .
    //   . . . . . . .
    //   R R R . Y . Y   <- R threatens column 3
    const b = play([0, 6, 1, 4, 2]);
    expect(turnOf(b)).toBe("Y");
    expect(getWinner(b)).toBeNull();
    // Sanity: Y genuinely has no winning move available, so blocking is the
    // only correct choice rather than merely one of two.
    for (const c of legalColumns(b)) {
      if (c === 3) continue;
      expect(getWinner(applyMove(b, c))).toBeNull();
    }
    expect(chooseColumn(b, "medium")).toBe(3);
    expect(chooseColumn(b, "hard")).toBe(3);
  });

  it("prefers the centre on an empty board at hard", () => {
    expect(chooseColumn(EMPTY_BOARD, "hard")).toBe(3);
  });

  it("returns a legal column at every difficulty", () => {
    const b = play([3, 3, 4, 2, 1, 5]);
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const column = chooseColumn(b, difficulty)!;
      expect(legalColumns(b)).toContain(column);
    }
  });

  it("returns null when the game is over", () => {
    const won = play([0, 6, 1, 6, 2, 6, 3]);
    expect(chooseColumn(won, "hard")).toBeNull();
  });

  it("scores an open three as good for the player who owns it", () => {
    // R has 0,1,2 open at 3; Y has two scattered discs and no threat of its
    // own. (Giving Y a stacked column here would give Y its own open three,
    // which the evaluation weights MORE heavily than R's - deliberately, so
    // the search treats an incoming loss as more urgent than its own win -
    // and the position would correctly score negative for R.)
    const b = play([0, 6, 1, 4, 2]);
    expect(evaluate(b, "R")).toBeGreaterThan(0);
    expect(evaluate(b, "Y")).toBeLessThan(0);
  });

  it("weights blocking an open three above building one", () => {
    // Same shape for both sides; the side to blame for the threat is the one
    // the evaluation punishes harder.
    const mine = play([0, 6, 1, 4, 2]);
    const theirs = play([6, 0, 4, 1, 3, 2]);
    expect(evaluate(theirs, "R")).toBeLessThan(-evaluate(mine, "Y"));
  });

  it("hard beats easy over a full game", () => {
    // Hard plays red, easy plays yellow. Not a coin flip - if this ever
    // fails, the search has genuinely regressed.
    let board: Board = EMPTY_BOARD;
    for (let move = 0; move < 42; move++) {
      const status = statusOf(board);
      if (status.kind !== "playing") break;
      const column = chooseColumn(board, status.turn === "R" ? "hard" : "easy");
      if (column === null) break;
      board = applyMove(board, column);
    }
    const final = statusOf(board);
    expect(final.kind === "won" && final.player === "R").toBe(true);
  });
});
