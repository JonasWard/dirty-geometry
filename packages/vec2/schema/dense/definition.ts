/**
 * Recorded definitions and vec2 values as densing strings, with the generated vec2.dense.json. densing encodes and
 * decodes; one walk along the schema maps the history to densing data (snapping numbers onto their ranges) and back.
 */
import * as d from 'densing';
import type { Arg, Definition, Node, Source } from '../../src/recording/definition';
import { DefinitionError, fail as raise } from '../../src/recording/definition';
import { operations } from '../schema';
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
const PATHS = new Map(operations.map((op) => [`${op.id}|${op.static}`, op.path.join('/')]));
const IDS = new Map(operations.map((op) => [op.path.join('/'), op.id]));
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
/** The field of variant `kind` in the union behind `f` (an `Arg<T>`, `ParamValue`). */
const variant = ({ templates = [] }: d.DenseSchema, f: F, kind: string): F | undefined =>
  (f.type === 'reference' ? (templates[f.ref] as F) : f).variants[kind]?.[0];
const items = (schema: d.DenseSchema, name: string) => (schema.fields.find((f) => f.name === name) as F).items as F;
const byName = (fields: F[], value: (f: F) => unknown) => Object.fromEntries(fields.map((f) => [f.name, value(f)]));

export function encodeDefinition(def: Definition, presets: ActivePresets = {}, dense = createDefinitionSchema()) {
  const { schema } = dense;
  const walk = walker(schema, presets, false);
  const ids = new Map(def.nodes.map((node, i) => [node.id, i]));
  const names = Object.keys(def.params);
  const types = new Map<string, string>(); // a param's number type: that of its first use
  const source = (s: Source) =>
    typeof s === 'string' ? { kind: 'node', node: ids.get(s) } : { kind: 'param', param: names.indexOf(s.param) };
  /** A history argument → its `Arg<T>` union data, keyed by the argument's JS shape. */
  const arg = (f: F, a: Arg | undefined): F => {
    const v = (kind: string) => variant(schema, f, kind) ?? fail(`${f.name} takes no ${kind}`);
    if (isOmit(a)) return { kind: 'omit' };
    if (typeof a === 'number') return { kind: 'number', value: walk(v('number'), a) };
    if (typeof a === 'string') return { kind: 'string', value: v('string').type === 'enum' ? a : [...a] };
    if (a === null || typeof a === 'boolean') return { kind: a === null ? 'null' : 'boolean', value: a };
    if (Array.isArray(a)) return { kind: 'list', items: a.map((item) => arg(v('list').items, item)) };
    if ('ref' in a!) return source(a.ref);
    if ('value' in a!) return { kind: 'value', value: walk(VALUE, a.value) };
    if ('number' in a!) return { kind: 'nonFinite', value: a.number };
    if ('param' in a!) {
      if (!types.has(a.param)) types.set(a.param, variant(schema, f, 'number')?.ref ?? 'Coordinate');
      return source(a);
    }
    const object = (a as { object: Record<string, Arg> }).object;
    if (!variant(schema, f, 'record'))
      return { kind: 'object', fields: byName(v('object').fields, (c) => arg(c, object[c.name])) };
    const entries = Object.entries(object).map(([k, item]) => ({
      name: [...k],
      value: arg(v('record').items.fields[1], item),
    }));
    return { kind: 'record', entries };
  };
  /** The nested `$op` unions down to `path`; a joined key (`vec2/Vec2`) stands for several path segments. */
  const nest = (u: F, path: string, leaf: (fields: F[]) => F): F => {
    const key = Object.keys(u.variants).find((k) => path === k || path.startsWith(`${k}/`));
    if (!key) return fail(`${path} is not in the vec2 schema`);
    const fields = u.variants[key];
    return key === path
      ? { $op: key, ...leaf(fields) }
      : { $op: key, $in: nest(fields[0], path.slice(key.length + 1), leaf) };
  };
  const nodes = def.nodes.map((node) => {
    if ('of' in node) {
      const at = 'index' in node ? node.index : [...node.name];
      return nest(items(schema, 'nodes'), node.op.replace('.', '/'), () => ({ of: source(node.of), at }));
    }
    const args = [...(node.args ?? [])];
    const path = PATHS.get(`${node.op}|${node.self === undefined}`) ?? fail(`${node.op} is not in the vec2 schema`);
    const field = (f: F) => (f.type === 'array' ? args.splice(0).map((a) => arg(f.items, a)) : arg(f, args.shift()));
    return nest(items(schema, 'nodes'), path, (fields) =>
      byName(fields, (f) => (f.name === 'self' ? source(node.self!) : field(f))),
    );
  });
  const params = Object.entries(def.params).map(([name, { type, value }]) => {
    const kind = types.get(name) ?? 'Coordinate';
    return {
      name: [...name],
      type,
      value: { kind, value: arg(variant(schema, items(schema, 'params').fields[2], kind)!, value) },
    };
  });
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
  const source = (o: F): Source => (o.kind === 'node' ? `n${o.node}` : { param: names[o.param]! });
  const arg = (f: F, o: F): Arg => {
    const v = (kind: string) => variant(schema, f, kind)!;
    if (o.kind === 'omit' || o.kind === 'null') return o.kind === 'null' ? null : { omit: true };
    if (o.kind === 'node' || o.kind === 'param') return o.kind === 'node' ? { ref: `n${o.node}` } : source(o);
    if (o.kind === 'list') return o.items.map((item: F) => arg(v('list').items, item));
    if (o.kind === 'value') return { value: walk(VALUE, o.value) };
    if (o.kind === 'nonFinite') return { number: o.value };
    const entries = o.entries?.map((e: F) => [str(e.name), arg(v('record').items.fields[1], e.value)]);
    if (o.kind === 'record') return { object: Object.fromEntries(entries) };
    if (o.kind !== 'object') return Array.isArray(o.value) ? str(o.value) : o.value;
    const fields = byName(v('object').fields, (c) => arg(c, o.fields[c.name]));
    return {
      object: Object.fromEntries(Object.entries(fields).filter(([, item]) => !isOmit(item))) as Record<string, Arg>,
    };
  };
  const nodes = data.nodes.map((o: F, i: number): Node => {
    let [u, cur, path] = [items(schema, 'nodes'), o, ''];
    for (; u.variants[cur.$op][0]?.name === '$in'; [u, cur] = [u.variants[cur.$op][0], cur.$in]) path += `${cur.$op}/`;
    path += cur.$op;
    if (path.startsWith('result/')) {
      const part = path === 'result/item' ? { index: cur.at } : { name: str(cur.at) };
      return { id: `n${i}`, op: path.replace('/', '.'), of: source(cur.of), ...part } as Node;
    }
    const fields = (u.variants[cur.$op] as F[]).filter((f) => f.name !== 'self');
    const args = fields.flatMap((f) =>
      f.type === 'array' ? cur[f.name].map((x: F) => arg(f.items, x)) : [arg(f, cur[f.name])],
    );
    while (args.length && isOmit(args.at(-1))) args.pop();
    const op = IDS.get(path) ?? fail(`${path} is not in the vec2 schema`);
    return { id: `n${i}`, op, ...(cur.self && { self: source(cur.self) }), ...(args.length && { args }) };
  });
  const value = (p: F) => arg(variant(schema, items(schema, 'params').fields[2], p.value.kind)!, p.value.value);
  const params = Object.fromEntries(data.params.map((p: F) => [str(p.name), { type: p.type, value: value(p) }]));
  const outputs = Object.fromEntries(data.outputs.map((o: F) => [str(o.name), source(o.value)]));
  const definition: Definition = { format: 'vec2-definition', version: 3, params, nodes, outputs };
  return { definition, presets: data.$presets as ActivePresets };
}

/** A vec2 value's `toJson()` as a densing string, and back. */
export const encodeValue = (value: { toJson(): unknown }, presets: ActivePresets = {}, schema = createValueSchema()) =>
  d.densing(schema, { $presets: presets, value: walker(schema, presets, false)(VALUE, value.toJson()) });
export const decodeValue = (encoded: string, schema = createValueSchema()) =>
  walker(schema, {}, true)(VALUE, (d.undensing(schema, encoded) as F).value);
