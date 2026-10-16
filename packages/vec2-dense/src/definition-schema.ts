/**
 * The densing schema of a recorded vec2 definition (see `@dirty-geometry/vec2/recording`), generated from
 * the vec2 operation schema: one node variant per recordable operation, and per parameter an operand
 * union (earlier node, omitted, or a literal shaped by the parameter's type), like state-to-function's
 * operand template.
 */
import { schemaFromJson, type DenseField, type DenseSchema } from 'densing';
import type { OperationSchema, TypeRef } from '@dirty-geometry/vec2/schema/types';
import schemaJson from '@dirty-geometry/vec2/schema/vec2.schema.json';
import type { Vec2Schema } from '@dirty-geometry/vec2/schema/types';
import { createNumerics, type NumericOptions } from './numerics';
import { numericRole, type OperandRole } from './roles';
import { NAME_CHARS, TEXT_CHARS, MAX_TEXT_LENGTH, textField } from './text';
import {
  anyValueRef,
  arr,
  enumField,
  epsilonNumberField,
  intField,
  isValueType,
  num,
  obj,
  TemplateTable,
  uni,
  valueRef,
  type ValueType,
} from './values';

export const vec2Schema = schemaJson as unknown as Vec2Schema;

export const MAX_NODES = 1024;
export const MAX_PARAMS = 64;
export const MAX_OUTPUTS = 64;
export const MAX_ARRAY = 256;
export const MAX_ITEM_INDEX = 4095;

/** 32-bit stamp of the vec2 operation schema a payload was written against. */
export const schemaStamp = (hash: string = vec2Schema.hash) => parseInt(hash.replace(/^sha256:/, '').slice(0, 8), 16);

/** Structural node kinds besides schema operations. */
export const STRUCTURAL_OPS = ['param', 'item', 'field'] as const;

/** What literal forms a parameter type admits, merged over unions. */
export type LiteralShape = {
  number?: true;
  boolean?: true;
  string?: true;
  null?: true;
  /** String / number literal types (`'tau' | 'pi'`, `1 | 0.1`). */
  choices?: (string | number | boolean)[];
  /** vec2 value types the parameter accepts as stored values. */
  values?: ValueType[];
  array?: TypeRef;
  tuple?: TypeRef[];
  object?: Record<string, { type: TypeRef; optional?: true }>;
};

export function literalShape(type: TypeRef, shape: LiteralShape = {}): LiteralShape {
  switch (type.kind) {
    case 'number':
    case 'boolean':
    case 'string':
    case 'null':
      shape[type.kind] = true;
      break;
    case 'literal':
      shape.choices = [...(shape.choices ?? []), type.value];
      break;
    case 'class':
      if (isValueType(type.type)) shape.values = [...new Set([...(shape.values ?? []), type.type])];
      break;
    case 'array':
      shape.array = shape.array ? { kind: 'union', of: [shape.array, type.of] } : type.of;
      break;
    case 'tuple':
      shape.tuple = type.items;
      break;
    case 'object':
      shape.object = { ...(shape.object ?? {}), ...type.fields };
      break;
    case 'union':
      for (const member of type.of) literalShape(member, shape);
      break;
    case 'void':
    case 'unsupported':
      break;
  }
  return shape;
}

/** Template key of an operand: its type, numeric role and whether it can be omitted. */
const operandKey = (type: TypeRef, role: OperandRole, optional: boolean) =>
  `operand:${role}:${optional}:${JSON.stringify(type)}`;

