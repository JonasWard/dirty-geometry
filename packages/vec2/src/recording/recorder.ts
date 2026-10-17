/**
 * Records vec2 calls as a JSON definition without touching the vec2 classes.
 *
 *   const rec = createRecorder();
 *   const { Vec2, Line2 } = rec.lib;
 *   const width = rec.param('width', 3);
 *   const line = new Line2(new Vec2(0, 0), new Vec2(width, 1));
 *   rec.output('end', line.evaluate(line.length()));
 *   const definition = rec.definition(); // JSON-serialisable; replay with evaluateDefinition
 *
 * `rec.lib` mirrors the vec2 classes (and `rec.lib.helpers` the helper functions) through Proxies. Every
 * call is looked up in the generated schema, run on the real values, and its result is handed back
 * wrapped: objects as Proxies of the real object, numbers / strings as {@link Scalar}s. Calls the library
 * makes internally run on real values and are not recorded.
 */
import { defaultRegistry } from '../io/default-registry';
import type { ArgJson, Definition, NodeJson, ParamJson } from './definition';
import { isOperationNode } from './definition';
import { Scalar } from './scalar';
import {
  callOperation,
  classNameOf,
  describeValue,
  helpersByName,
  lookupOperation,
  operationOf,
  RecordingError,
  vec2Schema,
} from './runtime';
import { classes, helpers } from '../../schema/bindings';

export { RecordingError } from './runtime';

export type RecorderOptions = {
  /**
   * Throw when an operation that cannot be recorded (callbacks, generators, policy exclusions) is called.
   * By default it runs unrecorded and is listed in `rec.warnings`; its object results are then stored as
   * literal values.
   */
  strict?: boolean;
};

type ClassTable = typeof classes;
/** A node without its id (distributes over the node kinds). */
type NodeBody = NodeJson extends infer N ? (N extends NodeJson ? Omit<N, 'id'> : never) : never;
/** Helper functions by plain name (`convexHullLoop`), typed like the originals. */
type HelperFunctions = {
  readonly [K in keyof typeof helpers as K extends `${string}:${infer Name}` ? Name : never]: (typeof helpers)[K];
};

export type Recorder = {
  /** The vec2 classes and helpers, recording every call. */
  readonly lib: ClassTable & { readonly helpers: HelperFunctions };
  /** A named, editable input. Numbers and strings come back as {@link Scalar}s, vec2 objects as recorded objects. */
  param<T extends number | string | boolean | object>(name: string, value: T): T;
  /** Name a recorded value as an output of the definition. */
  output(name: string, value: unknown): void;
  /** The definition of the named outputs, pruned to the nodes they depend on. */
  definition(): Definition;
  /** Real value behind a recorded object or scalar. */
  unwrap<T>(value: T): T;
  /** Unrecorded calls made in non-strict mode. */
  readonly warnings: readonly string[];
};

