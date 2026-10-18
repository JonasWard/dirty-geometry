/**
 * Recorded definitions and vec2 values as densing strings, with the generated vec2.dense.json. densing encodes and
 * decodes; one walk along the schema maps the history to densing data (snapping numbers onto their ranges) and back.
 */
import * as d from 'densing';
import type { Arg, Definition, Node, Source } from '../../src/recording/definition';
import { DefinitionError, fail as raise } from '../../src/recording/definition';
import { classJson, operations } from '../schema';
import dense from '../vec2.dense.json';

type F = Record<string, any>;
/** The range each number type is packed with (`{ Coordinate: '±10@0.001' }`); otherwise its first range. */
export type ActivePresets = Record<string, string>;
export type CustomPreset = d.NumericPreset;
/** Extra ranges per number type: `{ custom: { Coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } }`. */
export type NumericOptions = { custom?: Record<string, Record<string, CustomPreset>> };
export type DenseDefinitionSchema = { schema: d.DenseSchema; options: NumericOptions };

const fail = (message: string) => raise(message, DefinitionError);
const isOmit = (a: unknown) => a === undefined || (typeof a === 'object' && a !== null && 'omit' in a);
const STAMP = [...JSON.stringify(dense.fields)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 1);
const NODES = (dense.fields.find((f) => f.name === 'nodes') as F).items as F;
/** The union keys down to an operation: its schema path, minus the levels left out because they had one entry. */
const keysOf = (path: string[], union: F = NODES): string[] => {
  const i = path.findIndex((segment) => segment in union.variants);
  if (i < 0) return fail(`${path.join('.')} is not in the vec2 schema`);
  const rest = path.slice(i + 1);
  return [path[i]!, ...(rest.length ? keysOf(rest, union.variants[path[i]!][0]) : [])];
};
const KEYS = new Map(operations.map((op) => [op.id, keysOf(op.path)]));
const IDS = new Map([...KEYS].map(([id, keys]) => [keys.join('.'), id]));
const CLASS_OF_TAG = Object.fromEntries(Object.entries(classJson).map(([cls, json]) => [json.slice(0, -4), cls]));
/** `MathJson` is template 0; the value templates end where `Source` starts. */
const VALUE = { type: 'reference', name: 'value', ref: 0 };
const VALUE_TEMPLATES = dense.templates.slice(
  0,
  dense.templates.findIndex((t) => t.name === 'Source'),
);
const ranges = (o: NumericOptions) =>
  dense.definitions.map((n) => ({ ...n, presets: { ...n.presets, ...o.custom?.[n.name] } }));

const cache = new Map<string, DenseDefinitionSchema>();
export function createDefinitionSchema(options: NumericOptions = {}): DenseDefinitionSchema {
  const key = JSON.stringify(options);
  if (!cache.has(key))
    cache.set(key, { options, schema: d.schemaFromJson({ ...dense, definitions: ranges(options) }) });
  return cache.get(key)!;
}
export const createValueSchema = (options: NumericOptions = {}) =>
  d.schemaFromJson({ definitions: ranges(options), templates: VALUE_TEMPLATES, fields: [VALUE] });

export function resolvePreset(definitions: readonly d.NumericDefinition[], type: string, active: ActivePresets = {}) {
  const presets = definitions.find((definition) => definition.name === type)?.presets ?? {};
  const name = active[type] ?? Object.keys(presets)[0]!;
  return { ...(presets[name] ?? fail(`Unknown ${type} range ${name}`)), name };
}

/** Walks JSON data along a field: in, numbers snap onto their range; out, nested JSON types get their tag back. */
function walker({ templates = [], definitions = [] }: d.DenseSchema, presets: ActivePresets, out: boolean) {
  const snap = (v: number, { min, precision = 1 }: CustomPreset) =>
    out ? v : Number((min + Math.round((v - min) / precision) * precision).toPrecision(12));
  const all = (fields: F[], v: F) => byName(fields, (f) => walk(f, v[f.name]));
  const walk = (f: F, v: any): any => {
    if (v === null || v === undefined) return v;
    if (f.type === 'reference_numeric') return snap(v, resolvePreset(definitions, f.ref, presets));
    if (f.type === 'fixed') return snap(v, f as CustomPreset);
    if (f.type === 'optional') return walk(f.field, v);
    if (f.type === 'array') return v.map((item: unknown) => walk(f.items, item));
    if (f.type === 'object') return all(f.fields, v);
    if (f.type === 'union') return { type: v.type, ...all(f.variants[v.type], v) }; // `MathJson`, keyed by `type`
    if (f.type !== 'reference') return v;
    const t = templates[f.ref] as F;
    return { ...(out && t.type === 'object' && /Json$/.test(t.name) && { type: t.name.slice(0, -4) }), ...walk(t, v) };
  };
  return walk;
}
/** The field of variant `type` in the union behind `f` (an argument type, `ParamValue`). */
const variant = ({ templates = [] }: d.DenseSchema, f: F, type: string): F | undefined =>
  (f.type === 'reference' ? (templates[f.ref] as F) : f).variants[type]?.[0];
