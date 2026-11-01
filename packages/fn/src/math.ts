/**
 * Number operations by name, so expressions can store them as data. Every operation works on any number: what a
 * number means (a length, an index, …) is the host's business.
 */

export const UNARY = {
  neg: (a: number) => -a,
  abs: Math.abs,
  sign: Math.sign,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
} as const satisfies Record<string, (a: number) => number>;

export const BINARY = {
  '+': (a: number, b: number) => a + b,
  '-': (a: number, b: number) => a - b,
  '*': (a: number, b: number) => a * b,
  '/': (a: number, b: number) => a / b,
  pow: (a: number, b: number) => a ** b,
  min: (a: number, b: number) => Math.min(a, b),
  max: (a: number, b: number) => Math.max(a, b),
  /** Floored modulo: the result has the sign of `b`, so `-1 mod 3` is 2 (handy for wrapping indices). */
  mod: (a: number, b: number) => a - b * Math.floor(a / b),
} as const satisfies Record<string, (a: number, b: number) => number>;

export type UnaryOp = keyof typeof UNARY;
export type BinaryOp = keyof typeof BINARY;
export type MathOp = UnaryOp | BinaryOp;
export const UNARY_OPS = Object.keys(UNARY) as UnaryOp[];
export const BINARY_OPS = Object.keys(BINARY) as BinaryOp[];
export const isUnary = (op: string): op is UnaryOp => op in UNARY;

/** The tolerance `==` uses when none is given. */
export const DEFAULT_SLACK = 1e-6;

export type CompareOp = '<' | '>' | '==';
export const COMPARE_OPS: readonly CompareOp[] = ['<', '>', '=='];
/** `==` holds within `slack` (`|a - b| <= slack`); `<` and `>` are strict. */
export function compare(op: CompareOp, a: number, b: number, slack = DEFAULT_SLACK): boolean {
  if (op === '<') return a < b;
  if (op === '>') return a > b;
  return Math.abs(a - b) <= slack;
}

export type LogicOp = 'and' | 'or' | 'not';
export const LOGIC_OPS: readonly LogicOp[] = ['and', 'or', 'not'];
export function logic(op: LogicOp, a: boolean, b?: boolean): boolean {
  if (op === 'not') return !a;
  return op === 'and' ? a && !!b : a || !!b;
}
