import { describe, expect, it } from "vitest";
import {
  applyClassic,
  applyMove,
  bestClassicMove,
  bestMove,
  createClassic,
  createUltimate,
  evaluate,
  isLegal,
  legalMoves,
  lineWinner,
  overallWinner,
  type Player,
  type UltimateState,
} from "../../src/features/play/games/ultimate/ultimateEngine";

/**
 * Ultimate Tic-Tac-Toe.
 *
 * The rule that makes this game worth playing - the cell you take decides
 * which board your opponent must play in - is also the one most likely to be
 * broken by a later edit, and a subtle break there would not look like a bug.
 * It would just quietly turn the game back into nine unrelated boards. Most of
 * what follows guards that rule and its two awkward edges: being sent to a
 * board that is already finished, and a drawn board belonging to nobody.
 */

/** Plays a list of [board, cell] moves in order, asserting each is legal. */
function play(moves: Array<[number, number]>, first: Player = "X"): UltimateState {
  let state = createUltimate(first);
  for (const [b, c] of moves) {
    const next = applyMove(state, b, c);
    expect(next, `move ${b},${c} was rejected`).not.toBe(state);
    state = next;
  }
  return state;
}

describe("small board results", () => {
  it("finds a winner on every line", () => {
    expect(lineWinner(["X", "X", "X", null, null, null, null, null, null])).toBe("X");
    expect(lineWinner([null, null, null, null, null, null, "O", "O", "O"])).toBe("O");
    expect(lineWinner(["X", null, null, null, "X", null, null, null, "X"])).toBe("X");
    expect(lineWinner([null, null, "O", null, "O", null, "O", null, null])).toBe("O");
  });

  it("reports a full board with no line as a draw, and an open one as unfinished", () => {
    expect(lineWinner(["X", "O", "X", "X", "O", "O", "O", "X", "X"])).toBe("draw");
    expect(lineWinner(["X", null, null, null, null, null, null, null, null])).toBeNull();
  });
});

describe("the big board", () => {
  it("is won by three small boards in a line", () => {
    expect(overallWinner(["X", "X", "X", null, null, null, null, null, null])).toBe("X");
  });

  it("never lets a DRAWN small board complete a line", () => {
    // The subtle one. A drawn board belongs to nobody, so treating "draw" as a
    // value would hand someone the game on squares neither player won.
    expect(overallWinner(["X", "draw", "X", null, null, null, null, null, null])).toBeNull();
    expect(overallWinner(["draw", "draw", "draw", null, null, null, null, null, null])).toBeNull();
  });

  it("is a draw only once every small board is finished", () => {
    expect(overallWinner(Array(9).fill("draw"))).toBe("draw");
    expect(overallWinner(["X", "O", "draw", "O", "X", "draw", "draw", "draw", null])).toBeNull();
  });
});