export function createRecorder(options: RecorderOptions = {}): Recorder {
  const nodes: NodeJson[] = [];
  const params: Record<string, ParamJson> = {};
  const outputs: Record<string, string> = {};
  const warnings: string[] = [];
  /** Recorded wrapper (Proxy, array, result object) → its node and real value. */
  const recorded = new WeakMap<object, { node: string; real: unknown }>();
  /** Node → wrapper, so reading the same field or constant twice gives the same object. */
  const memo = new Map<string, unknown>();

  const nextId = () => `n${nodes.length}`;
  const addNode = (node: NodeBody): string => {
    const id = nextId();
    nodes.push({ id, ...node } as NodeJson);
    return id;
  };

  function provenance(value: unknown): { node: string; real: unknown } | null {
    if (value instanceof Scalar) return { node: value.node, real: value.value };
    if (typeof value === 'object' && value !== null) return recorded.get(value) ?? null;
    return null;
  }

  /** Argument → JSON form plus the real value to pass on. */
  function encode(value: unknown): { json: ArgJson; real: unknown } {
    const traced = provenance(value);
    if (traced) return { json: { ref: traced.node }, real: traced.real };
    if (value === undefined) return { json: { undefined: true }, real: undefined };
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
      return { json: { lit: value }, real: value };
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return { json: { lit: value }, real: value };
      return { json: { number: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' }, real: value };
    }
    if (Array.isArray(value)) {
      const items = value.map(encode);
      return { json: { array: items.map((item) => item.json) }, real: items.map((item) => item.real) };
    }
    if (typeof value === 'object') {
      const type = (value as { type?: unknown }).type;
      if (typeof type === 'string' && defaultRegistry.has(type) && typeof (value as any).toJson === 'function') {
        return { json: { value: (value as { toJson(): unknown }).toJson() }, real: value };
      }
      if (Object.getPrototypeOf(value) === Object.prototype) {
        const entries = Object.entries(value).map(([key, field]) => [key, encode(field)] as const);
        return {
          json: { object: Object.fromEntries(entries.map(([key, field]) => [key, field.json])) },
          real: Object.fromEntries(entries.map(([key, field]) => [key, field.real])),
        };
      }
    }
    throw new RecordingError(
      `Cannot record an argument of type ${describeValue(value).kind === 'unsupported' ? typeof value : describeValue(value).kind}`,
    );
  }

  /** Real result of `node` → what the caller gets back. */
  function wrap(real: unknown, node: string): unknown {
    if (memo.has(node)) return memo.get(node);
    let result: unknown = real;
    if (typeof real === 'number' || typeof real === 'string') {
      result = new Scalar(node, real);
    } else if (Array.isArray(real)) {
      const items = real.map((item, index) => wrap(item, addNode({ op: 'item', of: node, index })));
      recorded.set(items, { node, real });
      result = items;
    } else if (typeof real === 'object' && real !== null) {
      if (classNameOf(real)) {
        result = instanceProxy(real, node);
      } else if (Object.getPrototypeOf(real) === Object.prototype) {
        const fields = Object.fromEntries(
          Object.entries(real).map(([name, field]) => [name, wrap(field, addNode({ op: 'field', of: node, name }))]),
        );
        recorded.set(fields, { node, real });
        result = fields;
      }
    }
    memo.set(node, result);
    return result;
  }

  function invoke(id: string, self: unknown, args: readonly unknown[]): unknown {
    const found = lookupOperation(id);
    if (!found) throw new RecordingError(`${id} is not a vec2 operation`);
    const { op } = found;
    if (!op.recordable) {
      if (options.strict) throw new RecordingError(`${id} cannot be recorded: ${op.reason}`);
      warnings.push(`${id} ran unrecorded: ${op.reason}`);
      const real = callOperation(
        found.id,
        op,
        provenance(self)?.real ?? self,
        args.map((arg) => encode(arg).real),
      );
      return real;
    }

    const selfTrace = self === undefined ? null : provenance(self);
    if (self !== undefined && !selfTrace) throw new RecordingError(`${id} called on an unrecorded value`);
    const encoded = args.map(encode);
    const realResult = callOperation(
      found.id,
      op,
      selfTrace?.real,
      encoded.map((arg) => arg.real),
    );

    // Fields and constants are values: reading them twice gives the same node.
    const memoKey = op.kind === 'field' || op.kind === 'constant' ? `${found.id}@${selfTrace?.node ?? ''}` : null;
    if (memoKey && memo.has(memoKey)) return memo.get(memoKey);

    const node = addNode({
      op: found.id,
      ...(selfTrace ? { self: selfTrace.node } : {}),
      args: encoded.map((arg) => arg.json),
    });
    const result = wrap(realResult, node);
    if (memoKey) memo.set(memoKey, result);
    return result;
  }

  function instanceProxy(real: object, node: string): object {
    const owner = classNameOf(real)!;
    const proxy: object = new Proxy(real, {
      get(target, key) {
        if (typeof key !== 'string' || key === 'constructor' || key === 'type') return Reflect.get(target, key, target);
        const id = `${owner}#${key}`;
        const op = operationOf(id);
        if (!op) {
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        if (op.kind === 'field') return invoke(id, proxy, []);
        return (...args: unknown[]) => invoke(id, proxy, args);
      },
      set() {
        throw new RecordingError(`Recorded ${owner} values are immutable`);
      },
    });
    recorded.set(proxy, { node, real });
    return proxy;
  }

  function classFacade(name: string, cls: any): unknown {
    return new Proxy(cls, {
      construct(_target, args) {
        return invoke(`${name}.new`, undefined, args) as object;
      },
      get(target, key) {
        if (typeof key !== 'string' || key === 'prototype' || key === 'type' || key === 'name') {
          return Reflect.get(target, key, target);
        }
        const id = `${name}.${key}`;
        const op = operationOf(id);
        if (!op) return Reflect.get(target, key, target);
        if (op.kind === 'constant') return invoke(id, undefined, []);
        return (...args: unknown[]) => invoke(id, undefined, args);
      },
    });
  }

  const helperFacade = Object.fromEntries(
    Object.entries(helpersByName).map(([name, id]) => [name, (...args: unknown[]) => invoke(id, undefined, args)]),
  );
  const lib = Object.freeze({
    ...Object.fromEntries(Object.entries(classes).map(([name, cls]) => [name, classFacade(name, cls)])),
    helpers: Object.freeze(helperFacade) as unknown as HelperFunctions,
  }) as unknown as Recorder['lib'];

  return {
    lib,
    warnings,
    param(name, value) {
      if (params[name]) throw new RecordingError(`Param ${name} already exists`);
      const type = describeValue(value);
      if (type.kind === 'unsupported' || type.kind === 'null') {
        throw new RecordingError(`Param ${name} must be a number, string, boolean or vec2 value`);
      }
      const node = addNode({ op: 'param', name });
      params[name] = { node, type, value: encode(value).json };
      if (typeof value === 'boolean') {
        const scalar = new Scalar(node, value);
        memo.set(node, scalar);
        return scalar as unknown as typeof value;
      }
      return wrap(provenance(value)?.real ?? value, node) as typeof value;
    },
    output(name, value) {
      const traced = provenance(value);
      if (!traced) throw new RecordingError(`Output ${name} is not a recorded value`);
      outputs[name] = traced.node;
    },
    definition() {
      return pruneDefinition({
        format: 'vec2-definition',
        version: 1,
        schema: vec2Schema.hash,
        params,
        nodes,
        outputs,
      });
    },
    unwrap<T>(value: T): T {
      return (provenance(value)?.real ?? value) as T;
    },
  };
}

/** Keep only the nodes the outputs depend on (and every param, so inputs stay editable). */
export function pruneDefinition(definition: Definition): Definition {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const keep = new Set<string>(Object.values(definition.params).map((param) => param.node));
  const visit = (id: string) => {
    if (keep.has(id)) return;
    keep.add(id);
    const node = byId.get(id);
    if (!node) return;
    if (isOperationNode(node)) {
      if (node.self) visit(node.self);
      node.args.forEach(visitArg);
    } else if (node.op === 'item' || node.op === 'field') {
      visit(node.of);
    }
  };
  const visitArg = (arg: ArgJson): void => {
    if ('ref' in arg) visit(arg.ref);
    else if ('array' in arg) arg.array.forEach(visitArg);
    else if ('object' in arg) Object.values(arg.object).forEach(visitArg);
  };
  Object.values(definition.outputs).forEach(visit);
  return {
    ...definition,
    params: { ...definition.params },
    nodes: definition.nodes.filter((node) => keep.has(node.id)),
    outputs: { ...definition.outputs },
  };
}
