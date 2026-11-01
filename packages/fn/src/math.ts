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
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (a: number) => 1 / Math.tan(a),
  /** `null` outside −1…1, so the cell using it fails instead of carrying NaN. */
  asin: (a: number) => (a < -1 || a > 1 ? null : Math.asin(a)),
  /** `null` outside −1…1, so the cell using it fails instead of carrying NaN. */
  acos: (a: number) => (a < -1 || a > 1 ? null : Math.acos(a)),
  atan: Math.atan,
  /** `π/2 − atan(a)`: range (0, π), continuous at 0. */
  acot: (a: number) => Math.PI / 2 - Math.atan(a),
  /** The logarithms are `null` for 0 and below, so the cell using them fails instead of carrying -Infinity or NaN. */
  ln: (a: number) => (a > 0 ? Math.log(a) : null),
  log2: (a: number) => (a > 0 ? Math.log2(a) : null),
  log10: (a: number) => (a > 0 ? Math.log10(a) : null),
} as const satisfies Record<string, (a: number) => number | null>;

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
  /** The angle of the point `(x, y)` (note: `y` first), in (−π, π]. */
  atan2: (y: number, x: number) => Math.atan2(y, x),
} as const satisfies Record<string, (a: number, b: number) => number>;

export type UnaryOp = keyof typeof UNARY;
export type BinaryOp = keyof typeof BINARY;
export type MathOp = UnaryOp | BinaryOp;
export const UNARY_OPS = Object.keys(UNARY) as UnaryOp[];
export const BINARY_OPS = Object.keys(BINARY) as BinaryOp[];
export const isUnary = (op: string): op is UnaryOp => op in UNARY;

/** Trigonometry takes an angle (`TRIG_OPS`) or gives one (`ARC_OPS`, `atan2`), so hosts may type its operands apart
 * from the other math. */
export const TRIG_OPS = ['sin', 'cos', 'tan', 'cot'] as const satisfies readonly UnaryOp[];
export const ARC_OPS = ['asin', 'acos', 'atan', 'acot'] as const satisfies readonly UnaryOp[];
export type TrigOp = (typeof TRIG_OPS)[number];
export type ArcOp = (typeof ARC_OPS)[number];
export const isTrigOp = (op: string): op is TrigOp => (TRIG_OPS as readonly string[]).includes(op);
export const isArcOp = (op: string): op is ArcOp => (ARC_OPS as readonly string[]).includes(op);
/** Logarithms, like the arc functions, take a plain number whatever their result stands for. */
export const LOG_OPS = ['ln', 'log2', 'log10'] as const satisfies readonly UnaryOp[];
export type LogOp = (typeof LOG_OPS)[number];
export const isLogOp = (op: string): op is LogOp => (LOG_OPS as readonly string[]).includes(op);
/** Ops whose result may be `null` (an operand out of range). */
export const NULLABLE_OPS: readonly UnaryOp[] = ['asin', 'acos', ...LOG_OPS];
/** The ops whose operands take the type of the slot the math stands in: all but trigonometry and logarithms. */
export const ARITHMETIC_UNARY_OPS = UNARY_OPS.filter((op) => !isTrigOp(op) && !isArcOp(op) && !isLogOp(op));
export const ARITHMETIC_BINARY_OPS = BINARY_OPS.filter((op) => op !== 'atan2');

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
