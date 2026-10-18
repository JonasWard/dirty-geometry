/** Definitions and vec2 values as densing strings: densing encodes and decodes; this maps the history's shape. */
import * as d from 'densing';
import type { Arg, Definition, Node, Param, Source } from '../../src/recording/definition';
import { DefinitionError, fail as raise } from '../../src/recording/definition';
import { classJson, operations, resolve, ROLES, slotType, type Type } from '../schema';
import { anyValue, MAX_ITEMS } from './fields';
import { createNumerics, snap, type ActivePresets, type NumericOptions } from './numerics';

const fail = (message: string) => raise(message, DefinitionError);
type Data = Record<string, any>;
const CHARS = [...Array(95)].map((_, i) => String.fromCharCode(32 + i));
const text = (name: string) => d.enumArray(name, d.enumeration('char', CHARS), 0, 255);
const OPS = ['item', 'field', ...new Set(operations.map((op) => op.id))];
const SIGNATURES = new Map(operations.map((op) => [`${op.id}|${op.static}`, op.params]));
const STAMP = [...OPS.join()].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const CONSTANTS: Record<string, Arg> = { omit: { omit: true }, null: null, true: true, false: false };

const ref = (name: string) => d.reference(name, () => operand);
const variants: Record<string, d.DenseField[]> = {
  ...{ node: [d.int('node', 0, 4095)], param: [d.int('param', 0, 4095)], omit: [], null: [], true: [], false: [] },
  ...Object.fromEntries(ROLES.map((role) => [role, [d.referenceNumeric('value', role)]])),
  ...{ string: [text('value')], nonFinite: [d.enumeration('value', ['Infinity', '-Infinity', 'NaN'])] },
  value: [anyValue('value')],
  list: [d.array('items', 0, MAX_ITEMS, ref('item'))],
  object: [d.array('fields', 0, 64, d.object('field', text('name'), ref('value')))],
};
const operand: d.Template = d.template(d.union('operand', d.enumeration('kind', Object.keys(variants)), variants));
const named = (name: string, ...fields: d.DenseField[]) =>
  d.array(`${name}s`, 0, 4095, d.object(name, text('name'), ...fields, ref('value')));

const args = d.array('args', 0, 64, ref('arg'));
const node = d.object('node', d.enumeration('op', OPS), d.optional('self', ref('self')), args);
const types = d.enumeration('type', ['number', 'string', 'boolean', ...Object.keys(classJson)]);
const FIELDS = [d.int('stamp', 0, 0xffffffff), named('param', types), named('output'), d.array('nodes', 0, 4095, node)];

const make = (options: NumericOptions, ...fields: d.DenseField[]) =>
  d.schemaWithDefinitions(createNumerics(options), ...fields) as d.DenseSchema;
export type DenseDefinitionSchema = { schema: d.DenseSchema; options: NumericOptions };
export const createDefinitionSchema = (options: NumericOptions = {}) => ({ options, schema: make(options, ...FIELDS) });

/** How a number is stored: the role of the type it is passed as (numeric enums are exact parameters). */
function kindOf(type: Type | undefined): string {
  const t = type === undefined ? undefined : resolve(type);
  if (typeof t === 'string') return (ROLES as readonly string[]).includes(t) ? t : 'coordinate';
  if (Array.isArray(t) || (t && 'tuple' in t)) return kindOf(Array.isArray(t) ? t[0] : t.tuple[0]);
  if (t && 'or' in t) return t.or.map(kindOf).find((kind) => kind !== 'coordinate') ?? 'coordinate';
  return t && 'enum' in t && t.enum.some((v) => typeof v === 'number') ? 'parameter' : 'coordinate';
}
/** The type of field `key` of an object type (through unions), where it can be told. */
function fieldOf(type: Type | undefined, key: string): Type | undefined {
  const t = type === undefined ? undefined : resolve(type);
  if (t && typeof t === 'object' && 'or' in t) return t.or.map((member) => fieldOf(member, key)).find(Boolean);
  return t && typeof t === 'object' && 'object' in t && key in t.object ? slotType(t.object[key]!) : undefined;
}

