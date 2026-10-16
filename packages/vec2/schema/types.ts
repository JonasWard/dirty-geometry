/** Shape of vec2.schema.json: every recordable vec2 class member and operation function, as plain JSON. */

/** JSON description of a TypeScript type, as far as recording needs it. */
export type TypeRef =
  | { kind: 'number' | 'boolean' | 'string' | 'null' | 'void' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'class'; type: string }
  | { kind: 'array'; of: TypeRef }
  | { kind: 'tuple'; items: TypeRef[] }
  | { kind: 'union'; of: TypeRef[] }
  | { kind: 'object'; fields: Record<string, { type: TypeRef; optional?: true }> }
  | { kind: 'unsupported'; text: string };

export type ParamSchema = { name: string; type: TypeRef; optional?: true; rest?: true };

/**
 * - `constructor`: `new Owner(...)`, id `Owner.new`
 * - `static`: `Owner.member(...)`, id `Owner.member`
 * - `constant`: static value `Owner.member`, id `Owner.member`
 * - `method`: `self.member(...)`, id `Owner#member`
 * - `field`: instance value `self.member`, id `Owner#member`
 * - `function`: exported operation function, id `<module>:<name>`
 */
export type OperationKind = 'constructor' | 'static' | 'constant' | 'method' | 'field' | 'function';

export type OperationSchema = {
  kind: OperationKind;
  /** Class name for class members, `null` for functions. */
  owner: string | null;
  /** Module path relative to `packages/vec2/src`, without extension. */
  module: string;
  /** Member or function name (`new` for constructors). */
  member: string;
  params: ParamSchema[];
  returns: TypeRef;
  recordable: boolean;
  /** Why the operation cannot be recorded. */
  reason?: string;
};

export type Vec2Schema = {
  format: 'vec2-schema';
  version: 1;
  /** Content hash; definitions store it to detect schema changes. */
  hash: string;
  classes: Record<string, { module: string; typeTag: string | null }>;
  operations: Record<string, OperationSchema>;
};
