/**
 * Version 4 definitions and vec2 values as densing strings, with the generated vec2.dense.json.
 *
 * Every expression is packed in the union of the type expected where it stands (an argument's parameter type, a
 * cell's own type), so only expressions that fit can be packed, and an operation costs only the bits of the
 * operations whose result fits there. Numbers snap onto the active range of their number type.
 *
 * The schema is used as generated, without densing's `schemaFromJson`: its validation walks every path through the
 * templates, and a typed expression grammar is one large cycle. The generator builds the schema so that it is valid
 * (tests check its structure).
 */
import * as d from 'densing';
import type { Cell, Definition, Expr, Fn, Input } from '../../src/recording/definition';
import { DefinitionError, fail as raise } from '../../src/recording/definition';
import { operationById, type Type } from '../schema';
import { checkDefinition, groupKey, members, parseTypeName, typeName, typer, widen, type FnType } from '../typing';
import dense from '../vec2.dense.json';

type F = Record<string, any>;
/** The range each number type is packed with (`{ Coordinate: '±10@0.001' }`); otherwise its first range. */
export type ActivePresets = Record<string, string>;
export type CustomPreset = d.NumericPreset;
/** Extra ranges per number type: `{ custom: { Coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } }`. */
export type NumericOptions = { custom?: Record<string, Record<string, CustomPreset>> };
export type DenseDefinitionSchema = { schema: d.DenseSchema; options: NumericOptions };

const fail = (message: string): never => raise(message, DefinitionError);
const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 1);
/** Written first in every payload: a payload packed with another schema is refused. */
export const STAMP = hash(JSON.stringify([dense.fields, dense.templates]));
const TEMPLATES = dense.templates as F[];
const INDEX = new Map(TEMPLATES.map((t, i) => [t.name as string, i]));
const ANY = TEMPLATES[INDEX.get('Any')!]!;
/** The types a cell, an input or a function body can be packed as (and so declared as). */
export const PACKABLE_TYPES: readonly string[] = Object.keys(ANY.variants).filter(Boolean);
/** `MathJson` is template 0; the value templates end where `Any` starts. */
const VALUE = { type: 'reference', name: 'value', ref: 0 };
const VALUE_TEMPLATES = TEMPLATES.slice(0, INDEX.get('Any'));
const ranges = (o: NumericOptions): d.NumericDefinition[] =>
  (dense.definitions as unknown as d.NumericDefinition[]).map((n) => ({
    ...n,
    presets: { ...n.presets, ...o.custom?.[n.name] },
  }));

const cache = new Map<string, DenseDefinitionSchema>();
export function createDefinitionSchema(options: NumericOptions = {}): DenseDefinitionSchema {
  const key = JSON.stringify(options);
  if (!cache.has(key))
    cache.set(key, { options, schema: { ...(dense as unknown as d.DenseSchema), definitions: ranges(options) } });
  return cache.get(key)!;
}
export const createValueSchema = (options: NumericOptions = {}) =>
  d.schemaFromJson({ definitions: ranges(options), templates: VALUE_TEMPLATES, fields: [VALUE] });

export function resolvePreset(definitions: readonly d.NumericDefinition[], type: string, active: ActivePresets = {}) {
  const presets = definitions.find((definition) => definition.name === type)?.presets ?? {};
  const name = active[type] ?? Object.keys(presets)[0]!;
  return { ...(presets[name] ?? fail(`Unknown ${type} range ${name}`)), name };
}

/** `v` on the grid of `preset` (not clamped to its range). */
export const snapTo = (v: number, { min, precision = 1 }: CustomPreset) =>
  Number((min + Math.round((v - min) / precision) * precision).toPrecision(12));

