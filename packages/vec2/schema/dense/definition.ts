/**
 * Version 4 definitions and vec2 values as densing strings, with the generated vec2.dense.json.
 *
 * Every expression is packed in the union of the type expected where it stands (an argument's parameter type, a
 * cell's own type), so only expressions that fit can be packed, and an operation costs only the bits of the
 * operations whose result fits there. Numbers snap onto the active range of their number type.
 *
 * The schema is used as generated, without densing's `schemaFromJson`, so loading it costs nothing; tests check that
 * `schemaFromJson` accepts it.
 */
import * as d from 'densing';
import { isSharedForm } from '@dirty-geometry/fn/forms';
import { isArcOp, isLogOp, isTrigOp, isUnary } from '@dirty-geometry/fn/math';
import type { Cell, Definition, Expr, Fn, Input, SharedExpr } from '../../src/recording/definition';
import { DefinitionError, fail as raise } from '../../src/recording/definition';
import { classJson, operationById, type Type } from '../schema';
import { checkDefinition, members, parseTypeName, typeName, typer, widen, type FnType } from '../typing';
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
    if (f.type === 'union') return { type: v.type, ...all((templates[f.variants[v.type]] as F).fields, v) }; // `MathJson`
    if (f.type !== 'reference') return v;
    const t = templates[f.ref] as F;
    return { ...(out && t.type === 'object' && /Json$/.test(t.name) && { type: t.name.slice(0, -4) }), ...walk(t, v) };
  };
  return walk;
}

