/**
 * A vec2 definition (version 4): typed inputs, user functions, and named cells that each hold one expression.
 *
 * Expressions nest: an operation's arguments are expressions, so `new Circle2(new Vec2(1, 2), r)` is one cell. A cell
 * may refer to the inputs and to earlier cells by name; a function body only to its own params (and earlier
 * functions). Cells flagged `output` are the definition's result; each declares its `type`.
 */
export type Literal = string | number | boolean | null;
export type MathOp = '+' | '-' | '*' | '/';
export type Expr =
  | Literal
  /** A list (also a rest argument's items). */
  | Expr[]
  | { number: 'Infinity' | '-Infinity' | 'NaN' }
  /** A vec2 value as its `toJson()`. */
  | { value: unknown }
  /** An options object (`{ mesh: true }`). */
  | { object: Record<string, Expr> }
  /** An input, an earlier cell, or (in a function body) a param. */
  | { ref: string }
  /** `Vec2.new`, `Vec2.add` (with `self`), a value member (`Line2.from`, with `self`), or `helpers.name`. Args by
   * parameter name; an omitted optional has no key; a rest parameter holds a list. */
  | { op: string; self?: Expr; args?: Record<string, Expr> }
  /** A user function, args by its param names. */
  | { call: string; args?: Record<string, Expr> }
  /** An element of a list result, or a field of an object result (`Boolean2Result.polygons`). */
  | { of: Expr; index: number }
  | { of: Expr; field: string }
  | { math: MathOp; args: [Expr, Expr] }
  | { math: 'neg'; args: [Expr] };

/** `type`: a number type (`Coordinate`, …), `boolean`, `string` or a class; `value` a literal or `{ value }`. */
export type Input = { name: string; type: string; value: Expr };
/** `type`: a declared type name (`Length`, `Vec2[]`); it decides how the cell's literals are packed. */
export type Cell = { name: string; expr: Expr; type?: string; output?: true };
export type Fn = { name: string; params: { name: string; type: string }[]; body: Expr };
export type Definition = {
  format: 'vec2-definition';
  version: 4;
  inputs: Input[];
  functions: Fn[];
  cells: Cell[];
};

export class RecordingError extends Error {
  override name = 'RecordingError';
}
export class DefinitionError extends RecordingError {
  override name = 'DefinitionError';
}
/** `throw` as an expression. */
export const fail = (message: string, E: new (message: string) => Error = RecordingError): never => {
  throw new E(message);
};
