/** A recorded definition (version 2): named params, the calls in recording order, named outputs. */
export type Literal = string | number | boolean | null;
/** Where a value comes from: a node id, or a param. */
export type Source = string | { param: string };
/** `value`: a vec2 value made outside the recorder, as its `toJson()`. */
type Special = { value: unknown } | { number: 'Infinity' | '-Infinity' | 'NaN' } | { omit: true };
export type Arg = Literal | Arg[] | { ref: string } | { param: string } | { object: Record<string, Arg> } | Special;
/** A call (`Vec2.new`, `Vec2.add` with `self`, a helper by name), or an element / field of a result. */
export type CallNode = { id: string; op: string; self?: Source; args?: Arg[] };
export type Node =
  | CallNode
  | ({ id: string; of: string } & ({ op: 'item'; index: number } | { op: 'field'; name: string }));
export type Param = { type: string; value: Arg };
export type Definition = {
  format: 'vec2-definition';
  version: 2;
  params: Record<string, Param>;
  nodes: Node[];
  outputs: Record<string, Source>;
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
