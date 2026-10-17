/**
 * Recorded definitions (`@dirty-geometry/vec2/recording`) ⇄ densing data of the definition schema.
 * Node ids become positions; numbers are snapped onto the active presets.
 */
import { densing, undensing } from 'densing';
import type { ArgJson, Definition, NodeJson, ParamJson } from '@dirty-geometry/vec2/recording/definition';
import type { OperationSchema, TypeRef } from '@dirty-geometry/vec2/schema/types';
import type { ActivePresets } from './numerics';
import { numericRole, type OperandRole } from './roles';
import { fromChars, NAME_CHARS, TEXT_CHARS, MAX_TEXT_LENGTH, toChars } from './text';
import { decodeValueData, encodeValueJson, isValueType, NumericContext, type ValueType } from './values';
import {
  createDefinitionSchema,
  literalShape,
  paramField,
  schemaStamp,
  operationOf,
  vec2Schema,
  type DenseDefinitionSchema,
  type ParamKind,
} from './definition-schema';

type Data = Record<string, any>;

export class DenseDefinitionError extends Error {
  override name = 'DenseDefinitionError';
}

const isOperation = (node: NodeJson): node is Extract<NodeJson, { args: ArgJson[] }> => 'args' in node;

function operation(id: string): OperationSchema {
  const op = operationOf(id);
  if (!op || !op.recordable) throw new DenseDefinitionError(`${id} is not a recordable vec2 operation`);
  return op;
}

/** The number role a param plays: the role of the first parameter it is passed to (coordinate if unused). */
export function paramRole(definition: Definition, paramNode: string): OperandRole {
  for (const node of definition.nodes) {
    if (!isOperation(node)) continue;
    const op = operationOf(node.op);
    if (!op) continue;
    const role = node.args.findIndex((arg) => refersTo(arg, paramNode));
    if (role >= 0) {
      const param = op.params[Math.min(role, op.params.length - 1)];
      if (param) return numericRole(node.op, param.name);
    }
  }
  return 'coordinate';
}

const refersTo = (arg: ArgJson, id: string): boolean =>
  ('ref' in arg && arg.ref === id) ||
  ('array' in arg && arg.array.some((item) => refersTo(item, id))) ||
  ('object' in arg && Object.values(arg.object).some((item) => refersTo(item, id)));

// ---- operands ----

function encodeOperand(
  arg: ArgJson | undefined,
  type: TypeRef,
  role: OperandRole,
  optional: boolean,
  ctx: NumericContext,
  index: ReadonlyMap<string, number>,
  label: string,
): Data {
  if (arg === undefined || 'undefined' in arg) {
    if (!optional) throw new DenseDefinitionError(`${label}: required argument is missing`);
    return { kind: 'omit' };
  }
  if ('ref' in arg) {
    const node = index.get(arg.ref);
    if (node === undefined) throw new DenseDefinitionError(`${label}: unknown node ${arg.ref}`);
    return { kind: 'node', node };
  }
  const shape = literalShape(type);
  if ('number' in arg) {
    if (!shape.number) throw new DenseDefinitionError(`${label}: ${arg.number} is not allowed here`);
    return { kind: 'nonFinite', value: arg.number };
  }
  if ('lit' in arg) {
    const value = arg.lit;
    if (shape.choices?.some((choice) => choice === value)) return { kind: 'choice', value: String(value) };
    if (typeof value === 'number' && shape.number)
      return { kind: 'number', value: ctx.encodeNumber(role, value, label) };
    if (typeof value === 'boolean' && shape.boolean) return { kind: 'boolean', value };
    if (typeof value === 'string' && shape.string)
      return { kind: 'string', value: toChars(value, TEXT_CHARS, label, MAX_TEXT_LENGTH) };
    if (value === null && shape.null) return { kind: 'null' };
    throw new DenseDefinitionError(`${label}: literal ${JSON.stringify(value)} does not fit ${JSON.stringify(type)}`);
  }
  if ('value' in arg) {
    const json = arg.value as Data;
    if (!shape.values?.length || !isValueType(json.type)) {
      throw new DenseDefinitionError(`${label}: a stored ${String(json.type)} value does not fit here`);
    }
    const encoded = encodeValueJson(json, ctx, label);
    return { kind: 'value', value: shape.values.length === 1 ? encoded : { type: json.type, value: encoded } };
  }
  if ('array' in arg) {
    if (shape.array) {
      return {
        kind: 'list',
        items: arg.array.map((item, i) => encodeOperand(item, shape.array!, role, false, ctx, index, `${label}[${i}]`)),
      };
    }
    if (shape.tuple && arg.array.length === shape.tuple.length) {
      return {
        kind: 'tuple',
        items: Object.fromEntries(
          shape.tuple.map((item, i) => [
            `i${i}`,
            encodeOperand(arg.array[i], item, role, false, ctx, index, `${label}[${i}]`),
          ]),
        ),
      };
    }
    throw new DenseDefinitionError(`${label}: a list does not fit ${JSON.stringify(type)}`);
  }
  if (!shape.object) throw new DenseDefinitionError(`${label}: an options object does not fit ${JSON.stringify(type)}`);
  const fields = Object.entries(shape.object).map(([field, spec]) => [
    field,
    encodeOperand(
      arg.object[field],
      spec.type,
      numericRole('', field),
      !!spec.optional,
      ctx,
      index,
      `${label}.${field}`,
    ),
  ]);
  for (const field of Object.keys(arg.object)) {
    if (!(field in shape.object)) throw new DenseDefinitionError(`${label}: unknown option ${field}`);
  }
  return { kind: 'object', fields: Object.fromEntries(fields) };
}

