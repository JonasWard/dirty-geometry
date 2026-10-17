/** Shared by recording and replay: the schema, and how to run one schema operation on real values. */
import { classes, helpers } from '../../schema/bindings';
import { operationOf } from '../../schema/operations';
import type { OperationSchema, TypeRef } from '../../schema/types';
import { policy } from '../../schema/policy';

export { operationOf, vec2Schema } from '../../schema/operations';

const classTable = classes as unknown as Record<string, any>;
const helperTable = helpers as unknown as Record<string, (...args: unknown[]) => unknown>;

/** Class constructor → class name, for finding the operations of an instance. */
const classNames = new Map<unknown, string>(Object.entries(classTable).map(([name, cls]) => [cls, name]));

export function classNameOf(value: object): string | null {
  for (let proto = Object.getPrototypeOf(value); proto; proto = Object.getPrototypeOf(proto)) {
    const name = classNames.get(proto.constructor);
    if (name) return name;
  }
  return null;
}

/** Resolve an operation id (following policy aliases for renamed operations). */
export function lookupOperation(
  id: string,
  aliases: Readonly<Record<string, string>> = policy.aliases,
): { id: string; op: OperationSchema } | null {
  const current = aliases[id] ?? id;
  const op = operationOf(current);
  return op ? { id: current, op } : null;
}

export class RecordingError extends Error {
  override name = 'RecordingError';
}

/** Run one operation on real (unrecorded) values. */
export function callOperation(id: string, op: OperationSchema, self: unknown, args: readonly unknown[]): unknown {
  switch (op.kind) {
    case 'constructor':
      return new classTable[op.owner!](...args);
    case 'static':
      return classTable[op.owner!][op.member](...args);
    case 'constant':
      return classTable[op.owner!][op.member];
    case 'method':
      return (self as any)[op.member](...args);
    case 'field':
      return (self as any)[op.member];
    case 'function': {
      const fn = helperTable[id];
      if (!fn) throw new RecordingError(`No implementation bound for ${id}`);
      return fn(...args);
    }
  }
}

/** Every helper id by its plain name (the schema generator keeps helper names unique). */
export const helpersByName: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(helperTable).map((id) => [id.slice(id.indexOf(':') + 1), id]),
);

export function describeValue(value: unknown): TypeRef {
  if (typeof value === 'number') return { kind: 'number' };
  if (typeof value === 'string') return { kind: 'string' };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (value === null) return { kind: 'null' };
  if (typeof value === 'object') {
    const name = classNameOf(value);
    if (name) return { kind: 'class', type: name };
  }
  return { kind: 'unsupported', text: typeof value };
}

/** Whether `value` fits `type` (used to check param overrides). */
export function matchesType(value: unknown, type: TypeRef): boolean {
  switch (type.kind) {
    case 'number':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'void':
      return value === undefined;
    case 'literal':
      return value === type.value;
    case 'class':
      return typeof value === 'object' && value !== null && classNameOf(value) === type.type;
    case 'array':
      return Array.isArray(value) && value.every((item) => matchesType(item, type.of));
    case 'tuple':
      return (
        Array.isArray(value) &&
        value.length === type.items.length &&
        type.items.every((t, i) => matchesType(value[i], t))
      );
    case 'union':
      return type.of.some((member) => matchesType(value, member));
    case 'object':
      return typeof value === 'object' && value !== null;
    case 'unsupported':
      return false;
  }
}
