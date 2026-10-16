/** Pure edits of a recorded definition, used by the playground's builder. Every function returns a new definition. */
import type { ArgJson, Definition, NodeJson, ParamJson } from '@dirty-geometry/vec2/recording/definition';
import type { OperationSchema, TypeRef } from '@dirty-geometry/vec2/schema/types';
import { matchesType } from '@dirty-geometry/vec2/recording/runtime';
import { vec2Schema } from '@dirty-geometry/vec2-dense/definition-schema';
import { numericRole } from '@dirty-geometry/vec2-dense/roles';
import { defaultLiteral } from './defaults';

export type OperationNode = Extract<NodeJson, { args: ArgJson[] }>;
export const isOperationNode = (node: NodeJson): node is OperationNode => 'args' in node;

export const operationOf = (id: string): OperationSchema | undefined => vec2Schema.operations[id];

export const needsSelf = (op: OperationSchema) => op.kind === 'method' || op.kind === 'field';

export function emptyDefinition(): Definition {
  return { format: 'vec2-definition', version: 1, schema: vec2Schema.hash, params: {}, nodes: [], outputs: {} };
}

/** A fresh node id (`n<k>`) not used in `definition`. */
export function nextNodeId(definition: Definition): string {
  let max = -1;
  for (const node of definition.nodes) {
    const match = /^n(\d+)$/.exec(node.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `n${max + 1}`;
}

/** The latest node before `before` whose value fits `type` (needs evaluated `values`). */
function latestMatching(
  definition: Definition,
  type: TypeRef,
  values: ReadonlyMap<string, unknown>,
  before = definition.nodes.length,
): string | undefined {
  for (let i = Math.min(before, definition.nodes.length) - 1; i >= 0; i--) {
    const node = definition.nodes[i]!;
    if (values.has(node.id) && matchesType(values.get(node.id), type)) return node.id;
  }
  return undefined;
}

/** Default operands for `op`: the latest fitting node for vec2 values, otherwise a default literal. */
function defaultArgs(
  definition: Definition,
  id: string,
  op: OperationSchema,
  values: ReadonlyMap<string, unknown>,
  position: number,
): ArgJson[] {
  const args: ArgJson[] = [];
  for (const param of op.params) {
    if (param.rest) break;
    // Optional numbers (`new Vec2(x?, y?)`) start as literals; other optional operands (options, epsilons) stay omitted.
    if (param.optional && param.type.kind !== 'number') break;
    const ref = param.type.kind === 'class' ? latestMatching(definition, param.type, values, position) : undefined;
    args.push(ref ? { ref } : (defaultLiteral(param.type, numericRole(id, param.name)) ?? { undefined: true }));
  }
  return args;
}

function defaultSelf(
  definition: Definition,
  op: OperationSchema,
  values: ReadonlyMap<string, unknown>,
  position: number,
) {
  return needsSelf(op) ? latestMatching(definition, { kind: 'class', type: op.owner! }, values, position) : undefined;
}

/** Append a node running `opId`, with default operands. */
export function addNode(
  definition: Definition,
  opId: string,
  values: ReadonlyMap<string, unknown> = new Map(),
): Definition {
  const op = operationOf(opId);
  if (!op?.recordable) throw new Error(`${opId} is not a recordable operation`);
  const position = definition.nodes.length;
  const self = defaultSelf(definition, op, values, position);
  const node: OperationNode = {
    id: nextNodeId(definition),
    op: opId,
    ...(needsSelf(op) ? { self: self ?? '' } : {}),
    args: defaultArgs(definition, opId, op, values, position),
  };
  return { ...definition, nodes: [...definition.nodes, node] };
}

/** Switch a node to another operation; operands are reset to defaults. */
export function replaceOperation(
  definition: Definition,
  nodeId: string,
  opId: string,
  values: ReadonlyMap<string, unknown> = new Map(),
): Definition {
  const op = operationOf(opId);
  if (!op?.recordable) throw new Error(`${opId} is not a recordable operation`);
  const position = definition.nodes.findIndex((node) => node.id === nodeId);
  return mapNode(definition, nodeId, (node) => {
    const self = defaultSelf(definition, op, values, position) ?? (isOperationNode(node) ? node.self : undefined);
    return {
      id: node.id,
      op: opId,
      ...(needsSelf(op) ? { self: self ?? '' } : {}),
      args: defaultArgs(definition, opId, op, values, position),
    };
  });
}

function mapNode(definition: Definition, nodeId: string, update: (node: NodeJson) => NodeJson): Definition {
  return { ...definition, nodes: definition.nodes.map((node) => (node.id === nodeId ? update(node) : node)) };
}

/** Set operand `index` (rest parameters continue past the last declared parameter). */
export function setArg(definition: Definition, nodeId: string, index: number, arg: ArgJson): Definition {
  return mapNode(definition, nodeId, (node) => {
    if (!isOperationNode(node)) return node;
    const args = [...node.args];
    while (args.length < index) args.push({ undefined: true });
    args[index] = arg;
    while (args.length > 0 && 'undefined' in args[args.length - 1]!) args.pop();
    return { ...node, args };
  });
}

/** Remove operand `index` (for rest parameters). */
export function removeArg(definition: Definition, nodeId: string, index: number): Definition {
  return mapNode(definition, nodeId, (node) =>
    isOperationNode(node) ? { ...node, args: node.args.filter((_, i) => i !== index) } : node,
  );
}

export function setSelf(definition: Definition, nodeId: string, self: string): Definition {
  return mapNode(definition, nodeId, (node) => (isOperationNode(node) ? { ...node, self } : node));
}

/** Remove a node; outputs pointing at it go too, references to it are left for validation to flag. */
export function removeNode(definition: Definition, nodeId: string): Definition {
  const params = Object.fromEntries(Object.entries(definition.params).filter(([, param]) => param.node !== nodeId));
  const outputs = Object.fromEntries(Object.entries(definition.outputs).filter(([, node]) => node !== nodeId));
  return { ...definition, params, outputs, nodes: definition.nodes.filter((node) => node.id !== nodeId) };
}

/** Move a node up (-1) or down (+1). */
export function moveNode(definition: Definition, nodeId: string, delta: -1 | 1): Definition {
  const index = definition.nodes.findIndex((node) => node.id === nodeId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= definition.nodes.length) return definition;
  const nodes = [...definition.nodes];
  [nodes[index], nodes[target]] = [nodes[target]!, nodes[index]!];
  return { ...definition, nodes };
}

/** Add a named param before the first operation node, so every node can use it. */
export function addParam(definition: Definition, name: string, value: ArgJson, type: TypeRef): Definition {
  if (!/^[A-Za-z_$][\w$-]*$/.test(name))
    throw new Error('Param names start with a letter and use letters, digits, _ and $');
  if (definition.params[name]) throw new Error(`Param ${name} already exists`);
  const id = nextNodeId(definition);
  const firstOperation = definition.nodes.findIndex((node) => node.op !== 'param');
  const insertAt = firstOperation < 0 ? definition.nodes.length : firstOperation;
  const nodes = [...definition.nodes];
  nodes.splice(insertAt, 0, { id, op: 'param', name });
  const param: ParamJson = { node: id, type, value };
  return { ...definition, nodes, params: { ...definition.params, [name]: param } };
}

export function setParamValue(definition: Definition, name: string, value: ArgJson): Definition {
  const param = definition.params[name];
  if (!param) return definition;
  return { ...definition, params: { ...definition.params, [name]: { ...param, value } } };
}

/** Name a node as an output, or (with `null`) stop outputting it. */
export function setOutput(definition: Definition, nodeId: string, name: string | null): Definition {
  const outputs = Object.fromEntries(Object.entries(definition.outputs).filter(([, node]) => node !== nodeId));
  if (name) outputs[name] = nodeId;
  return { ...definition, outputs };
}

const refsOf = (arg: ArgJson): string[] =>
  'ref' in arg
    ? [arg.ref]
    : 'array' in arg
      ? arg.array.flatMap(refsOf)
      : 'object' in arg
        ? Object.values(arg.object).flatMap(refsOf)
        : [];

/** Structural problems per node id: unknown or later references, missing self or required operands. */
export function validateDefinition(definition: Definition): Map<string, string[]> {
  const issues = new Map<string, string[]>();
  const add = (id: string, message: string) => issues.set(id, [...(issues.get(id) ?? []), message]);
  const seen = new Set<string>();
  const known = new Set(definition.nodes.map((node) => node.id));
  for (const node of definition.nodes) {
    const check = (ref: string, what: string) => {
      if (!known.has(ref)) add(node.id, `${what} refers to a removed node`);
      else if (!seen.has(ref)) add(node.id, `${what} refers to a later node (move this node down)`);
    };
    if (isOperationNode(node)) {
      const op = operationOf(node.op);
      if (!op) add(node.id, `${node.op} is not a vec2 operation`);
      else {
        if (needsSelf(op)) {
          if (!node.self) add(node.id, `pick the ${op.owner} to call ${op.member} on`);
          else check(node.self, 'self');
        }
        op.params.forEach((param, i) => {
          const arg = node.args[i];
          if (!param.optional && !param.rest && (!arg || 'undefined' in arg)) add(node.id, `${param.name} is required`);
        });
      }
      node.args.flatMap(refsOf).forEach((ref) => check(ref, 'an operand'));
    } else if ('of' in node) {
      check(node.of, 'source');
    }
    seen.add(node.id);
  }
  return issues;
}
