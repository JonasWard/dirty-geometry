/** Replays a recorded definition by name: every node runs on real values, with optional param overrides. */
import { defaultRegistry } from '../io/default-registry';
import type { Arg, Definition, Node, Source } from './definition';
import { DefinitionError, fail as raise } from './definition';
import { classTable, helperTable, mapValues, typeOf } from './runtime';

/** `params`: new values by name (same type as recorded); `partial`: stop at the first failure and report it. */
export type EvaluateOptions = { params?: Readonly<Record<string, unknown>>; partial?: boolean };
export type EvaluateResult = { outputs: Record<string, unknown>; values: Map<string, unknown>; error?: Failure };
type Failure = { node: string; message: string };
const fail = (message: string) => raise(message, DefinitionError);

export function evaluateDefinition(definition: Definition, options: EvaluateOptions = {}): EvaluateResult {
  if (definition.version !== 2) fail(`Unsupported definition version ${definition.version}; re-record it`);
  const params = options.params ?? {};
  for (const [name, value] of Object.entries(params)) {
    const type = definition.params[name]?.type ?? fail(`Unknown param ${name}`);
    if (typeOf(value) !== type) fail(`Param ${name} expects ${type}, got ${String(value)}`);
  }
  const values = new Map<string, unknown>();
  const source = (s: Source): unknown => {
    if (typeof s === 'string') return values.has(s) ? values.get(s) : fail(`Node ${s} is used before it is defined`);
    if (s.param in params) return params[s.param];
    return read((definition.params[s.param] ?? fail(`Unknown param ${s.param}`)).value);
  };
  const read = (arg: Arg): unknown => {
    if (arg === null || typeof arg !== 'object') return arg;
    if (Array.isArray(arg)) return arg.map(read);
    if ('ref' in arg || 'param' in arg) return source('ref' in arg ? arg.ref : arg);
    if ('object' in arg) return mapValues(arg.object, read);
    return 'value' in arg ? defaultRegistry.decode(arg.value) : 'number' in arg ? Number(arg.number) : undefined;
  };
  const run = (node: Node): unknown => {
    if ('of' in node) return (source(node.of) as any)['index' in node ? node.index : node.name];
    const args = (node.args ?? []).map(read);
    const [owner, member] = node.op.includes('.') ? node.op.split('.') : [undefined, node.op];
    const target: any = !owner ? helperTable : node.self !== undefined ? source(node.self) : classTable[owner];
    if (member === 'new' && node.self === undefined && target) return new target(...args);
    if (Object(target) !== target || !(member! in target)) fail(`${node.op} does not exist in vec2`);
    return typeof target[member!] === 'function' ? target[member!](...args) : target[member!];
  };

  let error: Failure | undefined;
  for (const node of definition.nodes) {
    try {
      values.set(node.id, run(node));
    } catch (failure) {
      if (!options.partial) throw failure;
      error = { node: node.id, message: failure instanceof Error ? failure.message : String(failure) };
      break;
    }
  }
  const reached = Object.entries(definition.outputs).filter(([, s]) => typeof s !== 'string' || values.has(s));
  return {
    outputs: Object.fromEntries(reached.map(([name, s]) => [name, source(s)])),
    values,
    ...(error && { error }),
  };
}
