/** Records vec2 calls as a version 3 definition by reflection: `rec.lib` mirrors the classes and helpers through Proxies,
 * so every call and field read runs on the real value and becomes a node. Results come back wrapped. */
import type { classes, helpers } from '../../schema/bindings';
import { SKIP_MEMBERS } from '../../schema/policy';
import { fail } from './definition';
import type { ArgV3 as Arg, DefinitionV3 as Definition, NodeV3 as Node, SourceV3 as Source } from './v3';
import { classNameOf, classTable, helperTable, isPlain, mapValues, typeOf } from './runtime';
import { Scalar } from './scalar';

/** `strict`: throw on calls that cannot be recorded (callbacks, `toJson`, no or unsupported result). */
export type RecorderOptions = { strict?: boolean };
export type Recorder = ReturnType<typeof createRecorder>;

/** A vec2 member: not private, `constructor` or `type`, and not inherited from Object or Function. */
const isMember = (target: object, key: string | symbol): key is string =>
  typeof key === 'string' &&
  !/^(_|constructor$|type$)/.test(key) &&
  !(typeof target === 'function' && /^(prototype|name|length)$/.test(key)) &&
  key in target &&
  Reflect.get(target, key) !== Reflect.get(typeof target === 'function' ? Function.prototype : Object.prototype, key);