function decodeOperand(
  data: Data,
  type: TypeRef,
  role: OperandRole,
  ctx: NumericContext,
  ids: readonly string[],
): ArgJson {
  const shape = literalShape(type);
  switch (data.kind) {
    case 'omit':
      return { undefined: true };
    case 'node':
      return { ref: ids[data.node] ?? `n${data.node}` };
    case 'number':
      return { lit: ctx.decodeNumber(role, data.value) };
    case 'nonFinite':
      return { number: data.value };
    case 'boolean':
      return { lit: data.value };
    case 'string':
      return { lit: fromChars(data.value) };
    case 'null':
      return { lit: null };
    case 'choice':
      return { lit: shape.choices!.find((choice) => String(choice) === data.value)! };
    case 'value': {
      const [valueType, value] =
        shape.values!.length === 1 ? [shape.values![0]!, data.value] : [data.value.type as ValueType, data.value.value];
      return { value: decodeValueData(valueType, value, ctx) };
    }
    case 'list':
      return { array: (data.items as Data[]).map((item) => decodeOperand(item, shape.array!, role, ctx, ids)) };
    case 'tuple':
      return { array: shape.tuple!.map((item, i) => decodeOperand(data.items[`i${i}`], item, role, ctx, ids)) };
    case 'object': {
      const fields: Record<string, ArgJson> = {};
      for (const [field, spec] of Object.entries(shape.object!)) {
        const decoded = decodeOperand(data.fields[field], spec.type, numericRole('', field), ctx, ids);
        if (!('undefined' in decoded)) fields[field] = decoded;
      }
      return { object: fields };
    }
    default:
      throw new DenseDefinitionError(`Unknown operand kind ${String(data.kind)}`);
  }
}

// ---- params ----

function encodeParam(
  name: string,
  param: ParamJson,
  role: OperandRole,
  ctx: NumericContext,
  index: ReadonlyMap<string, number>,
): Data {
  const label = `param ${name}`;
  const node = index.get(param.node);
  if (node === undefined) throw new DenseDefinitionError(`${label}: its node ${param.node} is missing`);
  const base = { name: toChars(name, NAME_CHARS, label), node };
  const value = param.value;
  if ('lit' in value && typeof value.lit === 'number') {
    return { ...base, value: { kind: role, value: ctx.encodeNumber(role, value.lit, label) } };
  }
  if ('lit' in value && typeof value.lit === 'boolean')
    return { ...base, value: { kind: 'boolean', value: value.lit } };
  if ('lit' in value && typeof value.lit === 'string') {
    return { ...base, value: { kind: 'string', value: toChars(value.lit, TEXT_CHARS, label, MAX_TEXT_LENGTH) } };
  }
  if ('value' in value) {
    const json = value.value as Data;
    return { ...base, value: { kind: 'value', value: { type: json.type, value: encodeValueJson(json, ctx, label) } } };
  }
  throw new DenseDefinitionError(`${label}: unsupported param value ${JSON.stringify(value)}`);
}

