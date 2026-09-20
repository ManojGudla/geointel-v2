import { describe, expect, it } from "vitest";
import { applyMove, cellLabel, EMPTY_BOARD, isLegalMove, legalMoves, status, turnOf, type Board, type Cell } from "@/features/games/tictactoe/engine";
import { chooseMove, type Difficulty } from "@/features/games/tictactoe/ai";

/** "X.O|.X.|..O" -> board, for readable fixtures. */
function board(spec: string): Board {
  const cells = spec.replace(/\|/g, "").split("") as string[];
  return cells.map((c) => (c === "X" || c === "O" ? (c as Cell) : null));
}

/** Plays a whole game between two strategies and reports the outcome. */
function playOut(xDifficulty: Difficulty, oDifficulty: Difficulty, seed = 1): "X" | "O" | "draw" {
  let rng = seed;
  const random = () => {
    rng = (rng * 1103515245 + 12345) % 2147483648;
    return rng / 2147483648;
  };
  let current: Board = EMPTY_BOARD;
  for (let i = 0; i < 9; i += 1) {
    const state = status(current);
    if (state.kind !== "playing") break;
    const move = chooseMove(current, state.turn === "X" ? xDifficulty : oDifficulty, random);
    if (move === null) break;
    current = applyMove(current, move);
  }
  const final = status(current);
  return final.kind === "won" ? final.winner : "draw";
}

describe("tic-tac-toe engine", () => {
  it("starts empty with X to play", () => {
    expect(legalMoves(EMPTY_BOARD)).toHaveLength(9);
    expect(turnOf(EMPTY_BOARD)).toBe("X");
    expect(status(EMPTY_BOARD)).toEqual({ kind: "playing", turn: "X" });
  });

  it("detects a win on a row", () => {
    expect(status(board("XXX|OO.|..."))).toEqual({ kind: "won", winner: "X", line: [0, 1, 2] });
  });

  it("detects a win on a column", () => {
    expect(status(board("X.O|X.O|X..")).kind).toBe("won");
    expect(status(board("X.O|X.O|X.."))).toMatchObject({ winner: "X", line: [0, 3, 6] });
  });

  it("detects a win on both diagonals", () => {
    expect(status(board("X.O|.X.|O.X"))).toMatchObject({ winner: "X", line: [0, 4, 8] });
    expect(status(board("..O|.O.|OX."))).toMatchObject({ winner: "O", line: [2, 4, 6] });
  });

  it("detects a full board with no line as a draw", () => {
    expect(status(board("XXO|OOX|XXO"))).toEqual({ kind: "draw" });
  });

  /**
   * The UI must never be the thing that decides a move is legal - a fast
   * double-tap or a click on a stale render would otherwise place two marks
   * or overwrite a cell.
   */
  it("refuses a move onto an occupied cell, leaving the board untouched", () => {
    const start = board("X..|...|...");
    expect(isLegalMove(start, 0)).toBe(false);
    expect(applyMove(start, 0)).toBe(start);
  });

  it("refuses any move once the game is over", () => {
    const won = board("XXX|OO.|...");
    expect(isLegalMove(won, 5)).toBe(false);
    expect(applyMove(won, 5)).toBe(won);
  });

  it("refuses an out-of-range index rather than throwing", () => {
    expect(isLegalMove(EMPTY_BOARD, -1)).toBe(false);
    expect(isLegalMove(EMPTY_BOARD, 9)).toBe(false);
    expect(applyMove(EMPTY_BOARD, 42)).toBe(EMPTY_BOARD);
  });

  it("never mutates the board it is given", () => {
    const start = EMPTY_BOARD;
    const next = applyMove(start, 4);
    expect(start[4]).toBeNull();
    expect(next[4]).toBe("X");
  });

  it("alternates turns from the position itself, so the indicator can't drift", () => {
    let current: Board = EMPTY_BOARD;
    const seen: string[] = [];
    for (const move of [0, 4, 1, 5]) {
      seen.push(turnOf(current));
      current = applyMove(current, move);
    }
    expect(seen).toEqual(["X", "O", "X", "O"]);
  });

  it("labels cells for screen readers by position and contents", () => {
    const b = board("X..|.O.|...");
    expect(cellLabel(b, 0)).toBe("Top left, occupied by X");
    expect(cellLabel(b, 4)).toBe("Centre, occupied by O");
    expect(cellLabel(b, 8)).toBe("Bottom right, empty");
  });
});

describe("tic-tac-toe AI", () => {
  it("never returns a move once the game is over", () => {
    expect(chooseMove(board("XXX|OO.|..."), "hard")).toBeNull();
    expect(chooseMove(board("XXO|OOX|XXO"), "hard")).toBeNull();
  });

  it("only ever returns a legal move", () => {
    for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
      const b = board("XX.|OO.|X.O");
      const move = chooseMove(b, difficulty)!;
      expect(legalMoves(b)).toContain(move);
    }
  });

  it("medium takes an immediate win", () => {
    // O to play; O wins at index 5.
    expect(chooseMove(board("XX.|OO.|X.."), "medium")).toBe(5);
  });

  it("medium blocks an immediate loss when it cannot win", () => {
    // O to play. X threatens 0-1-2; O has no win of its own.
    expect(chooseMove(board("XX.|O..|O.."), "medium")).toBe(2);
  });

  it("hard takes an immediate win rather than prolonging the game", () => {
    expect(chooseMove(board("XX.|OO.|X.."), "hard")).toBe(5);
  });

  it("hard blocks an immediate loss", () => {
    expect(chooseMove(board("XX.|O..|O.."), "hard")).toBe(2);
  });

  /**
   * The headline claim for Hard: tic-tac-toe is a solved draw, so a
   * correctly implemented opponent can never be beaten. Playing it against
   * itself, and against every other strategy as the second player, must
   * never produce a loss for Hard.
   */
  it("hard is unbeatable - it never loses, against itself or against weaker play", () => {
    expect(playOut("hard", "hard")).toBe("draw");
    for (let seed = 1; seed <= 25; seed += 1) {
      expect(playOut("easy", "hard", seed), `hard lost as O with seed ${seed}`).not.toBe("X");
      expect(playOut("hard", "easy", seed), `hard lost as X with seed ${seed}`).not.toBe("O");
      expect(playOut("medium", "hard", seed), `hard lost as O with seed ${seed}`).not.toBe("X");
    }
  });

  /**
   * Depth is folded into the minimax score so that among equally-losing
   * options the AI picks the one that loses latest. Without it a solved-lost
   * position makes every move score the same and the AI throws the game
   * immediately, which looks broken even though the outcome is unchanged.
   */
  it("hard delays a forced loss rather than conceding at once", () => {
    // O to play, X already threatens 0-1-2. The only non-immediate loss is
    // to block at 2.
    expect(chooseMove(board("XX.|O..|..."), "hard")).toBe(2);
  });

  it("easy stays random rather than quietly playing well", () => {
    const outcomes = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      let rng = seed + 1;
      const random = () => {
        rng = (rng * 1103515245 + 12345) % 2147483648;
        return rng / 2147483648;
      };
      outcomes.add(chooseMove(EMPTY_BOARD, "easy", random)!);
    }
    expect(outcomes.size).toBeGreaterThan(3);
  });
});
