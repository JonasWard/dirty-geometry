/** The JSON form of a recorded definition: a DAG of vec2 operations, its named inputs and outputs. */
import type { TypeRef } from '../../schema/types';

export type JsonPrimitive = string | number | boolean | null;

/** One argument of a recorded call. */
export type ArgJson =
  /** A JSON-safe literal (string, finite number, boolean, null). */
  | { lit: JsonPrimitive }
  /** A number JSON cannot hold. */
  | { number: 'Infinity' | '-Infinity' | 'NaN' }
  /** An omitted optional argument. */
  | { undefined: true }
  /** The result of another node. */
  | { ref: string }
  /** A vec2 value created outside the recorder, stored through the codec registry (`toJson()`). */
  | { value: unknown }
  | { array: ArgJson[] }
  /** A plain options object. */
  | { object: Record<string, ArgJson> };

/**
 * A node of the definition:
 * - a schema operation (`Line2.new`, `Line2#evaluate`, `operations/…:fn`) with `self` for instance members;
 * - `param`: a named, editable input;
 * - `item` / `field`: an element of an array result or a field of a plain result object.
 */
export type NodeJson =
  | { id: string; op: string; self?: string; args: ArgJson[] }
  | { id: string; op: 'param'; name: string }
  | { id: string; op: 'item'; of: string; index: number }
  | { id: string; op: 'field'; of: string; name: string };

export type ParamJson = { node: string; type: TypeRef; value: ArgJson };

export type Definition = {
  format: 'vec2-definition';
  version: 1;
  /** Hash of the vec2 schema the definition was recorded against. */
  schema: string;
  params: Record<string, ParamJson>;
  nodes: NodeJson[];
  outputs: Record<string, string>;
};

export const isOperationNode = (node: NodeJson): node is Extract<NodeJson, { args: ArgJson[] }> => 'args' in node;
