/** The vec2 schema, and a flat index of its operations by id (`Vec2#add`, `Vec2.new`, `<module>:<fn>`). */
import type { CallableSchema, OperationKind, OperationSchema, Vec2Schema } from './types';
import schemaJson from './vec2.schema.json';

export const vec2Schema = schemaJson as unknown as Vec2Schema;

function flatten(
  kind: OperationKind,
  owner: string | null,
  module: string,
  member: string,
  entry: CallableSchema,
): OperationSchema {
  return {
    kind,
    owner,
    module,
    member,
    params: entry.params ?? [],
    returns: entry.returns ?? { kind: 'unsupported', text: entry.reason ?? 'not described' },
    recordable: entry.reason === undefined,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
  };
}

function index(schema: Vec2Schema): Map<string, OperationSchema> {
  const operations = new Map<string, OperationSchema>();
  for (const [owner, cls] of Object.entries(schema.classes)) {
    if (cls.new) operations.set(`${owner}.new`, flatten('constructor', owner, cls.module, 'new', cls.new));
    for (const [member, entry] of Object.entries(cls.members)) {
      const kind: OperationKind = entry.static
        ? entry.value
          ? 'constant'
          : 'static'
        : entry.value
          ? 'field'
          : 'method';
      operations.set(`${owner}${entry.static ? '.' : '#'}${member}`, flatten(kind, owner, cls.module, member, entry));
    }
  }
  for (const [module, functions] of Object.entries(schema.helpers)) {
    for (const [name, entry] of Object.entries(functions)) {
      operations.set(`${module}:${name}`, flatten('function', null, module, name, entry));
    }
  }
  return operations;
}

/** Every operation by id, classes first (each constructor, then its members), then helpers. */
export const operations: ReadonlyMap<string, OperationSchema> = index(vec2Schema);

export const operationOf = (id: string): OperationSchema | undefined => operations.get(id);