/** Walks a stored value along its JSON type: in, numbers snap onto their range; out, nested JSON types get their tag back. */
function walker(
  { templates = [], definitions = [] }: d.DenseSchema,
  presets: ActivePresets,
  out: boolean,
  seen?: (type: string, value: number) => void,
) {
  const snap = (v: number, preset: CustomPreset) => (out || seen ? v : snapTo(v, preset));
  const all = (fields: F[], v: F) => Object.fromEntries(fields.map((f) => [f.name, walk(f, v[f.name])]));
  const walk = (f: F, v: any): any => {
    if (v === null || v === undefined) return v;
    if (f.type === 'reference_numeric') {
      seen?.(f.ref, v);
      return snap(v, resolvePreset(definitions, f.ref, presets));
    }
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

/** The expression union a field refers to. */
const target = (f: F): F => TEMPLATES[f.ref]!;
const keyOf = (f: F): string => target(f).name;
const fieldNamed = (fields: F[], name: string) => fields.find((f) => f.name === name);
/** A type's name as the schema spells it. */
export const canonicalType = (text: string) => typeName(parseTypeName(text));
/** The union a value of `type` is packed in at a root (a cell, a function body, `of`). */
function rootKey(type: Type, where: string, why?: string): string {
  if (type === 'unknown') return fail(`${where}: ${why ?? 'its type is unknown'}`);
  const key = typeName(widen(type));
  if (key in ANY.variants) return key;
  // A result that may be null is packed as its non-null type (it fits there).
  const nonNull = members(widen(type)).filter((m) => m !== 'null');
  const fallback = typeName(nonNull.length === 1 ? nonNull[0]! : { or: nonNull });
  return fallback in ANY.variants ? fallback : fail(`${where}: a ${key} cannot be packed; declare a type for it`);
}

type Names = { inputs: string[]; cells: string[]; params?: string[]; fns: Fn[] };

export const encodeDefinition = (def: Definition, presets: ActivePresets = {}, dense = createDefinitionSchema()) =>
  d.densing(dense.schema, pack(def, presets, dense));

/** Every number literal of a definition (stored values included), by the number type it is packed as. */
export function numberLiterals(def: Definition, dense = createDefinitionSchema()): Map<string, number[]> {
  const found = new Map<string, number[]>();
  pack(def, {}, dense, (type, value) => found.set(type, [...(found.get(type) ?? []), value]));
  return found;
}

/** The densing data of a definition; `seen` gets each number instead of it being snapped. */
function pack(
  def: Definition,
  presets: ActivePresets,
  dense: DenseDefinitionSchema,
  seen?: (type: string, value: number) => void,
) {
  if (def.version !== 4) fail(`Expected a version 4 definition, got version ${def.version}`);
  const { schema } = dense;
  const walk = walker(schema, presets, false, seen);
  const analysis = checkDefinition(def);
  const why = (name: string) => analysis.issues.find((issue) => issue.name === name)?.message;
  const fnTypes = new Map<string, FnType>();

  function expr(e: Expr, key: string, names: Names, scope: Map<string, Type>, at: string): F {
    const t = TEMPLATES[INDEX.get(key) ?? fail(`${at}: no layout for ${key}`)]!;
    const variant = (name: string, what = name): [F, ...F[]] =>
      t.variants[name] ?? fail(`${at}: a ${key} cannot be ${what}`);
    if (typeof e === 'number') {
      if (!Number.isFinite(e)) fail(`${at}: write ${e} as { number: '${e}' }`);
      return { type: 'number', value: walk(variant('number', 'a number')[0], e) };
    }
    if (typeof e === 'string') {
      const [f] = variant('string', 'text');
      return { type: 'string', value: f.type === 'enum' ? e : [...e] };
    }
    if (typeof e === 'boolean') return (variant('boolean', 'true or false'), { type: 'boolean', value: e });
    if (e === null) return (variant('null'), { type: 'null' });
    if (Array.isArray(e)) {
      const [f] = variant('list', 'a list');
      return { type: 'list', items: e.map((item, i) => expr(item, keyOf(f.items), names, scope, `${at}[${i}]`)) };
    }
    if ('number' in e) return (variant('nonFinite', e.number), { type: 'nonFinite', value: e.number });
    if ('value' in e) return (variant('value', 'a stored value'), { type: 'value', value: walk(VALUE, e.value) });
    if ('object' in e) {
      if (!('object' in t.variants)) {
        const [f] = variant('record', 'an object');
        const entries = Object.entries(e.object).map(([name, value]) => ({
          name: [...name],
          value: expr(value, keyOf(f.items.fields[1]), names, scope, `${at}.${name}`),
        }));
        return { type: 'record', entries };
      }
      const fields: F[] = variant('object')[0].fields;
      for (const name of Object.keys(e.object))
        if (!fieldNamed(fields, name)) fail(`${at}: a ${key} has no field ${name}`);
      const data = Object.fromEntries(
        fields.map((f) => {
          const value = e.object[f.name];
          if (f.type === 'optional')
            return [f.name, value === undefined ? null : expr(value, keyOf(f.field), names, scope, `${at}.${f.name}`)];
          return [
            f.name,
            expr(value ?? fail(`${at}: ${f.name} is missing`), keyOf(f), names, scope, `${at}.${f.name}`),
          ];
        }),
      );
      return { type: 'object', fields: data };
    }
    if ('ref' in e) {
      if (names.params) {
        const param = names.params.indexOf(e.ref);
        return param >= 0 ? { type: 'param', param } : fail(`${at}: ${e.ref} is not a param`);
      }
      const cell = names.cells.indexOf(e.ref);
      if (cell >= 0) return { type: 'cell', cell };
      const input = names.inputs.indexOf(e.ref);
      return input >= 0 ? { type: 'input', input } : fail(`${at}: ${e.ref} is not defined here`);
    }
    if ('call' in e) {
      const fn = names.fns.findIndex((f) => f.name === e.call);
      if (fn < 0) fail(`${at}: ${e.call} is not a function defined before here`);
      const args = names.fns[fn]!.params.map((p) =>
        any(
          e.args?.[p.name] ?? fail(`${at}: ${e.call}: ${p.name} is missing`),
          canonicalType(p.type),
          names,
          scope,
          `${at}.${p.name}`,
        ),
      );
      return { type: 'fn', fn, args };
    }
    if ('math' in e) {
      if (e.math === 'neg')
        return (variant('neg', 'arithmetic'), { type: 'neg', a: expr(e.args[0], key, names, scope, at) });
      variant('math', 'arithmetic');
      const [a, b] = e.args as [Expr, Expr];
      return { type: 'math', op: e.math, a: expr(a, key, names, scope, at), b: expr(b, key, names, scope, at) };
    }
    if ('of' in e) {
      const of = typer([], 'cell', '').typeOf(e.of, { refs: scope, fns: fnTypes });
      const data = any(e.of, rootKey(of, at), names, scope, `${at}.of`);
      return 'index' in e ? { type: 'index', of: data, at: e.index } : { type: 'field', of: data, at: [...e.field] };
    }
    const op = operationById.get(e.op) ?? fail(`${at}: ${e.op} is not a vec2 operation`);
    const group = `${groupKey(op.returns)} call`;
    const calls = target(variant(group, `${e.op} (it returns ${typeName(op.returns)})`)[0]);
    const fields: F[] = calls.variants[op.id];
    const args = e.args ?? {};
    for (const name of Object.keys(args))
      if (!fieldNamed(fields, name)) fail(`${at}: ${e.op} has no parameter ${name}`);
    const data = Object.fromEntries(
      fields.map((f) => {
        const place = `${at}.${f.name}`;
        if (f.name === 'self')
          return [f.name, expr(e.self ?? fail(`${place}: missing`), keyOf(f), names, scope, place)];
        const value = args[f.name];
        if (f.type === 'array') {
          if (value !== undefined && !Array.isArray(value)) fail(`${place}: takes a list of items`);
          return [
            f.name,
            ((value ?? []) as Expr[]).map((item, i) => expr(item, keyOf(f.items), names, scope, `${place}[${i}]`)),
          ];
        }
        if (f.type === 'optional')
          return [f.name, value === undefined ? null : expr(value, keyOf(f.field), names, scope, place)];
        return [f.name, expr(value ?? fail(`${place}: missing`), keyOf(f), names, scope, place)];
      }),
    );
    return { type: group, call: { type: op.id, ...data } };
  }
  const any = (e: Expr, key: string, names: Names, scope: Map<string, Type>, at: string) => ({
    type: key,
    value: expr(e, key, names, scope, at),
  });

  const fns = def.functions.map((fn, i) => {
    const params = fn.params.map((p) => ({ name: p.name, type: parseTypeName(p.type) }));
    const scope = new Map(params.map((p) => [p.name, p.type]));
    const returns = analysis.fns.get(fn.name)?.returns ?? 'unknown';
    fnTypes.set(fn.name, { params, returns });
    const names = { inputs: [], cells: [], params: fn.params.map((p) => p.name), fns: def.functions.slice(0, i) };
    return {
      name: [...fn.name],
      params: fn.params.map((p) => ({ name: [...p.name], type: canonicalType(p.type) })),
      body: any(fn.body, rootKey(returns, fn.name, why(fn.name)), names, scope, fn.name),
    };
  });
  const inputNames = def.inputs.map((input) => input.name);
  const inputs = def.inputs.map((input) => ({
    name: [...input.name],
    value: any(input.value, input.type, { inputs: [], cells: [], fns: [] }, new Map(), input.name),
  }));
  const cells = def.cells.map((cell, i) => {
    const declared = cell.type !== undefined && canonicalType(cell.type);
    if (declared && !(declared in ANY.variants)) fail(`${cell.name}: a ${declared} cannot be packed`);
    const key = declared || rootKey(analysis.refs.get(cell.name) ?? 'unknown', cell.name, why(cell.name));
    const names = { inputs: inputNames, cells: def.cells.slice(0, i).map((c) => c.name), fns: def.functions };
    return {
      name: [...cell.name],
      output: cell.output === true,
      typed: cell.type !== undefined,
      expr: any(cell.expr, key, names, analysis.refs, cell.name),
    };
  });
  return { $presets: presets, stamp: STAMP, inputs, functions: fns, cells };
}

export function decodeDefinition(encoded: string, dense = createDefinitionSchema()) {
  const { schema } = dense;
  const walk = walker(schema, {}, true);
  const data = d.undensing(schema, encoded) as F;
  if (data.stamp !== STAMP) fail('This payload was written against another version of the vec2 operations');
  const str = (chars: string[]) => chars.join('');

  function expr(o: F, key: string, names: Names): Expr {
    const t = TEMPLATES[INDEX.get(key)!]!;
    const only = (name: string) => t.variants[name][0] as F;
    const at = <T>(list: T[] | undefined, i: number, what: string) => list?.[i] ?? fail(`No ${what} ${i} here`);
    switch (o.type) {
      case 'input':
        return { ref: at(names.inputs, o.input, 'input') };
      case 'cell':
        return { ref: at(names.cells, o.cell, 'cell') };
      case 'param':
        return { ref: at(names.params, o.param, 'param') };
      case 'fn': {
        const fn = at(names.fns, o.fn, 'function');
        const args = Object.fromEntries(fn.params.map((p, i) => [p.name, anyOut(at(o.args, i, 'argument'), names)]));
        return { call: fn.name, ...(fn.params.length && { args }) };
      }
      case 'index':
        return { of: anyOut(o.of, names), index: o.at };
      case 'field':
        return { of: anyOut(o.of, names), field: str(o.at) };
      case 'value':
        return { value: walk(VALUE, o.value) };
      case 'nonFinite':
        return { number: o.value };
      case 'math':
        return { math: o.op, args: [expr(o.a, key, names), expr(o.b, key, names)] };
      case 'neg':
        return { math: 'neg', args: [expr(o.a, key, names)] };
      case 'number':
      case 'boolean':
        return o.value;
      case 'string':
        return Array.isArray(o.value) ? str(o.value) : o.value;
      case 'null':
        return null;
      case 'list':
        return o.items.map((item: F) => expr(item, keyOf(only('list').items), names));
      case 'record':
        return {
          object: Object.fromEntries(
            o.entries.map((e: F) => [str(e.name), expr(e.value, keyOf(only('record').items.fields[1]), names)]),
          ),
        };
      case 'object': {
        const fields: F[] = only('object').fields;
        const present = fields.filter((f) => o.fields[f.name] !== null && o.fields[f.name] !== undefined);
        return {
          object: Object.fromEntries(
            present.map((f) => [f.name, expr(o.fields[f.name], keyOf(f.type === 'optional' ? f.field : f), names)]),
          ),
        };
      }
    }
    const fields: F[] = target(only(o.type)).variants[o.call.type];
    const op = operationById.get(o.call.type) ?? fail(`${o.call.type} is not a vec2 operation`);
    const args: Record<string, Expr> = {};
    let self: Expr | undefined;
    for (const f of fields) {
      const v = o.call[f.name];
      if (f.name === 'self') self = expr(v, keyOf(f), names);
      else if (f.type === 'array') {
        if (v.length) args[f.name] = v.map((item: F) => expr(item, keyOf(f.items), names));
      } else if (f.type === 'optional') {
        if (v !== null && v !== undefined) args[f.name] = expr(v, keyOf(f.field), names);
      } else args[f.name] = expr(v, keyOf(f), names);
    }
    return { op: op.id, ...(self !== undefined && { self }), ...(Object.keys(args).length && { args }) };
  }
  const anyOut = (o: F, names: Names) => expr(o.value, o.type, names);

  const functions: Fn[] = [];
  for (const f of data.functions) {
    const params = f.params.map((p: F) => ({ name: str(p.name), type: p.type as string }));
    const names = { inputs: [], cells: [], params: params.map((p: { name: string }) => p.name), fns: [...functions] };
    functions.push({ name: str(f.name), params, body: anyOut(f.body, names) });
  }
  const inputs: Input[] = data.inputs.map((i: F) => ({
    name: str(i.name),
    type: i.value.type,
    value: anyOut(i.value, { inputs: [], cells: [], fns: [] }),
  }));
  const cells: Cell[] = [];
  for (const c of data.cells) {
    const names = { inputs: inputs.map((i) => i.name), cells: cells.map((cell) => cell.name), fns: functions };
    cells.push({
      name: str(c.name),
      expr: anyOut(c.expr, names),
      ...(c.typed && { type: c.expr.type }),
      ...(c.output && { output: true as const }),
    });
  }
  const definition: Definition = { format: 'vec2-definition', version: 4, inputs, functions, cells };
  return { definition, presets: data.$presets as ActivePresets };
}

/** A vec2 value's `toJson()` as a densing string, and back. */
export const encodeValue = (value: { toJson(): unknown }, presets: ActivePresets = {}, schema = createValueSchema()) =>
  d.densing(schema, { $presets: presets, value: walker(schema, presets, false)(VALUE, value.toJson()) });
export const decodeValue = (encoded: string, schema = createValueSchema()) =>
  walker(schema, {}, true)(VALUE, (d.undensing(schema, encoded) as F).value);