function decodeParam(data: Data, ctx: NumericContext, ids: readonly string[]): [string, ParamJson] {
  const name = fromChars(data.name);
  const node = ids[data.node] ?? `n${data.node}`;
  const kind = data.value.kind as ParamKind;
  if (kind === 'coordinate' || kind === 'angle' || kind === 'parameter' || kind === 'integer' || kind === 'epsilon') {
    return [name, { node, type: { kind: 'number' }, value: { lit: ctx.decodeNumber(kind, data.value.value) } }];
  }
  if (kind === 'boolean') return [name, { node, type: { kind: 'boolean' }, value: { lit: data.value.value } }];
  if (kind === 'string') return [name, { node, type: { kind: 'string' }, value: { lit: fromChars(data.value.value) } }];
  const { type, value } = data.value.value as { type: ValueType; value: Data };
  return [name, { node, type: { kind: 'class', type }, value: { value: decodeValueData(type, value, ctx) } }];
}

// ---- definitions ----

/** densing data of a definition, with every number snapped onto `presets`. */
export function definitionToDenseData(
  definition: Definition,
  presets: ActivePresets = {},
  schema = createDefinitionSchema(),
): Data {
  const ctx = new NumericContext(schema.schema.definitions ?? [], presets);
  const index = new Map(definition.nodes.map((node, i) => [node.id, i]));
  const paramIndex = new Map(Object.keys(definition.params).map((name, i) => [name, i]));
  const paramByNode = new Map(Object.entries(definition.params).map(([name, param]) => [param.node, name]));

  const nodes = definition.nodes.map((node, position): Data => {
    const label = `node ${node.id}`;
    if (node.op === 'param' && 'name' in node && !('of' in node)) {
      const name = paramByNode.get(node.id) ?? node.name;
      const param = paramIndex.get(name);
      if (param === undefined) throw new DenseDefinitionError(`${label}: param ${name} is missing`);
      return { op: 'param', index: param };
    }
    if (node.op === 'item' && 'index' in node) return { op: 'item', of: index.get(node.of)!, index: node.index };
    if (node.op === 'field' && 'of' in node && 'name' in node) {
      return { op: 'field', of: index.get(node.of)!, name: toChars(node.name, NAME_CHARS, label) };
    }
    if (!isOperation(node)) throw new DenseDefinitionError(`${label}: unknown node kind ${node.op}`);
    const op = operation(node.op);
    const data: Data = { op: node.op };
    if (op.kind === 'method' || op.kind === 'field') {
      const self = node.self === undefined ? undefined : index.get(node.self);
      if (self === undefined || self >= position)
        throw new DenseDefinitionError(`${label}: ${node.op} needs an earlier node as self`);
      data.self = self;
    }
    op.params.forEach((param, i) => {
      const role = numericRole(node.op, param.name);
      const field = paramField(param.name);
      data[field] = param.rest
        ? node.args
            .slice(i)
            .map((arg, j) => encodeOperand(arg, param.type, role, false, ctx, index, `${label}.${param.name}[${j}]`))
        : encodeOperand(node.args[i], param.type, role, !!param.optional, ctx, index, `${label}.${param.name}`);
    });
    if (!op.params.some((param) => param.rest) && node.args.length > op.params.length) {
      throw new DenseDefinitionError(
        `${label}: ${node.op} takes ${op.params.length} arguments, got ${node.args.length}`,
      );
    }
    return data;
  });

  return {
    $presets: { ...presets },
    stamp: schema.stamp,
    params: Object.entries(definition.params).map(([name, param]) =>
      encodeParam(name, param, paramRole(definition, param.node), ctx, index),
    ),
    nodes,
    outputs: Object.entries(definition.outputs).map(([name, node]) => {
      const position = index.get(node);
      if (position === undefined) throw new DenseDefinitionError(`output ${name}: unknown node ${node}`);
      return { name: toChars(name, NAME_CHARS, `output ${name}`), node: position };
    }),
  };
}

