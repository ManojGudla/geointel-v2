import { createRng, type Rng } from "../../lib/random";

/**
 * Two generated puzzle games. No dataset, so the content never runs out and
 * no claim can ever be wrong — the answer is derived from the puzzle itself.
 *
 *   Crack the Code — deduce a symbol's value from a system of equations.
 *   Pattern Breaker — continue a number sequence against a clock.
 */

// ── Crack the Code ────────────────────────────────────────────────────────

export const SYMBOLS = ["▲", "●", "■", "★", "♦"] as const;

export interface CodePuzzle {
  id: string;
  /** Each line is a readable equation, e.g. "▲ + ▲ + ● = 12". */
  equations: string[];
  /** The symbol being asked about. */
  target: string;
  answer: number;
  options: number[];
  /** Shown on the reveal: the full solution. */
  solution: string;
}

/**
 * Builds a genuinely solvable system.
 *
 * The obvious way to write this game is the way it is usually presented
 * online — three lines that are permutations of the same three symbols:
 *
 *     ▲ ● ■ = 7
 *     ● ■ ▲ = 11
 *
 * That has no solution under addition. Addition is commutative, so both lines
 * are the same sum and cannot equal two different numbers. Puzzles like that
 * circulate widely and are simply broken, and shipping one would produce a
 * stream of people who are right telling you that you are wrong.
 *
 * So each equation here uses a DIFFERENT multiset of symbols, giving a real
 * system of simultaneous equations with exactly one solution.
 */
export function buildCodePuzzle(seed: number | string, index: number): CodePuzzle {
  const rng = createRng(`code:${seed}:${index}`);
  // Small positive integers keep the arithmetic mental rather than written.
  const a = 1 + Math.floor(rng.next() * 9);
  const b = 1 + Math.floor(rng.next() * 9);
  const c = 1 + Math.floor(rng.next() * 9);

  const [s1, s2, s3] = rng.shuffle([...SYMBOLS]).slice(0, 3) as [string, string, string];

  // Three independent equations: one isolates a pair, the others weight the
  // symbols differently so the system resolves to a single answer.
  const equations = [
    `${s1} + ${s1} + ${s2} = ${a + a + b}`,
    `${s2} + ${s3} = ${b + c}`,
    `${s1} + ${s3} = ${a + c}`,
  ];

  const targets: Array<[string, number]> = [
    [s1, a],
    [s2, b],
    [s3, c],
  ];
  const [target, answer] = rng.pick(targets);

  // Distractors near the answer, so the options cannot be eliminated by size
  // alone.
  const options = new Set<number>([answer]);
  let spread = 1;
  while (options.size < 4 && spread < 12) {
    for (const delta of [spread, -spread]) {
      const v = answer + delta;
      if (v >= 1 && v <= 18) options.add(v);
      if (options.size >= 4) break;
    }
    spread++;
  }

  return {
    id: `code-${seed}-${index}`,
    equations,
    target,
    answer,
    options: rng.shuffle([...options]),
    solution: `${s1} = ${a},  ${s2} = ${b},  ${s3} = ${c}`,
  };
}

export function buildCodeGame(seed: number | string, count = 8): CodePuzzle[] {
  return Array.from({ length: count }, (_, i) => buildCodePuzzle(seed, i));
}

// ── Pattern Breaker ───────────────────────────────────────────────────────

export interface PatternPuzzle {
  id: string;
  /** The visible terms, in order. */
  terms: number[];
  answer: number;
  options: number[];
  /** The rule, revealed after answering. */
  rule: string;
  level: number;
}

type Generator = (rng: Rng, level: number) => { terms: number[]; next: number; rule: string } | null;

/**
 * The rules, ordered so early rounds are recognisable and later ones are not.
 *
 * Every rule produces exactly one defensible continuation. Sequences with
 * more than one reasonable answer are the classic complaint magnet for this
 * genre — the player is right, the game says wrong, and they never come back.
 */
