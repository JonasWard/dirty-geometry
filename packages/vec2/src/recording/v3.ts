/**
 * Version 3 definitions: named params, the calls in recording order, named outputs. The recorder still writes them
 * and replay runs them; `fromV3` (migrate.ts) turns them into version 4 cells.
 */
import type { Literal } from './definition';

/** Where a value comes from: a node id, or a param. */
export type SourceV3 = string | { param: string };
/** `value`: a vec2 value made outside the recorder, as its `toJson()`. */
type Special = { value: unknown } | { number: 'Infinity' | '-Infinity' | 'NaN' } | { omit: true };
export type ArgV3 =
  | Literal
  | ArgV3[]
  | { ref: string }
  | { param: string }
  | { object: Record<string, ArgV3> }
  | Special;
/** A call (`Vec2.new`, `Vec2.add` with `self`, `helpers.name`), or an element / field of a result (`result.item`, `result.field`). */
export type CallNodeV3 = { id: string; op: string; self?: SourceV3; args?: ArgV3[] };
export type NodeV3 =
  | CallNodeV3
  | ({ id: string; of: string } & ({ op: 'result.item'; index: number } | { op: 'result.field'; name: string }));
export type ParamV3 = { type: string; value: ArgV3 };
export type DefinitionV3 = {
  format: 'vec2-definition';
  version: 3;
  params: Record<string, ParamV3>;
  nodes: NodeV3[];
  outputs: Record<string, SourceV3>;
};
