/**
 * Version 3 densing strings (links written before version 4), decoded with a frozen copy of their schema and op ids.
 * Nothing here reads the live schema, so these links keep decoding while the operations change; `fromV3` then maps
 * the result onto today's operations. Loaded only when such a link is opened.
 */
import * as d from 'densing';
import type { ArgV3, DefinitionV3, NodeV3, SourceV3 } from '../../../src/recording/v3';
import { DefinitionError, fail as raise } from '../../../src/recording/definition';
import type { ActivePresets, NumericOptions } from '../definition';
import dense from './vec2.dense.json';
import tables from './tables.json';

type F = Record<string, any>;
const fail = (message: string) => raise(message, DefinitionError);
const isOmit = (a: unknown) => a === undefined || (typeof a === 'object' && a !== null && 'omit' in a);
export const STAMP_V3 = [...JSON.stringify(dense.fields)].reduce(
  (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0,
  1,
);
const NODES = (dense.fields.find((f) => f.name === 'nodes') as F).items as F;
const IDS: Record<string, string> = tables.ops;
const CLASS_OF_TAG: Record<string, string> = tables.classOfTag;
const VALUE = { type: 'reference', name: 'value', ref: 0 };

const cache = new Map<string, d.DenseSchema>();
const schemaFor = (options: NumericOptions) => {
  const key = JSON.stringify(options);
  if (!cache.has(key)) {
    const definitions = dense.definitions.map((n) => ({
      ...n,
      presets: { ...n.presets, ...options.custom?.[n.name] },
    }));
    cache.set(key, d.schemaFromJson({ ...dense, definitions }));
  }
  return cache.get(key)!;
};

const byName = (fields: F[], value: (f: F) => unknown) => Object.fromEntries(fields.map((f) => [f.name, value(f)]));
/** Walks decoded data along a field, giving nested JSON types their `type` tag back. */
function tagger({ templates = [] }: d.DenseSchema) {
  const all = (fields: F[], v: F) => byName(fields, (f) => walk(f, v[f.name]));
  const walk = (f: F, v: any): any => {
    if (v === null || v === undefined) return v;
    if (f.type === 'optional') return walk(f.field, v);
    if (f.type === 'array') return v.map((item: unknown) => walk(f.items, item));
    if (f.type === 'object') return all(f.fields, v);
    if (f.type === 'union') return { type: v.type, ...all(f.variants[v.type], v) };
    if (f.type !== 'reference') return v;
    const t = templates[f.ref] as F;
    return { ...(t.type === 'object' && /Json$/.test(t.name) && { type: t.name.slice(0, -4) }), ...walk(t, v) };
  };
  return walk;
}
const variant = ({ templates = [] }: d.DenseSchema, f: F, type: string): F | undefined =>
  (f.type === 'reference' ? (templates[f.ref] as F) : f).variants[type]?.[0];
const nested = (fields: F[], key: string) =>
  fields.length === 1 && fields[0]!.type === 'union' && fields[0]!.name === key;

export function decodeDefinitionV3(
  encoded: string,
  options: NumericOptions = {},
): { definition: DefinitionV3; presets: ActivePresets } {
  const schema = schemaFor(options);
  const walk = tagger(schema);
  const data = d.undensing(schema, encoded) as F;
  if (data.stamp !== STAMP_V3) fail('This payload was written against another version of the vec2 operations');
  const str = (chars: string[]) => chars.join('');
  const names: string[] = data.params.map((p: F) => str(p.name));
  const source = (o: F): SourceV3 => (o.type === 'node' ? `n${o.node}` : { param: names[o.param]! });
  const arg = (f: F, o: F): ArgV3 => {
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
    return { object: Object.fromEntries(fields.filter(([, item]) => !isOmit(item))) as Record<string, ArgV3> };
  };
  const nodes = data.nodes.map((o: F, i: number): NodeV3 => {
    const keys: string[] = [];
    let [union, cur] = [NODES, o];
    for (; nested(union.variants[cur.type], cur.type); [union, cur] = [union.variants[cur.type][0], cur[cur.type]])
      keys.push(cur.type);
    keys.push(cur.type);
    if (keys[0] === 'result') {
      const part = keys[1] === 'item' ? { index: cur.at } : { name: str(cur.at) };
      return { id: `n${i}`, op: keys.join('.'), of: source(cur.of), ...part } as NodeV3;
    }
    const fields = (union.variants[cur.type] as F[]).filter((f) => f.name !== 'self');
    const args = fields.flatMap((f) =>
      f.type === 'array' ? cur[f.name].map((x: F) => arg(f.items, x)) : [arg(f, cur[f.name])],
    );
    while (args.length && isOmit(args.at(-1))) args.pop();
    const op = IDS[keys.join('.')] ?? fail(`${keys.join('.')} is not in the version 3 schema`);
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
  return { definition: { format: 'vec2-definition', version: 3, params, nodes, outputs }, presets: data.$presets };
}