/** Reference to the operand union of a parameter. */
export function operandRef(table: TemplateTable, name: string, type: TypeRef, role: OperandRole, optional: boolean) {
  return table.ref(name, operandKey(type, role, optional), () => {
    const shape = literalShape(type);
    const variants: Record<string, DenseField[]> = { node: [intField('node', 0, MAX_NODES - 1)] };
    if (optional) variants.omit = [];
    if (shape.number) {
      variants.number = [role === 'epsilon' ? epsilonNumberField('value') : num('value', role)];
      variants.nonFinite = [enumField('value', ['Infinity', '-Infinity', 'NaN'])];
    }
    if (shape.boolean) variants.boolean = [{ type: 'bool', name: 'value', defaultValue: false }];
    if (shape.string) variants.string = [textField('value', TEXT_CHARS, MAX_TEXT_LENGTH)];
    if (shape.null) variants.null = [];
    if (shape.choices?.length) variants.choice = [enumField('value', shape.choices.map(String))];
    if (shape.values?.length === 1) variants.value = [valueRef(table, shape.values[0]!, 'value')];
    else if (shape.values?.length) variants.value = [anyValueRef(table, 'value')];
    if (shape.array) variants.list = [arr('items', 0, MAX_ARRAY, operandRef(table, 'item', shape.array, role, false))];
    if (shape.tuple) {
      variants.tuple = [
        obj('items', ...shape.tuple.map((item, index) => operandRef(table, `i${index}`, item, role, false))),
      ];
    }
    if (shape.object) {
      variants.object = [
        obj(
          'fields',
          ...Object.entries(shape.object).map(([field, { type: fieldType, optional: fieldOptional }]) =>
            operandRef(table, field, fieldType, numericRole('', field), !!fieldOptional),
          ),
        ),
      ];
    }
    // densing unions need two variants; an operand that can only be a node also gets `omit` (never written
    // for a required parameter).
    if (Object.keys(variants).length < 2) variants.omit = [];
    return uni('operand', 'kind', variants);
  });
}

/** The recordable operations, in schema order. */
export const recordableOperations = (): [string, OperationSchema][] =>
  Object.entries(vec2Schema.operations).filter(([, op]) => op.recordable);

const needsSelf = (op: OperationSchema) => op.kind === 'method' || op.kind === 'field';

/** Field name of parameter `name` in a node variant (`op` and `self` are taken). */
export const paramField = (name: string) => (name === 'op' || name === 'self' ? `$${name}` : name);

/** Kind of a param value: a number role, a plain JSON value, or a stored vec2 value. */
export const PARAM_KINDS = [
  'coordinate',
  'angle',
  'parameter',
  'integer',
  'epsilon',
  'boolean',
  'string',
  'value',
] as const;
export type ParamKind = (typeof PARAM_KINDS)[number];

export type DenseDefinitionSchema = { schema: DenseSchema; options: NumericOptions; stamp: number };

const cache = new Map<string, DenseDefinitionSchema>();

/** The densing schema of a definition; cached per options (custom presets). */
export function createDefinitionSchema(options: NumericOptions = {}): DenseDefinitionSchema {
  const key = JSON.stringify(options);
  const cached = cache.get(key);
  if (cached) return cached;

  const table = new TemplateTable();
  const nodeVariants: Record<string, DenseField[]> = {
    param: [intField('index', 0, MAX_PARAMS - 1)],
    item: [intField('of', 0, MAX_NODES - 1), intField('index', 0, MAX_ITEM_INDEX)],
    field: [intField('of', 0, MAX_NODES - 1), textField('name', NAME_CHARS)],
  };
  for (const [id, op] of recordableOperations()) {
    const fields: DenseField[] = needsSelf(op) ? [intField('self', 0, MAX_NODES - 1)] : [];
    for (const param of op.params) {
      const role = numericRole(id, param.name);
      const operand = operandRef(table, paramField(param.name), param.type, role, !!param.optional);
      fields.push(
        param.rest
          ? arr(paramField(param.name), 0, MAX_ARRAY, operandRef(table, 'item', param.type, role, false))
          : operand,
      );
    }
    nodeVariants[id] = fields;
  }
  const node = table.ref('node', 'node', () => uni('node', 'op', nodeVariants));

  const paramValue = uni('value', 'kind', {
    coordinate: [num('value', 'coordinate')],
    angle: [num('value', 'angle')],
    parameter: [num('value', 'parameter')],
    integer: [num('value', 'integer')],
    epsilon: [epsilonNumberField('value')],
    boolean: [{ type: 'bool', name: 'value', defaultValue: false }],
    string: [textField('value', TEXT_CHARS, MAX_TEXT_LENGTH)],
    value: [anyValueRef(table, 'value')],
  });

  const schema = schemaFromJson({
    definitions: createNumerics(options),
    templates: table.templates,
    fields: [
      intField('stamp', 0, 2 ** 32 - 1),
      arr('params', 0, MAX_PARAMS, obj('param', textField('name'), intField('node', 0, MAX_NODES - 1), paramValue)),
      arr('nodes', 0, MAX_NODES, node),
      arr('outputs', 0, MAX_OUTPUTS, obj('output', textField('name'), intField('node', 0, MAX_NODES - 1))),
    ],
  });
  const result = { schema, options, stamp: schemaStamp() };
  cache.set(key, result);
  return result;
}