/** A definition from densing data (node ids `n0`, `n1`, … by position). */
export function denseDataToDefinition(data: Data, schema = createDefinitionSchema()): Definition {
  if (data.stamp !== schemaStamp()) {
    throw new DenseDefinitionError(
      `This payload was written against another version of the vec2 operations (stamp ${data.stamp}, current ${schemaStamp()})`,
    );
  }
  const ctx = new NumericContext(schema.schema.definitions ?? [], data.$presets ?? {});
  const ids = (data.nodes as Data[]).map((_, i) => `n${i}`);
  const params = Object.fromEntries((data.params as Data[]).map((param) => decodeParam(param, ctx, ids)));
  const paramNames = Object.keys(params);

  const nodes = (data.nodes as Data[]).map((node, i): NodeJson => {
    const id = ids[i]!;
    if (node.op === 'param') return { id, op: 'param', name: paramNames[node.index] ?? `param${node.index}` };
    if (node.op === 'item') return { id, op: 'item', of: ids[node.of]!, index: node.index };
    if (node.op === 'field') return { id, op: 'field', of: ids[node.of]!, name: fromChars(node.name) };
    const op = operation(node.op);
    const args: ArgJson[] = [];
    op.params.forEach((param) => {
      const role = numericRole(node.op, param.name);
      const field = node[paramField(param.name)];
      if (param.rest) args.push(...(field as Data[]).map((item) => decodeOperand(item, param.type, role, ctx, ids)));
      else args.push(decodeOperand(field, param.type, role, ctx, ids));
    });
    // Trailing omitted arguments were not passed when recording.
    while (args.length > 0 && 'undefined' in args[args.length - 1]!) args.pop();
    return { id, op: node.op, ...(node.self === undefined ? {} : { self: ids[node.self]! }), args };
  });

  return {
    format: 'vec2-definition',
    version: 1,
    schema: vec2Schema.hash,
    params,
    nodes,
    outputs: Object.fromEntries((data.outputs as Data[]).map((output) => [fromChars(output.name), ids[output.node]!])),
  };
}

/** Pack a definition into a densing string. */
export function encodeDefinition(
  definition: Definition,
  presets: ActivePresets = {},
  schema: DenseDefinitionSchema = createDefinitionSchema(),
): string {
  return densing(schema.schema, definitionToDenseData(definition, presets, schema));
}

/** Unpack a densing string; also returns the presets it was written with. */
export function decodeDefinition(
  text: string,
  schema: DenseDefinitionSchema = createDefinitionSchema(),
): { definition: Definition; presets: ActivePresets } {
  const data = undensing(schema.schema, text) as Data;
  return { definition: denseDataToDefinition(data, schema), presets: { ...(data.$presets ?? {}) } };
}

/** Renumber node ids by position (`n0`, `n1`, …), as decoding does, so definitions can be compared. */
export function normaliseDefinition(definition: Definition): Definition {
  const ids = new Map(definition.nodes.map((node, i) => [node.id, `n${i}`]));
  const mapArg = (arg: ArgJson): ArgJson =>
    'ref' in arg
      ? { ref: ids.get(arg.ref) ?? arg.ref }
      : 'array' in arg
        ? { array: arg.array.map(mapArg) }
        : 'object' in arg
          ? { object: Object.fromEntries(Object.entries(arg.object).map(([key, value]) => [key, mapArg(value)])) }
          : arg;
  const nodes = definition.nodes.map((node): NodeJson => {
    const id = ids.get(node.id)!;
    if (isOperation(node)) {
      const args = node.args.map(mapArg);
      while (args.length > 0 && 'undefined' in args[args.length - 1]!) args.pop();
      return { id, op: node.op, ...(node.self ? { self: ids.get(node.self)! } : {}), args };
    }
    if ('of' in node) return { ...node, id, of: ids.get(node.of)! } as NodeJson;
    return { ...node, id };
  });
  return {
    ...definition,
    params: Object.fromEntries(
      Object.entries(definition.params).map(([name, param]) => [name, { ...param, node: ids.get(param.node)! }]),
    ),
    nodes,
    outputs: Object.fromEntries(Object.entries(definition.outputs).map(([name, node]) => [name, ids.get(node)!])),
  };
}

/** Literal changes a round trip through `presets` makes, as `path: before → after`. */
export function quantisationReport(
  definition: Definition,
  presets: ActivePresets = {},
  schema = createDefinitionSchema(),
): string[] {
  const before = normaliseDefinition(definition);
  const after = decodeDefinition(encodeDefinition(definition, presets, schema), schema).definition;
  const changes: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === 'number' || typeof b === 'number') {
      if (a !== b && !(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12))
        changes.push(`${path}: ${String(a)} → ${String(b)}`);
      return;
    }
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      if (a !== b) changes.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      return;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk((a as Data)[key], (b as Data)[key], `${path}.${key}`);
    }
  };
  walk(before.params, after.params, 'params');
  walk(before.nodes, after.nodes, 'nodes');
  return changes;
}
