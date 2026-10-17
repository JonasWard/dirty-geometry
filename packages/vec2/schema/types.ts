/**
 * Shape of vec2.schema.json, nested by namespace: every class with its constructor and members, and the
 * functions of each helpers module. `operations.ts` flattens it into one entry per operation id.
 */

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

/** A function, constructor or method. Recordable entries have `returns`; the others only a `reason`. */
export type CallableSchema = {
  /** Omitted when there are none. */
  params?: ParamSchema[];
  returns?: TypeRef;
  /** Why it cannot be recorded; absent when it can. */
  reason?: string;
};

/** A class member: called, unless `value` marks a field, getter or static constant that is read. */
export type MemberSchema = CallableSchema & { static?: true; value?: true };

export type ClassSchema = {
  /** Module path relative to `packages/vec2/src`, without extension. */
  module: string;
  /** The static `type` tag, when the class has one. */
  typeTag?: string;
  /** `new Class(...)`; absent when the constructor is private (static-only classes). */
  new?: CallableSchema;
  members: Record<string, MemberSchema>;
};

export type Vec2Schema = {
  format: 'vec2-schema';
  version: 2;
  /** Content hash; definitions store it to detect schema changes. */
  hash: string;
  classes: Record<string, ClassSchema>;
  /** Helper functions by module path (relative to `packages/vec2/src`), then by name. */
  helpers: Record<string, Record<string, CallableSchema>>;
};

/**
 * How an operation is run, and the form of its id:
 * - `constructor`: `new Owner(...)`, id `Owner.new`
 * - `static`: `Owner.member(...)`, id `Owner.member`
 * - `constant`: static value `Owner.member`, id `Owner.member`
 * - `method`: `self.member(...)`, id `Owner#member`
 * - `field`: instance value `self.member`, id `Owner#member`
 * - `function`: helper function, id `<module>:<name>`
 */
export type OperationKind = 'constructor' | 'static' | 'constant' | 'method' | 'field' | 'function';

/** One schema entry, flattened with what its position in the nesting implies (see `operations.ts`). */
export type OperationSchema = {
  kind: OperationKind;
  /** Class name for class members, `null` for helpers. */
  owner: string | null;
  module: string;
  /** Member or function name (`new` for constructors). */
  member: string;
  params: ParamSchema[];
  returns: TypeRef;
  recordable: boolean;
  reason?: string;
};
