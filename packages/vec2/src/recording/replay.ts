/** Replays a recorded definition: runs every node on real values, with optional param overrides. */
import type { CodecRegistry } from '../io/codec';
import { defaultRegistry } from '../io/default-registry';
import type { ArgJson, Definition } from './definition';
import { isOperationNode } from './definition';
import { policy } from '../../schema/policy';
import { callOperation, lookupOperation, matchesType, RecordingError, schema } from './runtime';

export type EvaluateOptions = {
  /** New values for named params; each must match the param's recorded type. */
  params?: Readonly<Record<string, unknown>>;
  /** Decodes vec2 values stored in the definition; defaults to the full vec2 registry. */
  registry?: CodecRegistry;
  /** Renamed operations, old id → current id; defaults to `policy.aliases` in schema/policy.ts. */
  aliases?: Readonly<Record<string, string>>;
  /**
   * Stop at the first node that fails instead of throwing, and return the values computed so far with the
   * failure in `error` (outputs that were not reached are left out). For editors that show partial results.
   */
  partial?: boolean;
};

export type EvaluateResult = {
  outputs: Record<string, unknown>;
  /** The value of every node by id. */
  values: Map<string, unknown>;
  /** With `partial`: the first node that failed. */
  error?: { node: string; message: string };
};

export class DefinitionError extends RecordingError {
  override name = 'DefinitionError';
}

/**
 * Problems that stop `definition` from replaying against the current schema: operations that no longer
 * exist (and have no alias in schema/policy.ts), that cannot be recorded any more, or that now take
 * fewer arguments than were recorded. Empty when the definition was recorded against this schema.
 */
export function checkDefinition(
  definition: Definition,
  aliases: Readonly<Record<string, string>> = policy.aliases,
): string[] {
  if (definition.format !== 'vec2-definition' || definition.version !== 1) {
    return [`Unsupported definition format ${String(definition.format)} v${String(definition.version)}`];
  }
  if (definition.schema === schema.hash) return [];
  const problems: string[] = [];
  for (const node of definition.nodes) {
    if (!isOperationNode(node)) continue;
    const found = lookupOperation(node.op, aliases);
    if (!found) {
      problems.push(`${node.id}: ${node.op} no longer exists`);
    } else if (!found.op.recordable) {
      problems.push(`${node.id}: ${node.op} can no longer be recorded (${found.op.reason})`);
    } else if (!found.op.params.some((param) => param.rest) && node.args.length > found.op.params.length) {
      problems.push(`${node.id}: ${node.op} takes ${found.op.params.length} arguments, ${node.args.length} recorded`);
    }
  }
  return problems;
}

export function evaluateDefinition(definition: Definition, options: EvaluateOptions = {}): EvaluateResult {
  const aliases = options.aliases ?? policy.aliases;
  const problems = checkDefinition(definition, aliases);
  if (problems.length > 0)
    throw new DefinitionError(`Definition does not match the vec2 schema:\n${problems.join('\n')}`);

  const registry = options.registry ?? defaultRegistry;
  const overrides = options.params ?? {};
  for (const [name, value] of Object.entries(overrides)) {
    const param = definition.params[name];
    if (!param) throw new DefinitionError(`Unknown param ${name}`);
    if (!matchesType(value, param.type)) {
      throw new DefinitionError(`Param ${name} expects ${JSON.stringify(param.type)}, got ${String(value)}`);
    }
  }
  const paramByNode = new Map(Object.entries(definition.params).map(([name, param]) => [param.node, name]));

  const values = new Map<string, unknown>();
  const valueOf = (id: string): unknown => {
    if (!values.has(id)) throw new DefinitionError(`Node ${id} is used before it is defined`);
    return values.get(id);
  };
  const decode = (arg: ArgJson): unknown => {
    if ('lit' in arg) return arg.lit;
    if ('number' in arg) return Number(arg.number);
    if ('undefined' in arg) return undefined;
    if ('ref' in arg) return valueOf(arg.ref);
    if ('value' in arg) return registry.decode(arg.value);
    if ('array' in arg) return arg.array.map(decode);
    return Object.fromEntries(Object.entries(arg.object).map(([key, field]) => [key, decode(field)]));
  };

  const run = (node: Definition['nodes'][number]) => {
    if (node.op === 'param' && 'name' in node && !('of' in node)) {
      const name = paramByNode.get(node.id) ?? node.name;
      const param = definition.params[name];
      if (!param) throw new DefinitionError(`Param node ${node.id} has no entry in params`);
      values.set(node.id, name in overrides ? overrides[name] : decode(param.value));
    } else if (node.op === 'item' && 'index' in node) {
      values.set(node.id, (valueOf(node.of) as unknown[])[node.index]);
    } else if (node.op === 'field' && 'of' in node && 'name' in node) {
      values.set(node.id, (valueOf(node.of) as Record<string, unknown>)[node.name]);
    } else if (isOperationNode(node)) {
      const found = lookupOperation(node.op, aliases)!;
      const self = node.self === undefined ? undefined : valueOf(node.self);
      values.set(node.id, callOperation(found.id, found.op, self, node.args.map(decode)));
    }
  };

  let error: EvaluateResult['error'];
  for (const node of definition.nodes) {
    if (!options.partial) {
      run(node);
      continue;
    }
    try {
      run(node);
    } catch (failure) {
      error = { node: node.id, message: failure instanceof Error ? failure.message : String(failure) };
      break;
    }
  }

  const outputs = Object.fromEntries(
    Object.entries(definition.outputs)
      .filter(([, id]) => !options.partial || values.has(id))
      .map(([name, id]) => [name, valueOf(id)]),
  );
  return error ? { outputs, values, error } : { outputs, values };
}
