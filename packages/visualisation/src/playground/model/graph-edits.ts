/**
 * Edits made in the node view, as edits of the definition (it stays the only truth) plus the layout, whose keys move
 * with the nodes they place. Each edit takes and returns `{ definition, layout }` and throws, with a message for the
 * viewer, when it cannot be made.
 *
 * Named nodes (inputs, cells, params) can feed many ports; an anonymous node feeds one. So wiring an anonymous node a
 * second time makes it a cell, and a cell the viewer added (its name still automatic) that ends up feeding exactly one
 * port goes back inside that port: the rule the migration from version 3 uses, applied when a wire is drawn.
 */
import type { Cell, Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { mapExpr, setAt, walk, type ExprPath } from '@dirty-geometry/vec2/recording/expr';
import {
  assignable,
  checkDefinition,
  nameProblem,
  parseTypeName,
  typeName,
  typer,
  type Analysis,
} from '@dirty-geometry/vec2/schema/typing';
import type { Type } from '@dirty-geometry/vec2/schema/schema';
import { defaultLiteral } from '../defaults';
import { canvasOf, isInline, nodeKey, toGraph, type Graph, type GraphNode, type Owner, type Port } from './graph';
import { remapLayout, type Layout, type Point } from './layout';
import * as ops from './ops';

export type GraphDoc = { definition: Definition; layout: Layout };

export class GraphEditError extends Error {
  override name = 'GraphEditError';
}
const fail = (message: string): never => {
  throw new GraphEditError(message);
};

const exprAt = (definition: Definition, owner: Owner, path: ExprPath): Expr | undefined => {
  const root =
    owner.kind === 'cell'
      ? definition.cells.find((c) => c.name === owner.name)?.expr
      : definition.functions.find((f) => f.name === owner.name)?.body;
  return path.reduce<any>((e, key) => (e === undefined || e === null ? undefined : e[key]), root);
};
const setIn = (definition: Definition, owner: Owner, path: ExprPath, value: Expr | undefined): Definition =>
  owner.kind === 'cell'
    ? ops.setCellExpr(definition, owner.name, path, value)
    : ops.setFunctionBody(definition, owner.name, path, value);
const cellIndex = (definition: Definition, name: string) => definition.cells.findIndex((c) => c.name === name);
const nodeOf = (graph: Graph, key: string): GraphNode => graph.byKey.get(key) ?? fail(`No node ${key}`);
const portOf = (node: GraphNode, key: string): Port =>
  node.inputs.find((p) => p.key === key) ?? fail(`${node.label} has no input ${key}`);
/** The name a wire from `node` stands for, when it is a named node. */
const nameOf = (node: GraphNode) => (node.kind === 'input' || node.kind === 'param' ? node.name : node.cell?.name);

/** Whether `cell` still has the name it was given automatically (`vec2`, `vec2_2`, `add3`). */
export function isAutoNamed(cell: Cell): boolean {
  const base = ops.nameFor(cell.expr);
  return cell.name === base || new RegExp(`^${base.replace(/[$]/g, '\\$')}_?\\d+$`).test(cell.name);
}
/** How many times `name` is used (`{ ref }`) in the cells. */
export function usesOf(definition: Definition, name: string): number {
  let n = 0;
  for (const cell of definition.cells)
    for (const { expr } of walk(cell.expr))
      if (expr && typeof expr === 'object' && 'ref' in expr && expr.ref === name) n++;
  return n;
}
/** The cells `name` uses, directly or through other cells. */
function dependencies(definition: Definition, name: string, seen = new Set<string>()): Set<string> {
  const cell = definition.cells.find((c) => c.name === name);
  if (!cell) return seen;
  for (const { expr } of walk(cell.expr))
    if (
      expr &&
      typeof expr === 'object' &&
      'ref' in expr &&
      !seen.has(expr.ref) &&
      cellIndex(definition, expr.ref) >= 0
    ) {
      seen.add(expr.ref);
      dependencies(definition, expr.ref, seen);
    }
  return seen;
}

/** The type of the value a node gives (for checking wires). */
export function nodeType(definition: Definition, analysis: Analysis, node: GraphNode): Type {
  if (node.kind === 'input' || node.kind === 'param') {
    try {
      return parseTypeName(node.type!);
    } catch {
      return 'unknown';
    }
  }
  if (node.cell) return analysis.refs.get(node.cell.name) ?? 'unknown';
  if (!node.owner || node.expr === undefined) return 'unknown';
  const refs =
    node.owner.kind === 'cell'
      ? analysis.refs
      : new Map(
          (definition.functions.find((f) => f.name === node.owner!.name)?.params ?? []).map((p) => [
            p.name,
            parseTypeName(p.type),
          ]),
        );
  return typer([], 'cell', '').typeOf(node.expr, { refs, fns: analysis.fns });
}

/**
 * Makes the anonymous node `key` a cell of its own (named `name`, or after what it holds), right before the cell it
 * sits in, and leaves a `{ ref }` in its place. Only nodes in cells: a function body has no cells.
 */
export function promote(doc: GraphDoc, key: string, name?: string): { doc: GraphDoc; name: string } {
  const graph = toGraph(doc.definition);
  const node = nodeOf(graph, key);
  if (node.cell) return { doc, name: node.cell.name };
  if (node.owner?.kind !== 'cell') fail('Inside a cluster a node cannot be named: make it a param of the cluster');
  const expr = exprAt(doc.definition, node.owner!, node.path)!;
  const owner = node.owner!.name;
  const cellName = name ?? ops.freeName(doc.definition, ops.nameFor(expr));
  let definition = ops.addCell(doc.definition, expr, { name: cellName });
  definition = ops.moveCell(definition, cellName, cellIndex(definition, owner));
  definition = setIn(definition, node.owner!, node.path, { ref: cellName });
  return { doc: { definition, layout: remapLayout(doc.layout, key, `c:${cellName}`) }, name: cellName };
}

/** Why a wire from `source` into `port` of `target` cannot be drawn, or `undefined` when it can. */
export function connectProblem(
  doc: GraphDoc,
  analysis: Analysis,
  graph: Graph,
  sourceKey: string,
  targetKey: string,
  portKey: string,
): string | undefined {
  const source = graph.byKey.get(sourceKey);
  const target = graph.byKey.get(targetKey);
  if (!source || !target) return 'That node is gone';
  const port = target.inputs.find((p) => p.key === portKey);
  if (!port) return `${target.label} has no input ${portKey}`;
  if (source.kind === 'out') return 'A cluster output has no result to wire';
  if (source.canvas !== target.canvas) return 'Wires stay on one canvas';
  // A loop: the target sits inside the source, or the source's cell needs the target's cell.
  if (sourceKey === targetKey || targetKey.startsWith(`${sourceKey}@`) || targetKey.startsWith(`${sourceKey}.`))
    return 'That wire would make a loop';
  if (source.owner?.kind === 'cell' && target.owner?.kind === 'cell') {
    const from = source.owner.name;
    if (from !== target.owner.name && dependencies(doc.definition, from).has(target.owner.name))
      return 'That wire would make a loop';
  }
  if (source.kind === 'input' && target.owner?.kind === 'function') return 'A cluster sees only its own params';
  const type = nodeType(doc.definition, analysis, source);
  if (!assignable(type, port.slot))
    return `${source.label} gives ${typeName(type)}; ${port.label} takes ${typeName(port.slot)}`;
  return undefined;
}

/**
 * Cells moved so `name` (and the cells it needs) come before `before`, keeping their order; the definition when
 * they already do.
 */
function hoist(definition: Definition, name: string, before: string): Definition {
  const at = cellIndex(definition, before);
  if (cellIndex(definition, name) < at) return definition;
  const needed = new Set([name, ...dependencies(definition, name)]);
  const moved = definition.cells.filter((c, i) => i > at && needed.has(c.name));
  const rest = definition.cells.filter((c) => !moved.includes(c));
  const index = rest.findIndex((c) => c.name === before);
  return { ...definition, cells: [...rest.slice(0, index), ...moved, ...rest.slice(index)] };
}

/** Wires `source` into `port` of `target`. What the port held before keeps its node (as a cell of its own). */
export function connect(doc: GraphDoc, sourceKey: string, targetKey: string, portKey: string): GraphDoc {
  const analysis = checkDefinition(doc.definition);
  let graph = toGraph(doc.definition);
  const problem = connectProblem(doc, analysis, graph, sourceKey, targetKey, portKey);
  if (problem) fail(problem);
  let target = nodeOf(graph, targetKey);
  let port = portOf(target, portKey);
  // What the port holds now stays on the canvas: an anonymous node there becomes a cell.
  const held = graph.edges.find((e) => e.target === targetKey && e.port === portKey);
  if (held && !nameOf(nodeOf(graph, held.source)) && target.owner?.kind === 'cell' && held.source !== sourceKey) {
    doc = promote(doc, held.source).doc;
    graph = toGraph(doc.definition);
  }
  let source = nodeOf(graph, sourceKey);
  let value: Expr;
  if (nameOf(source)) value = { ref: nameOf(source)! };
  else if (source.owner?.kind === 'cell') {
    // An anonymous node feeding a second port becomes a cell.
    const promoted = promote(doc, sourceKey);
    doc = promoted.doc;
    value = { ref: promoted.name };
  } else value = exprAt(doc.definition, source.owner!, source.path)!; // inside a cluster: a copy
  graph = toGraph(doc.definition);
  target = nodeOf(graph, targetKey);
  port = portOf(target, portKey);
  let definition = doc.definition;
  const ref = typeof value === 'object' && value && 'ref' in value ? value.ref : undefined;
  if (ref && target.owner?.kind === 'cell' && cellIndex(definition, ref) >= 0)
    definition = hoist(definition, ref, target.owner.name);
  definition = setIn(
    definition,
    target.owner ?? fail('That input cannot be wired'),
    [...target.path, ...port.path],
    value,
  );
  let layout = doc.layout;
  // A cell the viewer added that now feeds one port goes back inside it.
  const cell = ref ? definition.cells.find((c) => c.name === ref) : undefined;
  if (cell && !cell.output && cell.type === undefined && isAutoNamed(cell) && usesOf(definition, ref!) === 1) {
    definition = ops.removeCell(definition, ref!);
    layout = remapLayout(layout, `c:${ref}`, nodeKey(target.owner!, [...target.path, ...port.path]));
  }
  return { definition, layout };
}

/** Removes the wire into `port` of `target`; an anonymous node it came from stays, as a cell of its own. */
export function disconnect(doc: GraphDoc, targetKey: string, portKey: string): GraphDoc {
  const graph = toGraph(doc.definition);
  const target = nodeOf(graph, targetKey);
  const port = portOf(target, portKey);
  const edge = graph.edges.find((e) => e.target === targetKey && e.port === portKey);
  if (edge && !nameOf(nodeOf(graph, edge.source)) && target.owner?.kind === 'cell') doc = promote(doc, edge.source).doc;
  if (!target.owner) return doc;
  return { ...doc, definition: setIn(doc.definition, target.owner, [...target.path, ...port.path], undefined) };
}

/** Puts a literal on a port (Grasshopper's persistent data), or clears it (`undefined`). */
export function setPortLiteral(doc: GraphDoc, targetKey: string, portKey: string, literal: Expr | undefined): GraphDoc {
  const target = nodeOf(toGraph(doc.definition), targetKey);
  const port = portOf(target, portKey);
  if (literal !== undefined && !isInline(literal)) fail('Only a number, text, true or false sits on a port');
  if (target.kind === 'literal' && target.owner)
    return { ...doc, definition: setIn(doc.definition, target.owner, target.path, literal ?? null) };
  return { ...doc, definition: setIn(doc.definition, target.owner!, [...target.path, ...port.path], literal) };
}
/** A cell's own literal (a number panel). */
export function setNodeLiteral(doc: GraphDoc, key: string, literal: Expr): GraphDoc {
  const node = nodeOf(toGraph(doc.definition), key);
  if (node.kind !== 'literal' || !node.owner) fail('Only a value node holds a value of its own');
  return { ...doc, definition: setIn(doc.definition, node.owner!, node.path, literal) };
}

/** One more item for a rest parameter (`points[2]`), starting from its type's default. */
export function addRestItem(doc: GraphDoc, targetKey: string, rest: string): GraphDoc {
  const target = nodeOf(toGraph(doc.definition), targetKey);
  const items = target.inputs.filter((p) => p.restOf === rest);
  const slot = items[0]?.slot ?? 'unknown';
  const value = exprAt(doc.definition, target.owner!, [...target.path, 'args', rest]);
  const list = Array.isArray(value) ? value : [];
  const item = defaultLiteral(Array.isArray(slot) ? slot[0]! : slot) ?? null;
  return { ...doc, definition: setIn(doc.definition, target.owner!, [...target.path, 'args', rest], [...list, item]) };
}

/** A new node at `position`: on the main canvas a cell of its own. */
export function addNode(doc: GraphDoc, expr: Expr, position: Point): GraphDoc & { key: string } {
  const definition = ops.addCell(doc.definition, expr);
  const name = definition.cells.at(-1)!.name;
  return { definition, layout: { ...doc.layout, [`c:${name}`]: position }, key: `c:${name}` };
}
/** A new input at `position`. */
export function addInputNode(doc: GraphDoc, type: string, position: Point): GraphDoc & { key: string } {
  const definition = ops.addInput(doc.definition, type);
  const name = definition.inputs.at(-1)!.name;
  return { definition, layout: { ...doc.layout, [`i:${name}`]: position }, key: `i:${name}` };
}

/** `e` with every `{ ref: name }` taken out (an argument left out, a list item dropped). */
function withoutRefs(e: Expr, name: string): Expr {
  const paths = [...walk(e)]
    .filter(({ expr }) => expr && typeof expr === 'object' && 'ref' in expr && expr.ref === name)
    .map(({ path }) => path)
    .reverse(); // deepest and last first, so list indices stay right
  let out = e;
  for (const path of paths) out = path.length ? setAt(out, path, undefined) : null;
  return out;
}

/** Deletes a node: its wires go, the ports it fed become empty. An input's value stays where it was used. */
export function deleteNode(doc: GraphDoc, key: string): GraphDoc {
  const graph = toGraph(doc.definition);
  const node = nodeOf(graph, key);
  const layout = Object.fromEntries(
    Object.entries(doc.layout).filter(([k]) => k !== key && !k.startsWith(`${key}@`) && !k.startsWith(`${key}.`)),
  );
  if (node.kind === 'input') return { definition: ops.removeInput(doc.definition, node.name!), layout };
  if (node.kind === 'param' || node.kind === 'out') fail('Change a cluster’s params in the cluster itself');
  if (node.cell) {
    const name = node.cell.name;
    const definition = {
      ...doc.definition,
      cells: doc.definition.cells
        .filter((c) => c.name !== name)
        .map((c) => ({ ...c, expr: withoutRefs(c.expr, name) })),
    };
    return { definition, layout };
  }
  return { definition: setIn(doc.definition, node.owner!, node.path, undefined), layout };
}

/** Names a node: an anonymous one becomes a cell; a cell or an input is renamed. */
export function nameNode(doc: GraphDoc, key: string, name: string): GraphDoc {
  const node = nodeOf(toGraph(doc.definition), key);
  if (node.kind === 'input' || node.cell) {
    const from = node.kind === 'input' ? node.name! : node.cell!.name;
    const prefix = node.kind === 'input' ? 'i:' : 'c:';
    return {
      definition: ops.rename(doc.definition, from, name),
      layout: remapLayout(doc.layout, `${prefix}${from}`, `${prefix}${name}`),
    };
  }
  return promote(doc, key, name).doc;
}

/** Marks a node as an output (a cell, with the type it has) or not. */
export function setOutput(doc: GraphDoc, key: string, output: boolean): GraphDoc {
  let name: string;
  ({ doc, name } = promote(doc, key));
  const analysis = checkDefinition(doc.definition);
  const type = ops.outputTypes(analysis.refs.get(name) ?? 'unknown')[0];
  if (output && !type) fail(`${name} has no type an output can have`);
  const cell = doc.definition.cells.find((c) => c.name === name)!;
  return {
    ...doc,
    definition: ops.setCell(
      doc.definition,
      name,
      output ? { output: true, type: cell.type ?? type } : { output: undefined },
    ),
  };
}

export { canvasOf };

// ---- clusters ----

/**
 * Makes the selected nodes (on the main canvas) a cluster: a new function whose body is what they compute, called
 * where their result was used. Wires coming in from outside become its params (one per input or cell, one per
 * unselected node feeding in); the selection must flow into one result.
 */
export function makeCluster(doc: GraphDoc, keys: readonly string[], name?: string): GraphDoc & { name: string } {
  const definition = doc.definition;
  const graph = toGraph(definition);
  const analysis = checkDefinition(definition);
  // Inputs stay outside (they become params), whether selected or not.
  keys = keys.filter((k) => nodeOf(graph, k).kind !== 'input');
  const selected = new Set(keys);
  const nodes = keys.map((k) => nodeOf(graph, k));
  if (nodes.length < 1) fail('Select the nodes to put in the cluster');
  if (nodes.some((n) => n.canvas !== 'main')) fail('A cluster is made from nodes on the main canvas');
  // The result: the one selected node whose value is used outside the selection (or used nowhere).
  const consumers = (key: string) => graph.edges.filter((e) => e.source === key).map((e) => e.target);
  const results = nodes.filter((n) => {
    const out = consumers(n.key);
    return out.length === 0 || out.some((t) => !selected.has(t));
  });
  if (results.length !== 1)
    fail(
      `Select nodes that flow into one result (${results.length ? results.map((n) => n.cell?.name ?? n.label).join(', ') : 'none'} give one each)`,
    );
  const result = results[0]!;

  const params: { name: string; type: string; arg: Expr; ref?: string }[] = [];
  const visited = new Set<string>();
  const used = new Set(definition.functions.map((f) => f.name));
  const paramName = (base: string) => {
    const clean = base.replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1') || 'x';
    let n = clean;
    for (let i = 2; params.some((p) => p.name === n); i++) n = `${clean}${i}`;
    return n;
  };
  const typeOfExpr = (e: Expr): string => {
    const type = typer([], 'cell', '').typeOf(e, { refs: analysis.refs, fns: analysis.fns });
    const text = typeName(nonNullType(type));
    if (type === 'unknown' || /unknown/.test(text)) fail('A value coming into the cluster has no known type');
    return text;
  };
  /** A param for a value from outside: the same name or expression shares one. */
  const param = (arg: Expr, base: string): Expr => {
    const key = JSON.stringify(arg);
    const existing = params.find((p) => JSON.stringify(p.arg) === key);
    if (existing) return { ref: existing.name };
    const p = { name: paramName(base), type: typeOfExpr(arg), arg };
    params.push(p);
    return { ref: p.name };
  };
  const cellOf = (n: string) => definition.cells.find((c) => c.name === n);
  function build(e: Expr, owner: Owner, path: ExprPath, label: string): Expr {
    if (isInline(e)) return e;
    if (typeof e === 'object' && e !== null && !Array.isArray(e) && 'ref' in e) {
      const cell = cellOf(e.ref);
      if (cell && selected.has(`c:${cell.name}`)) {
        visited.add(`c:${cell.name}`);
        return build(cell.expr, { kind: 'cell', name: cell.name }, [], cell.name);
      }
      return param(e, e.ref);
    }
    const key = nodeKey(owner, path);
    if (!selected.has(key)) return param(e, label);
    visited.add(key);
    const node = graph.byKey.get(key)!;
    let out: Expr = e;
    for (const port of node.inputs) {
      if (!port.filled) continue;
      const value = port.path.reduce<any>((x, k) => x?.[k], e);
      if (value === undefined) continue;
      out = setAt(out, port.path, build(value, owner, [...path, ...port.path], port.label));
    }
    return out;
  }
  const body = build(result.expr!, result.owner!, result.path, result.label);
  const missed = keys.filter((k) => !visited.has(k));
  if (missed.length)
    fail(`Select nodes that flow into one result (${missed.map((k) => nodeOf(graph, k).label).join(', ')} do not)`);

  const fnName = name ?? ops.freeName(definition, 'cluster');
  if (used.has(fnName)) fail(`${fnName} is already a cluster`);
  const call: Expr = params.length
    ? { call: fnName, args: Object.fromEntries(params.map((p) => [p.name, p.arg])) }
    : { call: fnName };
  let next: Definition = {
    ...definition,
    functions: [
      ...definition.functions,
      { name: fnName, params: params.map(({ name: n, type }) => ({ name: n, type })), body },
    ],
  };
  next = setIn(next, result.owner!, result.path, call);
  // The selected cells (other than the result's) are inside the cluster now.
  const inlined = nodes.filter((n) => n.cell && n.key !== result.key).map((n) => n.cell!.name);
  for (const cell of inlined) {
    if (usesOf(next, cell) > 0) fail(`${cell} is also used outside the selection`);
    next = { ...next, cells: next.cells.filter((c) => c.name !== cell) };
  }
  const layout = Object.fromEntries(
    Object.entries(doc.layout).filter(([k]) => k === result.key || !keys.some((s) => k === s || k.startsWith(`${s}@`))),
  );
  return { definition: next, layout, name: fnName };
}
const nonNullType = (type: Type): Type =>
  typeof type === 'object' && type !== null && !Array.isArray(type) && 'or' in type
    ? (() => {
        const rest = (type as { or: Type[] }).or.filter((t) => t !== 'null');
        return rest.length === 1 ? rest[0]! : { or: rest };
      })()
    : type;

/** Dissolves a cluster: each call gets its body back, with the arguments in place of the params. */
export function dissolveCluster(doc: GraphDoc, fn: string): GraphDoc {
  const layout = Object.fromEntries(
    Object.entries(doc.layout).filter(([k]) => !k.startsWith(`f:${fn}@`) && !k.startsWith(`f:${fn}#`)),
  );
  return { definition: ops.removeFunction(doc.definition, fn), layout };
}

/** Renames a cluster (and every call of it). */
export function renameCluster(doc: GraphDoc, from: string, to: string): GraphDoc {
  const definition = ops.rename(doc.definition, from, to);
  let layout = remapLayout(doc.layout, `f:${from}#`, `f:${to}#`);
  layout = remapLayout(layout, `f:${from}@`, `f:${to}@`);
  return { definition, layout };
}

/** A new param for a cluster (calls pass its type's default). */
export function addClusterParam(doc: GraphDoc, fn: string, type = 'Coordinate'): GraphDoc {
  return { ...doc, definition: ops.addParam(doc.definition, fn, type) };
}
/** Removes a param: its uses in the body become its type's default; calls drop the argument. */
export function removeClusterParam(doc: GraphDoc, fn: string, param: string): GraphDoc {
  return { ...doc, definition: ops.removeParam(doc.definition, fn, param) };
}
export function setClusterParamType(doc: GraphDoc, fn: string, param: string, type: string): GraphDoc {
  return { ...doc, definition: ops.setParamType(doc.definition, fn, param, type) };
}
/** Renames a param: in the body and in every call's arguments. */
export function renameClusterParam(doc: GraphDoc, fn: string, from: string, to: string): GraphDoc {
  if (from === to) return doc;
  const problem = nameProblem(to);
  if (problem) fail(problem);
  const f = doc.definition.functions.find((x) => x.name === fn) ?? fail(`No cluster ${fn}`);
  if (f.params.some((p) => p.name === to)) fail(`${fn} already has a param ${to}`);
  const swap = (e: Expr) =>
    mapExpr(e, (x) => (x && typeof x === 'object' && 'ref' in x && x.ref === from ? { ref: to } : x));
  const renameArgs = (e: Expr) =>
    mapExpr(e, (x) =>
      x && typeof x === 'object' && 'call' in x && x.call === fn && x.args && from in x.args
        ? { ...x, args: Object.fromEntries(Object.entries(x.args).map(([k, v]) => [k === from ? to : k, v])) }
        : x,
    );
  const definition: Definition = {
    ...doc.definition,
    functions: doc.definition.functions.map((x) =>
      x.name === fn
        ? {
            ...x,
            params: x.params.map((p) => (p.name === from ? { ...p, name: to } : p)),
            body: renameArgs(swap(x.body)),
          }
        : { ...x, body: renameArgs(x.body) },
    ),
    cells: doc.definition.cells.map((c) => ({ ...c, expr: renameArgs(c.expr) })),
  };
  return { definition, layout: remapLayout(doc.layout, `f:${fn}#${from}`, `f:${fn}#${to}`) };
}

/** Puts a new node into `port` of `target` (a wire dragged from an input onto the empty canvas). */
export function insertNode(doc: GraphDoc, targetKey: string, portKey: string, expr: Expr, position: Point): GraphDoc {
  const target = nodeOf(toGraph(doc.definition), targetKey);
  const port = portOf(target, portKey);
  if (!target.owner) fail('That input cannot be wired');
  const path = [...target.path, ...port.path];
  const definition = setIn(doc.definition, target.owner!, path, expr);
  return { definition, layout: { ...doc.layout, [nodeKey(target.owner!, path)]: position } };
}
