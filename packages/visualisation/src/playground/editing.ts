/** Pure edits of a recorded definition, used by the playground's builder. Every function returns a new definition. */
import type { Arg, CallNode, Definition, Node, Source } from '@dirty-geometry/vec2/recording/definition';
import { classNameOf } from '@dirty-geometry/vec2/recording/runtime';
import {
  isOptional,
  isRest,
  operations,
  slotType,
  type Operation,
  type Type,
} from '@dirty-geometry/vec2/schema/schema';
import { defaultLiteral } from './defaults';

export const isCallNode = (node: Node): node is CallNode => !('of' in node);

/** A select key per operation: a static and an instance member may share an id (`Polygon2.signedArea`). */
export const keyOf = (op: Operation) => `${op.id}${op.static ? '' : '()'}`;
export const operationByKey = (key: string) => operations.find((op) => keyOf(op) === key);
/** The schema entry a call node runs: the instance member when it has a `self`. */
export const operationOf = (node: CallNode) =>
  operations.find((op) => op.id === node.op && op.static === (node.self === undefined));
export const ownerOf = (op: Operation) => op.id.split('.')[0]!;
/** A select value for a source: a node id, or `param:<name>`. */
export const sourceKey = (source: Source | undefined) =>
  typeof source === 'object' ? `param:${source.param}` : (source ?? '');
export const sourceOf = (key: string): Source => (key.startsWith('param:') ? { param: key.slice(6) } : key);
export const argOf = (key: string): Arg => (key.startsWith('param:') ? { param: key.slice(6) } : { ref: key });