const byName = (fields: F[], value: (f: F) => unknown) => Object.fromEntries(fields.map((f) => [f.name, value(f)]));
/** A nested union is the single field of its variant, named after it. */
const nested = (fields: F[], key: string) =>
  fields.length === 1 && fields[0]!.type === 'union' && fields[0]!.name === key;

export function encodeDefinition(def: Definition, presets: ActivePresets = {}, dense = createDefinitionSchema()) {
  const { schema } = dense;
  const walk = walker(schema, presets, false);
  const ids = new Map(def.nodes.map((node, i) => [node.id, i]));
  const names = Object.keys(def.params);
  const types = new Map<string, string>(); // a param's number type: that of its first use
  const source = (s: Source) =>
    typeof s === 'string' ? { type: 'node', node: ids.get(s) } : { type: 'param', param: names.indexOf(s.param) };
  /** A history argument → the data of its argument type's union, keyed by the argument's JS shape. */
  const arg = (f: F, a: Arg | undefined): F => {
    const v = (type: string) => variant(schema, f, type) ?? fail(`${f.name} takes no ${type}`);
    if (isOmit(a)) return { type: 'omit' };
    if (typeof a === 'number') return { type: 'number', value: walk(v('number'), a) };
    if (typeof a === 'string') return { type: 'string', value: v('string').type === 'enum' ? a : [...a] };
    if (a === null || typeof a === 'boolean') return { type: a === null ? 'null' : 'boolean', value: a };
    if (Array.isArray(a)) return { type: 'list', items: a.map((item) => arg(v('list').items, item)) };
    if ('ref' in a!) return source(a.ref);
    if ('value' in a!) return { type: 'value', value: walk(VALUE, a.value) };
    if ('number' in a!) return { type: 'nonFinite', value: a.number };
    if ('param' in a!) {
      if (!types.has(a.param)) types.set(a.param, variant(schema, f, 'number')?.ref ?? 'Coordinate');
      return source(a);
    }
    const object = (a as { object: Record<string, Arg> }).object;
    if (!variant(schema, f, 'record'))
      return { type: 'object', fields: byName(v('object').fields, (c) => arg(c, object[c.name])) };
    const entries = Object.entries(object).map(([k, item]) => ({
      name: [...k],
      value: arg(v('record').items.fields[1], item),
    }));
    return { type: 'record', entries };
  };
  /** `{ type: 'core', core: { type: 'Vec2', Vec2: { type: 'add', ...fields } } }` down the union keys. */
  const nest = (keys: string[], union: F, leaf: (fields: F[]) => F): F => {
    const [key, ...rest] = keys as [string, ...string[]];
    const fields = union.variants[key];
    return rest.length ? { type: key, [key]: nest(rest, fields[0], leaf) } : { type: key, ...leaf(fields) };
  };
  const nodes = def.nodes.map((node) => {
    const keys =
      'of' in node ? keysOf(node.op.split('.')) : (KEYS.get(node.op) ?? fail(`${node.op} is not in the vec2 schema`));
    if ('of' in node)
      return nest(keys, NODES, () => ({ of: source(node.of), at: 'index' in node ? node.index : [...node.name] }));
    const args = [...(node.args ?? [])];
    const field = (f: F) => (f.type === 'array' ? args.splice(0).map((a) => arg(f.items, a)) : arg(f, args.shift()));
    return nest(keys, NODES, (fields) => byName(fields, (f) => (f.name === 'self' ? source(node.self!) : field(f))));
  });
  const value = (name: string, v: Arg): F => {
    if (typeof v === 'number')
      return {
        type: types.get(name) ?? 'Coordinate',
        value: walk({ type: 'reference_numeric', ref: types.get(name) ?? 'Coordinate' }, v),
      };
    if (typeof v === 'string' || typeof v === 'boolean')
      return { type: typeof v, value: typeof v === 'string' ? [...v] : v };
    if (v && typeof v === 'object' && 'value' in v) return { type: 'value', value: walk(VALUE, v.value) };
    if (v && typeof v === 'object' && 'number' in v) return { type: 'nonFinite', value: v.number };
    return fail(`Param ${name} cannot be packed`);
  };
  const params = Object.entries(def.params).map(([name, p]) => ({ name: [...name], value: value(name, p.value) }));
  const outputs = Object.entries(def.outputs).map(([name, s]) => ({ name: [...name], value: source(s) }));
  return d.densing(schema, { $presets: presets, stamp: STAMP, params, outputs, nodes });
}