export function createRecorder(options: RecorderOptions = {}) {
  const nodes: Node[] = [];
  const params: Definition['params'] = {};
  const outputs: Definition['outputs'] = {};
  const warnings: string[] = [];
  const traced = new WeakMap<object, { source: Source; real: unknown }>();
  const memo = new Map<string, unknown>();
  const add = (node: object) => (nodes.push({ id: `n${nodes.length}`, ...node } as Node), `n${nodes.length - 1}`);
  const trace = (value: unknown) =>
    value instanceof Scalar ? { source: value.node, real: value.value } : traced.get(Object(value));
  const real = (v: unknown): unknown =>
    trace(v)?.real ?? (Array.isArray(v) ? v.map(real) : isPlain(v) ? mapValues(v, real) : v);

  function encode(value: unknown): Arg {
    const t = trace(value);
    if (t) return typeof t.source === 'string' ? { ref: t.source } : t.source;
    if (value === undefined) return { omit: true };
    if (typeof value === 'number' && !Number.isFinite(value)) return { number: `${value}` as 'NaN' };
    if (value === null || typeof value !== 'object') return value as Arg;
    if (classNameOf(value)) return { value: (value as { toJson(): unknown }).toJson() };
    if (Array.isArray(value)) return value.map(encode);
    return isPlain(value) ? { object: mapValues(value, encode) } : fail('Cannot record a non-plain object argument');
  }

  function wrap(value: unknown, source: Source): unknown {
    const id = typeof source === 'string' ? source : '';
    let result = value;
    if (['number', 'string'].includes(typeof value) || (typeof value === 'boolean' && !id)) {
      result = new Scalar(source, value as number);
    } else if (Array.isArray(value) && id) {
      result = value.map((item, index) => wrap(item, add({ op: 'result.item', of: id, index })));
    } else if (isPlain(value) && id) {
      result = mapValues(value, (field, name) => wrap(field, add({ op: 'result.field', of: id, name })));
    } else if (classNameOf(value)) result = reflect(value, classNameOf(value)!, true);
    if (typeof result === 'object' && result) traced.set(result, { source, real: value });
    return result;
  }

  /** A Proxy recording a class's statics and `new`, a helper's calls, or (`instance`) a recorded value's members. */
  function reflect(target: any, owner: string, instance: boolean): object {
    const proxy: object = new Proxy(target, {
      construct: (_, args) => invoke(`${owner}.new`, undefined, (a) => new target(...a), args) as object,
      apply: (_, __, args) => invoke(owner, undefined, (a) => target(...a), args),
      get(_, key) {
        const member = Reflect.get(target, key, target);
        const self = instance ? proxy : undefined;
        if (!isMember(target, key)) return typeof member === 'function' ? member.bind(target) : member;
        // A static value (`Epsilon.preferIn`) is a constant, not an operation: it is used as it is.
        if (typeof member !== 'function')
          return instance ? invoke(`${owner}.${key}`, self, () => member, null) : member;
        return (...args: unknown[]) => invoke(`${owner}.${key}`, self, (a) => member.apply(target, a), args);
      },
      set: () => fail(`Recorded ${owner} values are immutable`),
    });
    return proxy;
  }

  function invoke(op: string, self: object | undefined, run: (args: unknown[]) => unknown, args: unknown[] | null) {
    const unrecorded = (reason: string, result: unknown) => {
      if (options.strict) fail(`${op} cannot be recorded (${reason})`);
      warnings.push(`${op} ran unrecorded (${reason})`);
      return result;
    };
    if (SKIP_MEMBERS.has(op.split('.').at(-1)!)) return unrecorded('serialisation', run((args ?? []).map(real)));
    if (args?.some((a) => typeof a === 'function')) return unrecorded('callback', run(args.map(real)));
    const from = self && trace(self)!.source;
    const memoKey = args ? '' : `${op}@${JSON.stringify(from)}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    const result = run((args ?? []).map(real));
    if (result === undefined) return unrecorded('no result', result);
    if (Object(result) === result && !Array.isArray(result) && !isPlain(result) && !classNameOf(result))
      return unrecorded('unsupported result', result);
    const json = (args ?? []).map(encode);
    while (json.length && JSON.stringify(json.at(-1)) === '{"omit":true}') json.pop();
    const wrapped = wrap(result, add({ op, ...(from && { self: from }), ...(json.length && { args: json }) }));
    if (memoKey) memo.set(memoKey, wrapped);
    return wrapped;
  }

  const lib = mapValues(classTable, (cls, name) => reflect(cls, name, false));
  lib.helpers = mapValues(helperTable, (fn, name) => reflect(fn, `helpers.${name}`, false));
  return {
    lib: Object.freeze(lib) as unknown as typeof classes & { readonly helpers: typeof helpers },
    warnings: warnings as readonly string[],
    /** A named, editable input; numbers, strings and booleans come back as {@link Scalar}s. */
    param<T extends number | string | boolean | object>(name: string, value: T): T {
      const type = typeOf(real(value));
      if (params[name]) fail(`Param ${name} already exists`);
      if (!type || type === 'object') fail(`Param ${name} must be a number, string, boolean or vec2 value`);
      params[name] = { type: type!, value: encode(value) };
      return wrap(real(value), { param: name }) as T;
    },
    output(name: string, value: unknown) {
      outputs[name] = trace(value)?.source ?? fail(`Output ${name} is not a recorded value`);
    },
    /** The definition of the outputs, pruned to the nodes they use (all params are kept). */
    definition: (): Definition =>
      pruneDefinition({ format: 'vec2-definition', version: 3, params: { ...params }, nodes, outputs: { ...outputs } }),
    /** The real value behind a recorded one. */
    unwrap: <T>(value: T) => real(value) as T,
  };
}

/** Keep the nodes the outputs depend on (nodes are in recording order, so one backwards pass). */
export function pruneDefinition(definition: Definition): Definition {
  const keep = new Set(Object.values(definition.outputs).filter((s) => typeof s === 'string'));
  for (const node of [...definition.nodes].reverse()) {
    if (!keep.has(node.id)) continue;
    const uses = JSON.stringify(['of' in node ? { ref: node.of } : { ref: node.self }, 'args' in node && node.args]);
    for (const [, id] of uses.matchAll(/"ref":"([^"]+)"/g)) keep.add(id!);
  }
  return { ...definition, nodes: definition.nodes.filter((node) => keep.has(node.id)) };
}