export function encodeDefinition(def: Definition, presets: ActivePresets = {}, dense = createDefinitionSchema()) {
  const ids = new Map(def.nodes.map((node, i) => [node.id, i]));
  const names = Object.keys(def.params);
  const roles = new Map<string, Type | undefined>();
  const encode = (arg: Arg | undefined, type?: Type): Data => {
    if (arg === undefined || JSON.stringify(arg) === '{"omit":true}') return { kind: 'omit' };
    if (arg === null || typeof arg === 'boolean') return { kind: `${arg}` };
    if (typeof arg === 'number') return { kind: kindOf(type), value: arg };
    if (typeof arg === 'string') return { kind: 'string', value: [...arg] };
    if (Array.isArray(arg)) return { kind: 'list', items: arg.map((item) => encode(item, type)) };
    if ('ref' in arg) return { kind: 'node', node: ids.get(arg.ref) ?? fail(`Unknown node ${arg.ref}`) };
    if ('param' in arg) roles.set(arg.param, roles.get(arg.param) ?? type);
    if ('param' in arg) return { kind: 'param', param: names.indexOf(arg.param) };
    if ('value' in arg) return { kind: 'value', value: arg.value };
    if ('number' in arg) return { kind: 'nonFinite', value: arg.number };
    const field = ([name, value]: [string, Arg]) => ({ name: [...name], value: encode(value, fieldOf(type, name)) });
    return { kind: 'object', fields: Object.entries((arg as { object: Record<string, Arg> }).object).map(field) };
  };
  const source = (s: Source) => encode(typeof s === 'string' ? { ref: s } : s);
  const nodes = def.nodes.map((node) => {
    const part = 'of' in node && ('index' in node ? node.index : node.name);
    if ('of' in node) return { op: node.op, self: source(node.of), args: [encode(part as Arg, 'integer')] };
    const sig = SIGNATURES.get(`${node.op}|${node.self === undefined}`) ?? fail(`${node.op} is not in the vec2 schema`);
    const args = (node.args ?? []).map((arg, i) => encode(arg, slotType((sig[i] ?? sig.at(-1))![1])));
    return { op: node.op, self: node.self === undefined ? null : source(node.self), args };
  });
  const param = ([name, p]: [string, Param]) => ({ ...p, name: [...name], value: encode(p.value, roles.get(name)) });
  const params = Object.entries(def.params).map(param);
  const outputs = Object.entries(def.outputs).map(([name, s]) => ({ name: [...name], value: source(s) }));
  return d.densing(dense.schema, snap(dense.schema, { $presets: presets, stamp: STAMP, params, nodes, outputs }));
}

export function decodeDefinition(encoded: string, dense = createDefinitionSchema()) {
  const data = d.undensing(dense.schema, encoded) as Data;
  if (data.stamp !== STAMP) fail('This payload was written against another version of the vec2 operations');
  const str = (chars: string[]) => chars.join('');
  const byName = (list: Data[], f: (o: Data) => unknown) => Object.fromEntries(list.map((o) => [str(o.name), f(o)]));
  const names: string[] = data.params.map((p: Data) => str(p.name));
  const decode = (o: Data): Arg => {
    if (o.kind in CONSTANTS) return CONSTANTS[o.kind]!;
    if (o.kind === 'node') return { ref: `n${o.node}` };
    if (o.kind === 'param') return { param: names[o.param]! };
    if (o.kind === 'string') return str(o.value);
    if (o.kind === 'list') return o.items.map(decode);
    if (o.kind === 'object') return { object: byName(o.fields, (f) => decode(f.value)) as Record<string, Arg> };
    return o.kind === 'value' ? { value: o.value } : o.kind === 'nonFinite' ? { number: o.value } : o.value;
  };
  const source = (o: Data) => ((d) => (typeof d === 'object' && d && 'ref' in d ? d.ref : d))(decode(o)) as Source;
  const nodes = data.nodes.map(({ op, self, args }: Data, i: number): Node => {
    const values = args.map(decode);
    if (op === 'item' || op === 'field')
      return { id: `n${i}`, op, of: source(self), [op === 'item' ? 'index' : 'name']: values[0] } as Node;
    return { id: `n${i}`, op, ...(self && { self: source(self) }), ...(values.length && { args: values }) };
  });
  const params = byName(data.params, (p) => ({ type: p.type, value: decode(p.value) })) as Definition['params'];
  const outputs = byName(data.outputs, (o) => source(o.value)) as Definition['outputs'];
  const definition: Definition = { format: 'vec2-definition', version: 2, params, nodes, outputs };
  return { definition, presets: data.$presets as ActivePresets };
}

/** A schema for one stored vec2 value, whose data is exactly its `toJson()` output. */
export const createValueSchema = (options: NumericOptions = {}) => make(options, anyValue('value'));
export const encodeValue = (value: { toJson(): unknown }, presets: ActivePresets = {}, schema = createValueSchema()) =>
  d.densing(schema, snap(schema, { $presets: presets, value: value.toJson() }));
export const decodeValue = (text: string, schema = createValueSchema()) => (d.undensing(schema, text) as Data).value;