export function emptyDefinition(): Definition {
  return { format: 'vec2-definition', version: 3, params: {}, nodes: [], outputs: {} };
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

/** The latest node before `before` whose value is an instance of class `type` (needs evaluated `values`). */
function latestMatching(
  definition: Definition,
  type: Type,
  values: ReadonlyMap<string, unknown>,
  before = definition.nodes.length,
): string | undefined {
  for (let i = Math.min(before, definition.nodes.length) - 1; i >= 0; i--) {
    const node = definition.nodes[i]!;
    if (values.has(node.id) && classNameOf(values.get(node.id)) === type) return node.id;
  }
  return undefined;
}

/** Default operands: the latest fitting node for vec2 values, otherwise a default literal. */
function defaultArgs(definition: Definition, op: Operation, values: ReadonlyMap<string, unknown>, position: number) {
  const args: Arg[] = [];
  for (const [, slot] of op.params) {
    const type = slotType(slot);
    if (isRest(slot)) break;
    // Optional numbers (`new Vec2(x?, y?)`) start as literals; other optional operands stay omitted.
    if (isOptional(slot) && typeof defaultLiteral(type) !== 'number') break;
    const ref = latestMatching(definition, type, values, position);
    args.push(ref ? { ref } : (defaultLiteral(type) ?? { omit: true }));
  }
  return args;
}

function callNode(
  definition: Definition,
  id: string,
  op: Operation,
  values: ReadonlyMap<string, unknown>,
  position: number,
  self?: Source,
): CallNode {
  const args = defaultArgs(definition, op, values, position);
  if (op.static) return { id, op: op.id, ...(args.length ? { args } : {}) };
  return { id, op: op.id, self: latestMatching(definition, ownerOf(op), values, position) ?? self ?? '', args };
}

/** Append a node running the operation with select key `key`, with default operands. */
export function addNode(definition: Definition, key: string, values: ReadonlyMap<string, unknown> = new Map()) {
  const op = operationByKey(key) ?? fail(`${key} is not a recordable operation`);
  const node = callNode(definition, nextNodeId(definition), op, values, definition.nodes.length);
  return { ...definition, nodes: [...definition.nodes, node] };
}

/** Switch a node to another operation; operands are reset to defaults. */
export function replaceOperation(
  definition: Definition,
  nodeId: string,
  key: string,
  values: ReadonlyMap<string, unknown> = new Map(),
): Definition {
  const op = operationByKey(key) ?? fail(`${key} is not a recordable operation`);
  const position = definition.nodes.findIndex((node) => node.id === nodeId);
  return mapNode(definition, nodeId, (node) =>
    callNode(definition, node.id, op, values, position, isCallNode(node) ? node.self : undefined),
  );
}

const fail = (message: string): never => {
  throw new Error(message);
};

function mapNode(definition: Definition, nodeId: string, update: (node: Node) => Node): Definition {
  return { ...definition, nodes: definition.nodes.map((node) => (node.id === nodeId ? update(node) : node)) };
}

const isOmit = (arg: Arg | undefined) =>
  arg === undefined || (typeof arg === 'object' && arg !== null && 'omit' in arg);

/** Set operand `index` (rest parameters continue past the last declared parameter). */
export function setArg(definition: Definition, nodeId: string, index: number, arg: Arg): Definition {
  return mapNode(definition, nodeId, (node) => {
    if (!isCallNode(node)) return node;
    const args = [...(node.args ?? [])];
    while (args.length < index) args.push({ omit: true });
    args[index] = arg;
    while (args.length > 0 && isOmit(args[args.length - 1])) args.pop();
    return { ...node, args };
  });
}

/** Remove operand `index` (for rest parameters). */
export function removeArg(definition: Definition, nodeId: string, index: number): Definition {
  return mapNode(definition, nodeId, (node) =>
    isCallNode(node) ? { ...node, args: (node.args ?? []).filter((_, i) => i !== index) } : node,
  );
}

export function setSelf(definition: Definition, nodeId: string, self: Source): Definition {
  return mapNode(definition, nodeId, (node) => (isCallNode(node) ? { ...node, self } : node));
}

/** Remove a node; outputs pointing at it go too, references to it are left for validation to flag. */
export function removeNode(definition: Definition, nodeId: string): Definition {
  const outputs = Object.fromEntries(Object.entries(definition.outputs).filter(([, node]) => node !== nodeId));
  return { ...definition, outputs, nodes: definition.nodes.filter((node) => node.id !== nodeId) };
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

/** Add a named param (`type`: number, string, boolean or a class name); every node can use it. */
export function addParam(definition: Definition, name: string, value: Arg, type: string): Definition {
  if (!/^[A-Za-z_$][\w$-]*$/.test(name))
    throw new Error('Param names start with a letter and use letters, digits, _ and $');
  if (definition.params[name]) throw new Error(`Param ${name} already exists`);
  return { ...definition, params: { ...definition.params, [name]: { type, value } } };
}

export function setParamValue(definition: Definition, name: string, value: Arg): Definition {
  const param = definition.params[name];
  if (!param) return definition;
  return { ...definition, params: { ...definition.params, [name]: { ...param, value } } };
}

/** Remove a param; operands that use it are left for validation to flag. */
export function removeParam(definition: Definition, name: string): Definition {
  const { [name]: _, ...params } = definition.params;
  return { ...definition, params };
}

/** Name a node as an output, or (with `null`) stop outputting it. */
export function setOutput(definition: Definition, nodeId: string, name: string | null): Definition {
  const outputs = Object.fromEntries(Object.entries(definition.outputs).filter(([, node]) => node !== nodeId));
  if (name) outputs[name] = nodeId;
  return { ...definition, outputs };
}

const sourcesOf = (arg: Arg): Source[] =>
  Array.isArray(arg)
    ? arg.flatMap(sourcesOf)
    : arg && typeof arg === 'object' && 'ref' in arg
      ? [arg.ref]
      : arg && typeof arg === 'object' && 'param' in arg
        ? [arg]
        : arg && typeof arg === 'object' && 'object' in arg
          ? Object.values(arg.object).flatMap(sourcesOf)
          : [];

/** Structural problems per node id: unknown or later references, missing self or required operands. */
export function validateDefinition(definition: Definition): Map<string, string[]> {
  const issues = new Map<string, string[]>();
  const add = (id: string, message: string) => issues.set(id, [...(issues.get(id) ?? []), message]);
  const seen = new Set<string>();
  const known = new Set(definition.nodes.map((node) => node.id));
  for (const node of definition.nodes) {
    const check = (source: Source, what: string) => {
      if (typeof source === 'object') {
        if (!definition.params[source.param]) add(node.id, `${what} refers to a removed param`);
      } else if (!known.has(source)) add(node.id, `${what} refers to a removed node`);
      else if (!seen.has(source)) add(node.id, `${what} refers to a later node (move this node down)`);
    };
    if (isCallNode(node)) {
      const op = operationOf(node);
      if (!op) add(node.id, `${node.op} is not a vec2 operation`);
      else {
        if (!op.static) {
          if (!node.self) add(node.id, `pick the ${ownerOf(op)} to call ${op.id.split('.')[1]} on`);
          else check(node.self, 'self');
        }
        op.params.forEach(([name, slot], i) => {
          if (!isOptional(slot) && !isRest(slot) && isOmit(node.args?.[i])) add(node.id, `${name} is required`);
        });
      }
      (node.args ?? []).flatMap(sourcesOf).forEach((source) => check(source, 'an operand'));
    } else {
      check(node.of, 'source');
    }
    seen.add(node.id);
  }
  return issues;
}