/** The fields of variant `key` of union `t` (its object template), if it has one. */
const fieldsOf = (t: F, key: string): F[] | undefined =>
  t.variants[key] === undefined ? undefined : TEMPLATES[t.variants[key]]!.fields;
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
      (fieldsOf(t, name) as [F, ...F[]] | undefined) ?? fail(`${at}: a ${key} cannot be ${what}`);
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
    if (isSharedForm<Expr>(e)) return form(e, key, variant, names, scope, at);
    if ('of' in e) {
      const of = typer([], 'cell', '').typeOf(e.of, { refs: scope, fns: fnTypes });
      const data = any(e.of, rootKey(of, at), names, scope, `${at}.of`);
      return 'index' in e ? { type: 'index', of: data, at: e.index } : { type: 'field', of: data, at: [...e.field] };
    }
    const op = operationById.get(e.op) ?? fail(`${at}: ${e.op} is not a vec2 operation`);
    const fields: F[] = variant(op.id, `${e.op} (it returns ${typeName(op.returns)})`);
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
    return { type: op.id, ...data };
  }
  const any = (e: Expr, key: string, names: Names, scope: Map<string, Type>, at: string) => ({
    type: key,
    value: expr(e, key, names, scope, at),
  });
  /** `e` under its own type (`of`, a list form's items). */
  const root = (e: Expr, names: Names, scope: Map<string, Type>, at: string) =>
    any(e, rootKey(typer([], 'cell', '').typeOf(e, { refs: scope, fns: fnTypes }), at), names, scope, at);

  /** The shared forms. Operands pack under the type their slot expects; `data` and `initial` under the callback's
   * param for them (so its type must be packable, like any param), or their own type when it has no such param. */
  function form(
    e: SharedExpr,
    key: string,
    variant: (name: string, what?: string) => [F, ...F[]],
    names: Names,
    scope: Map<string, Type>,
    at: string,
  ): F {
    const sub = (x: Expr, k: string, where: string) => expr(x, k, names, scope, `${at}.${where}`);
    const opt = (x: Expr | undefined, k: string, where: string) => (x === undefined ? null : sub(x, k, where));
    const fnIndex = (name: string) => {
      const i = names.fns.findIndex((f) => f.name === name);
      return i >= 0 ? i : fail(`${at}: ${name} is not a function defined before here`);
    };
    /** Packs `x` (if given) under param `param` of the callback, or under its own type. */
    const arg = (x: Expr | undefined, fn: string, param: number, where: string) => {
      if (x === undefined) return null;
      const declared = names.fns.find((f) => f.name === fn)?.params[param];
      return declared
        ? any(x, canonicalType(declared.type), names, scope, `${at}.${where}`)
        : root(x, names, scope, `${at}.${where}`);
    };
    if ('math' in e) {
      if (isTrigOp(e.math))
        return (variant('trig', 'a number'), { type: 'trig', op: e.math, a: sub(e.args[0], 'Radians', 'a') });
      if (isArcOp(e.math) || isLogOp(e.math))
        return (variant('arc', 'a number'), { type: 'arc', op: e.math, a: sub(e.args[0], 'number', 'a') });
      if (e.math === 'atan2') {
        variant('atan2', 'a number');
        const [y, x] = e.args as [Expr, Expr];
        return { type: 'atan2', y: sub(y, 'Coordinate', 'y'), x: sub(x, 'Coordinate', 'x') };
      }
      if (isUnary(e.math))
        return (variant('unary', 'arithmetic'), { type: 'unary', op: e.math, a: sub(e.args[0], key, 'a') });
      variant('math', 'arithmetic');
      const [a, b] = e.args as [Expr, Expr];
      return { type: 'math', op: e.math, a: sub(a, key, 'a'), b: sub(b, key, 'b') };
    }
    if ('compare' in e) {
      variant('compare', 'a comparison');
      const [a, b] = e.args;
      return {
        type: 'compare',
        op: e.compare,
        a: sub(a, 'number', 'a'),
        b: sub(b, 'number', 'b'),
        slack: opt(e.slack, 'Tolerance', 'slack'),
      };
    }
    if ('logic' in e) {
      if (e.logic === 'not')
        return (variant('not', 'true or false'), { type: 'not', a: sub(e.args[0], 'boolean', 'a') });
      variant('logic', 'true or false');
      return { type: 'logic', op: e.logic, a: sub(e.args[0], 'boolean', 'a'), b: sub(e.args[1], 'boolean', 'b') };
    }
    if ('if' in e) {
      variant('if');
      return {
        type: 'if',
        if: sub(e.if, 'boolean', 'if'),
        then: sub(e.then, key, 'then'),
        else: sub(e.else, key, 'else'),
      };
    }
    if ('random' in e) {
      variant(e.random, 'a random number');
      const seed = sub(e.seed, 'Integer', 'seed');
      if (e.random === 'white') return { type: 'white', seed, index: sub(e.index, 'Index', 'index') };
      if (e.random === 'jittered')
        return { type: 'jittered', seed, index: sub(e.index, 'Index', 'index'), count: sub(e.count, 'Index', 'count') };
      return { type: 'smooth', seed, t: sub(e.t, 'Coordinate', 't'), scale: opt(e.scale, 'Length', 'scale') };
    }
    switch (e.list) {
      case 'generate':
        variant('generate', 'a list');
        return {
          type: 'generate',
          fn: fnIndex(e.fn),
          count: sub(e.count, 'Index', 'count'),
          initial: arg(e.initial, e.fn, 1, 'initial'),
          data: arg(e.data, e.fn, 3, 'data'),
        };
      case 'map':
      case 'filter':
      case 'sort':
        variant('each', 'a list');
        return {
          type: 'each',
          op: e.list,
          fn: fnIndex(e.fn),
          items: root(e.items, names, scope, `${at}.items`),
          data: arg(e.data, e.fn, 2, 'data'),
        };
      case 'slice':
        variant('slice', 'a list');
        return {
          type: 'slice',
          items: root(e.items, names, scope, `${at}.items`),
          start: sub(e.start, 'Integer', 'start'),
          end: opt(e.end, 'Integer', 'end'),
        };
      case 'length':
        variant('length', 'a number');
        return { type: 'length', items: root(e.items, names, scope, `${at}.items`) };
      case 'at':
        variant('at');
        return {
          type: 'at',
          items: root(e.items, names, scope, `${at}.items`),
          index: sub(e.index, 'Integer', 'index'),
        };
    }
  }

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
    const only = (name: string) => fieldsOf(t, name)![0]!;
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
      case 'unary':
        return { math: o.op, args: [expr(o.a, key, names)] };
      case 'trig':
        return { math: o.op, args: [expr(o.a, 'Radians', names)] };
      case 'arc':
        return { math: o.op, args: [expr(o.a, 'number', names)] };
      case 'atan2':
        return { math: 'atan2', args: [expr(o.y, 'Coordinate', names), expr(o.x, 'Coordinate', names)] };
      case 'compare':
        return {
          compare: o.op,
          args: [expr(o.a, 'number', names), expr(o.b, 'number', names)],
          ...(o.slack != null && { slack: expr(o.slack, 'Tolerance', names) }),
        };
      case 'logic':
        return { logic: o.op, args: [expr(o.a, 'boolean', names), expr(o.b, 'boolean', names)] };
      case 'not':
        return { logic: 'not', args: [expr(o.a, 'boolean', names)] };
      case 'if':
        return { if: expr(o.if, 'boolean', names), then: expr(o.then, key, names), else: expr(o.else, key, names) };
      case 'white':
        return { random: 'white', seed: expr(o.seed, 'Integer', names), index: expr(o.index, 'Index', names) };
      case 'jittered':
        return {
          random: 'jittered',
          seed: expr(o.seed, 'Integer', names),
          index: expr(o.index, 'Index', names),
          count: expr(o.count, 'Index', names),
        };
      case 'smooth':
        return {
          random: 'smooth',
          seed: expr(o.seed, 'Integer', names),
          t: expr(o.t, 'Coordinate', names),
          ...(o.scale != null && { scale: expr(o.scale, 'Length', names) }),
        };
      case 'generate':
        return {
          list: 'generate',
          fn: at(names.fns, o.fn, 'function').name,
          count: expr(o.count, 'Index', names),
          ...(o.initial != null && { initial: anyOut(o.initial, names) }),
          ...(o.data != null && { data: anyOut(o.data, names) }),
        };
      case 'each':
        return {
          list: o.op,
          fn: at(names.fns, o.fn, 'function').name,
          items: anyOut(o.items, names),
          ...(o.data != null && { data: anyOut(o.data, names) }),
        };
      case 'slice':
        return {
          list: 'slice',
          items: anyOut(o.items, names),
          start: expr(o.start, 'Integer', names),
          ...(o.end != null && { end: expr(o.end, 'Integer', names) }),
        };
      case 'length':
        return { list: 'length', items: anyOut(o.items, names) };
      case 'at':
        return { list: 'at', items: anyOut(o.items, names), index: expr(o.index, 'Integer', names) };
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
    const fields = fieldsOf(t, o.type) ?? fail(`${o.type} cannot stand in a ${key}`);
    const op = operationById.get(o.type) ?? fail(`${o.type} is not a vec2 operation`);
    const args: Record<string, Expr> = {};
    let self: Expr | undefined;
    for (const f of fields) {
      const v = o[f.name];
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

// ---- input values alone: the View tab's part of a playground link ----

/** The characters a stored string input may hold. */
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const NUMBER_DEFINITIONS = new Set((dense.definitions as { name: string }[]).map((n) => n.name));

/** The field one input's value is packed in: a number in its type's range, a bit, text, or a class's own fields. */
function inputField(type: string, name: string): F {
  if (NUMBER_DEFINITIONS.has(type)) return { type: 'reference_numeric', name, ref: type };
  if (type === 'boolean') return { type: 'bool', name, defaultValue: false };
  if (type === 'string') return d.enumArray(name, d.enumeration('char', PRINTABLE), 0, 64);
  const ref = classJson[type] === undefined ? undefined : INDEX.get(classJson[type]!);
  if (ref === undefined || ref >= VALUE_TEMPLATES.length) fail(`An input of type ${type} cannot be stored`);
  return { type: 'reference', name, ref };
}

const valuesCache = new Map<string, d.DenseSchema>();
/**
 * The schema of the values of inputs of `types`, in that order. Names and types are not stored, nor a stamp:
 * whoever reads the values knows the inputs (a playground link's definition comes before them).
 */
export function createInputValuesSchema(types: readonly string[], options: NumericOptions = {}): d.DenseSchema {
  const key = JSON.stringify([types, options]);
  if (!valuesCache.has(key)) {
    // densing wants every template referenced; one always-empty optional value (1 bit) covers them all.
    const fields = [...types.map((type, i) => inputField(type, `v${i}`)), d.optional('_', VALUE as d.DenseField)];
    valuesCache.set(key, d.schemaFromJson({ definitions: ranges(options), templates: VALUE_TEMPLATES, fields }));
  }
  return valuesCache.get(key)!;
}

/** The values of `inputs` alone, numbers packed with `presets` (each number type's range for this payload). */
export function encodeInputValues(
  inputs: readonly Input[],
  presets: ActivePresets = {},
  options: NumericOptions = {},
): string {
  const schema = createInputValuesSchema(
    inputs.map((input) => input.type),
    options,
  );
  const walk = walker(schema, presets, false);
  const data: F = { $presets: presets, _: null };
  inputs.forEach((input, i) => {
    const field = schema.fields[i] as F;
    const value = input.value;
    if (field.type === 'reference') {
      if (!(value && typeof value === 'object' && 'value' in value)) fail(`${input.name}: expected a stored value`);
      data[field.name] = walk(field, (value as { value: unknown }).value);
    } else if (field.type === 'enum_array') data[field.name] = [...(value as string)];
    else if (field.type === 'reference_numeric' && !Number.isFinite(value))
      fail(`${input.name}: cannot store ${value}`);
    else data[field.name] = value;
  });
  return d.densing(schema, data);
}

/** The values written by `encodeInputValues` for inputs of `types`, in that order. */
export function decodeInputValues(text: string, types: readonly string[], options: NumericOptions = {}): Expr[] {
  const schema = createInputValuesSchema(types, options);
  const data = d.undensing(schema, text) as F;
  const walk = walker(schema, {}, true);
  return (schema.fields as F[]).slice(0, types.length).map((field) => {
    const value = data[field.name];
    if (field.type === 'reference') return { value: walk(field, value) };
    if (field.type === 'enum_array') return (value as string[]).join('');
    return value as Expr;
  });
}