describe("the rule that makes the game", () => {
  it("sends the opponent to the board matching the cell just played", () => {
    // Play cell 4 of board 0, and the opponent must answer in board 4.
    const state = play([[0, 4]]);
    expect(state.activeBoard).toBe(4);
    expect(legalMoves(state).every(([b]) => b === 4)).toBe(true);
  });

  it("refuses a move outside the board you were sent to", () => {
    const state = play([[0, 4]]);
    expect(isLegal(state, 4, 0)).toBe(true);
    expect(isLegal(state, 0, 0)).toBe(false);
    // An illegal move returns the same object rather than throwing.
    expect(applyMove(state, 0, 0)).toBe(state);
  });

  it("lets the first player start anywhere", () => {
    const fresh = createUltimate();
    expect(fresh.activeBoard).toBeNull();
    expect(legalMoves(fresh)).toHaveLength(81);
  });

  it("frees the player when sent to a board that is already finished", () => {
    // Built directly rather than played out: reaching this position naturally
    // takes a dozen moves whose only purpose is setup, and a wrong move
    // sequence would fail the test for a reason that has nothing to do with
    // the rule under test.
    //
    // Without this rule the game deadlocks - a player is ordered into a board
    // with no empty cells and has no legal move at all.
    const boardZeroWon: UltimateState = {
      ...createUltimate("O"),
      status: ["X", null, null, null, null, null, null, null, null],
      boards: Array.from({ length: 9 }, (_, i) =>
        i === 0 ? (["X", "X", "X", "O", "O", null, null, null, null] as Array<Player | null>) : Array(9).fill(null)
      ),
      activeBoard: 0,
    };

    const moves = legalMoves(boardZeroWon);
    expect(moves.length).toBeGreaterThan(9); // freed, not confined to one board
    expect(moves.every(([b]) => b !== 0)).toBe(true); // and never back into the finished one
  });

  it("frees the player when sent to a board that ended in a draw", () => {
    // A drawn board is finished too, and is the case most likely to be missed
    // because nobody "won" it.
    const drawn: UltimateState = {
      ...createUltimate("O"),
      status: [null, null, null, null, "draw", null, null, null, null],
      activeBoard: 4,
    };
    expect(legalMoves(drawn).every(([b]) => b !== 4)).toBe(true);
    expect(legalMoves(drawn).length).toBeGreaterThan(9);
  });

  it("records a won small board and stops accepting moves in it", () => {
    let state = play([
      [4, 0], [0, 4],
      [4, 1], [1, 4],
    ]);
    state = applyMove(state, 4, 2); // X takes the top row of board 4
    expect(state.status[4]).toBe("X");
    expect(legalMoves(state).some(([b]) => b === 4)).toBe(false);
  });

  it("keeps a full move history", () => {
    const state = play([[0, 4], [4, 0], [0, 1]]);
    expect(state.moves).toEqual([[0, 4], [4, 0], [0, 1]]);
  });

  it("never mutates the state handed to it", () => {
    const before = createUltimate();
    const snapshot = JSON.stringify(before);
    applyMove(before, 3, 3);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("the computer", () => {
  const always0 = () => 0;

  it("takes a winning small board when the big board is at stake", () => {
    // X owns boards 0 and 1. Completing board 2 wins the game outright, so the
    // AI must play it whatever its search would otherwise prefer.
    const state: UltimateState = {
      ...createUltimate("X"),
      status: ["X", "X", null, null, null, null, null, null, null],
      boards: Array.from({ length: 9 }, (_, i) =>
        i === 2 ? (["X", "X", null, null, null, null, null, null, null] as (Player | null)[]) : Array(9).fill(null)
      ),
      activeBoard: 2,
      turn: "X",
    };
    expect(bestMove(state, "hard", always0)).toEqual([2, 2]);
  });

  it("blocks the opponent from taking the board that would win it for them", () => {
    // O owns boards 0 and 1 and threatens board 2. X is in board 2 and must
    // deny it rather than build anywhere else.
    const state: UltimateState = {
      ...createUltimate("X"),
      status: ["O", "O", null, null, null, null, null, null, null],
      boards: Array.from({ length: 9 }, (_, i) =>
        i === 2 ? (["O", "O", null, null, null, null, null, null, null] as (Player | null)[]) : Array(9).fill(null)
      ),
      activeBoard: 2,
      turn: "X",
    };
    expect(bestMove(state, "hard", always0)).toEqual([2, 2]);
  });

  it("only ever returns a legal move, on every difficulty", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      let state = createUltimate();
      for (let i = 0; i < 12 && !state.winner; i++) {
        const move = bestMove(state, level, always0);
        expect(move, `${level} returned no move with ${legalMoves(state).length} available`).not.toBeNull();
        expect(isLegal(state, move![0], move![1])).toBe(true);
        state = applyMove(state, move![0], move![1]);
      }
    }
  });

  it("returns nothing once the game is over", () => {
    const finished: UltimateState = { ...createUltimate(), winner: "X" };
    expect(bestMove(finished, "hard")).toBeNull();
    expect(legalMoves(finished)).toEqual([]);
  });

  it("scores a won position decisively for the winner", () => {
    expect(evaluate({ ...createUltimate(), winner: "X" })).toBeGreaterThan(1000);
    expect(evaluate({ ...createUltimate(), winner: "O" })).toBeLessThan(-1000);
    expect(evaluate(createUltimate())).toBe(0);
  });
});

describe("classic 3x3, kept as a mode", () => {
  it("is unbeatable on hard, which is the honest reason it needed replacing", () => {
    // Perfect play against perfect play always draws. Ten games, no wins.
    for (let seed = 0; seed < 10; seed++) {
      let state = createClassic("X");
      let turn = 0;
      while (!state.winner) {
        const pick = (n: number) => (turn + seed) % n;
        const move = bestClassicMove(state, "hard", pick);
        if (move === null) break;
        state = applyClassic(state, move);
        turn += 1;
      }
      expect(state.winner).toBe("draw");
    }
  });

  it("still takes a win that is there", () => {
    const state = { cells: ["X", "X", null, "O", "O", null, null, null, null], turn: "X", winner: null } as const;
    expect(bestClassicMove({ ...state, cells: [...state.cells] }, "hard", () => 0)).toBe(2);
  });

  it("refuses to play an occupied cell", () => {
    const state = applyClassic(createClassic(), 0);
    expect(applyClassic(state, 0)).toBe(state);
  });
});