export function decodeDefinition(encoded: string, dense = createDefinitionSchema()) {
  const { schema } = dense;
  const walk = walker(schema, {}, true);
  const data = d.undensing(schema, encoded) as F;
  if (data.stamp !== STAMP) fail('This payload was written against another version of the vec2 operations');
  const str = (chars: string[]) => chars.join('');
  const names: string[] = data.params.map((p: F) => str(p.name));
  const source = (o: F): Source => (o.type === 'node' ? `n${o.node}` : { param: names[o.param]! });
  const arg = (f: F, o: F): Arg => {
    const v = (type: string) => variant(schema, f, type)!;
    if (o.type === 'omit' || o.type === 'null') return o.type === 'null' ? null : { omit: true };
    if (o.type === 'node' || o.type === 'param') return o.type === 'node' ? { ref: `n${o.node}` } : source(o);
    if (o.type === 'list') return o.items.map((item: F) => arg(v('list').items, item));
    if (o.type === 'value') return { value: walk(VALUE, o.value) };
    if (o.type === 'nonFinite') return { number: o.value };
    const entries = o.entries?.map((e: F) => [str(e.name), arg(v('record').items.fields[1], e.value)]);
    if (o.type === 'record') return { object: Object.fromEntries(entries) };
    if (o.type !== 'object') return Array.isArray(o.value) ? str(o.value) : o.value;
    const fields = Object.entries(byName(v('object').fields, (c) => arg(c, o.fields[c.name])));
    return { object: Object.fromEntries(fields.filter(([, item]) => !isOmit(item))) as Record<string, Arg> };
  };
  const nodes = data.nodes.map((o: F, i: number): Node => {
    const keys: string[] = [];
    let [union, cur] = [NODES, o];
    for (; nested(union.variants[cur.type], cur.type); [union, cur] = [union.variants[cur.type][0], cur[cur.type]])
      keys.push(cur.type);
    keys.push(cur.type);
    if (keys[0] === 'result') {
      const part = keys[1] === 'item' ? { index: cur.at } : { name: str(cur.at) };
      return { id: `n${i}`, op: keys.join('.'), of: source(cur.of), ...part } as Node;
    }
    const fields = (union.variants[cur.type] as F[]).filter((f) => f.name !== 'self');
    const args = fields.flatMap((f) =>
      f.type === 'array' ? cur[f.name].map((x: F) => arg(f.items, x)) : [arg(f, cur[f.name])],
    );
    while (args.length && isOmit(args.at(-1))) args.pop();
    const op = IDS.get(keys.join('.')) ?? fail(`${keys.join('.')} is not in the vec2 schema`);
    return { id: `n${i}`, op, ...(cur.self && { self: source(cur.self) }), ...(args.length && { args }) };
  });
  const param = ({ type, value }: F) => {
    if (type === 'string') return { type, value: str(value) };
    if (type === 'boolean') return { type, value };
    if (type === 'value')
      return {
        type: CLASS_OF_TAG[value.type] ?? fail(`Unknown value ${value.type}`),
        value: { value: walk(VALUE, value) },
      };
    return { type: 'number', value: type === 'nonFinite' ? { number: value } : value };
  };
  const params = Object.fromEntries(data.params.map((p: F) => [str(p.name), param(p.value)]));
  const outputs = Object.fromEntries(data.outputs.map((o: F) => [str(o.name), source(o.value)]));
  const definition: Definition = { format: 'vec2-definition', version: 3, params, nodes, outputs };
  return { definition, presets: data.$presets as ActivePresets };
}

/** A vec2 value's `toJson()` as a densing string, and back. */
export const encodeValue = (value: { toJson(): unknown }, presets: ActivePresets = {}, schema = createValueSchema()) =>
  d.densing(schema, { $presets: presets, value: walker(schema, presets, false)(VALUE, value.toJson()) });
export const decodeValue = (encoded: string, schema = createValueSchema()) =>
  walker(schema, {}, true)(VALUE, (d.undensing(schema, encoded) as F).value);