const GENERATORS: Generator[] = [
  // Add a constant.
  (rng) => {
    const start = 1 + Math.floor(rng.next() * 9);
    const step = 2 + Math.floor(rng.next() * 8);
    const terms = [0, 1, 2, 3].map((i) => start + i * step);
    return { terms, next: start + 4 * step, rule: `Add ${step} each time.` };
  },
  // Multiply by a constant.
  (rng) => {
    const start = 1 + Math.floor(rng.next() * 4);
    const factor = 2 + Math.floor(rng.next() * 2);
    const terms = [0, 1, 2, 3].map((i) => start * factor ** i);
    return { terms, next: start * factor ** 4, rule: `Multiply by ${factor} each time.` };
  },
  // The gap grows by a constant.
  (rng) => {
    const start = 1 + Math.floor(rng.next() * 5);
    const first = 2 + Math.floor(rng.next() * 4);
    const grow = 1 + Math.floor(rng.next() * 3);
    const terms = [start];
    let gap = first;
    for (let i = 0; i < 3; i++) {
      terms.push(terms[terms.length - 1]! + gap);
      gap += grow;
    }
    return {
      terms,
      next: terms[terms.length - 1]! + gap,
      rule: `The gap starts at ${first} and grows by ${grow} each step.`,
    };
  },
  // n × (n + k): the 2, 6, 12, 20 family.
  (rng) => {
    const k = 1 + Math.floor(rng.next() * 3);
    const terms = [1, 2, 3, 4].map((n) => n * (n + k));
    return { terms, next: 5 * (5 + k), rule: `Each term is n × (n + ${k}), counting n from 1.` };
  },
  // Each term is the sum of the two before it.
  (rng) => {
    const a = 1 + Math.floor(rng.next() * 5);
    const b = a + 1 + Math.floor(rng.next() * 5);
    const terms = [a, b, a + b, a + 2 * b];
    return { terms, next: terms[2]! + terms[3]!, rule: "Each term is the sum of the two before it." };
  },
  // Double and add a constant.
  (rng) => {
    const start = 1 + Math.floor(rng.next() * 4);
    const add = 1 + Math.floor(rng.next() * 5);
    const terms = [start];
    for (let i = 0; i < 3; i++) terms.push(terms[terms.length - 1]! * 2 + add);
    return {
      terms,
      next: terms[terms.length - 1]! * 2 + add,
      rule: `Double the previous term and add ${add}.`,
    };
  },
];

export function buildPatternPuzzle(seed: number | string, index: number): PatternPuzzle {
  const rng = createRng(`pattern:${seed}:${index}`);
  const level = Math.min(GENERATORS.length - 1, Math.floor(index / 2));
  // Early rounds draw from the simple end of the list; later rounds can use
  // anything up to the current level, so the ramp is felt without becoming
  // repetitive.
  const generator = GENERATORS[Math.floor(rng.next() * (level + 1))] ?? GENERATORS[0]!;
  const built = generator(rng, level) ?? GENERATORS[0]!(rng, 0)!;

  const options = new Set<number>([built.next]);
  const gap = Math.max(1, Math.abs(built.next - (built.terms.at(-1) ?? 0)));
  for (const delta of [gap, -gap, Math.round(gap / 2), -Math.round(gap / 2), 1, -1]) {
    if (options.size >= 4) break;
    const v = built.next + delta;
    if (v > 0 && v !== built.next) options.add(v);
  }

  return {
    id: `pattern-${seed}-${index}`,
    terms: built.terms,
    answer: built.next,
    options: rng.shuffle([...options]).slice(0, 4),
    rule: built.rule,
    level: level + 1,
  };
}

export function buildPatternGame(seed: number | string, count = 10): PatternPuzzle[] {
  return Array.from({ length: count }, (_, i) => buildPatternPuzzle(seed, i));
}

/** Shared by both puzzle games: later rounds are worth more. */
export function puzzlePoints(roundIndex: number, secondsTaken: number): number {
  const base = 150 + roundIndex * 50;
  const speed = Math.max(0, Math.round((15 - Math.min(15, secondsTaken)) * 8));
  return base + speed;
}
