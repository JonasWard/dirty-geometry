/**
 * A definition as a node graph, Grasshopper style: every operation, call, shared form, list, object and stored value
 * is a node; a `{ ref }` is a wire from the named node (an input, a cell, a function param); a literal in an argument
 * stays on its port (persistent data). Functions are clusters: their params and body form a canvas of their own.
 *
 * The definition is the single source of truth. The graph is derived from it and never stored; node keys come from
 * where an expression sits (cell name or function name, plus its path), so the node view's layout can be kept beside
 * the definition without ids in it. `toDefinition` rebuilds the definition from a graph: tests use it as the inverse.
 */
import { formFields, isSharedForm } from '@dirty-geometry/fn/forms';
import { isArcOp, isLogOp, isTrigOp } from '@dirty-geometry/fn/math';
import { toCall } from '@dirty-geometry/fn/calls';
import type { Cell, Definition, Expr, Fn, Input, SharedExpr } from '@dirty-geometry/vec2/recording/definition';
import { setAt, type ExprPath } from '@dirty-geometry/vec2/recording/expr';
import { isOptional, isRest, operationById, slotType, type Type } from '@dirty-geometry/vec2/schema/schema';
import { parseTypeName, roleOf, type Analysis } from '@dirty-geometry/vec2/schema/typing';
import { operationLabel } from '../operations';
import { describeJson } from '../describe';

/** Where a node's expression lives: a cell, or a function's body. */
export type Owner = { kind: 'cell'; name: string } | { kind: 'function'; name: string };
/** The main sheet, or a function's body (a cluster). */
export type Canvas = 'main' | `fn:${string}`;
export type NodeKind =
  | 'input'
  | 'param'
  | 'out'
  | 'op'
  | 'call'
  | 'form'
  | 'part'
  | 'list'
  | 'object'
  | 'value'
  | 'literal'
  | 'alias';
/** A literal held on a port (persistent data), or `undefined` when the port is empty. */
export type PortLiteral = string | number | boolean | null | { number: 'Infinity' | '-Infinity' | 'NaN' };
export type Port = {
  /** The port's path below its node, joined with `.` (`args.center`, `0`, `items`; `''` for an alias). */
  key: string;
  label: string;
  /** The path below the node. */
  path: ExprPath;
  slot: Type;
  optional: boolean;
  /** The literal on the port, when nothing is wired to it. */
  literal?: PortLiteral;
  /** Whether the port holds a value at all (wired or a literal). */
  filled: boolean;
  /** A rest parameter's item: the parameter's name. */
  restOf?: string;
  /** A name that refers to nothing here (shown as a broken wire; kept so the definition reads back). */
  unresolved?: string;
};
export type GraphNode = {
  key: string;
  kind: NodeKind;
  canvas: Canvas;
  owner?: Owner;
  /** Where the node's expression sits in its owner. */
  path: ExprPath;
  /** The node's own expression (with its operands), as in the definition. */
  expr?: Expr;
  label: string;
  /** The operation, function or shared-form name, for the header's tooltip. */
  detail?: string;
  inputs: Port[];
  /** A cell's root: its name and flags. */
  cell?: { name: string; output: boolean; type?: string };
  /** An input's or a function param's name and type. */
  name?: string;
  type?: string;
  /** The function a list form calls. */
  fn?: string;
};
export type GraphEdge = { id: string; source: string; target: string; port: string };
export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byKey: Map<string, GraphNode>;
  /** What the graph does not draw but the definition needs back: the definition's own fields. */
  inputs: Input[];
  functions: { name: string; params: Fn['params'] }[];
};

export const pathKey = (path: ExprPath) => path.join('.');
const cellKey = (name: string) => `c:${name}`;
const inputKey = (name: string) => `i:${name}`;
const paramKey = (fn: string, param: string) => `f:${fn}#${param}`;
/** A function's output node (a param name is never empty, so it does not clash). */
export const outKey = (fn: string) => `f:${fn}#`;

/** The key of the node at `path` in `owner`: `c:plate`, `c:plate@args.center`, `f:rim@`, `f:rim@args.0`. */
export function nodeKey(owner: Owner, path: ExprPath): string {
  if (owner.kind === 'cell') return path.length ? `c:${owner.name}@${pathKey(path)}` : cellKey(owner.name);
  return `f:${owner.name}@${pathKey(path)}`;
}
export const canvasOf = (owner: Owner): Canvas => (owner.kind === 'cell' ? 'main' : `fn:${owner.name}`);

const isObj = (e: unknown): e is Record<string, unknown> => e !== null && typeof e === 'object' && !Array.isArray(e);
/** Whether `e` stays on its port instead of becoming a node. */
export const isInline = (e: Expr): e is PortLiteral => (isObj(e) ? 'number' in e : !Array.isArray(e));
const safeType = (text: string): Type => {
  try {
    return parseTypeName(text);
  } catch {
    return 'unknown';
  }
};
const at = (e: Expr, path: ExprPath): Expr | undefined =>
  path.reduce<any>((node, key) => (node === undefined || node === null ? undefined : node[key]), e);

/** The ports of a shared form, with slot types; `slot` is where the form stands. */
export function formPorts(
  form: SharedExpr,
  slot: Type,
): { path: ExprPath; label: string; slot: Type; optional: boolean }[] {
  if ('args' in form) {
    const math = 'math' in form ? form.math : '';
    const operand: Type =
      'logic' in form
        ? 'boolean'
        : 'compare' in form || isArcOp(math) || isLogOp(math)
          ? 'number'
          : isTrigOp(math)
            ? 'Radians'
            : math === 'atan2'
              ? 'Coordinate'
              : (roleOf(slot) ?? 'number');
    const names = math === 'atan2' ? ['y', 'x'] : form.args.length === 1 ? ['x'] : ['a', 'b'];
    const ports = form.args.map((_, i) => ({ path: ['args', i], label: names[i]!, slot: operand, optional: false }));
    if ('compare' in form && form.compare === '==')
      ports.push({ path: ['slack'], label: 'slack', slot: 'Tolerance', optional: true });
    return ports;
  }
  const SLOTS: Record<string, Type> = {
    if: 'boolean',
    then: slot,
    else: slot,
    seed: 'Integer',
    index: 'Index',
    count: 'Index',
    t: 'Coordinate',
    scale: 'Length',
    start: 'Integer',
    end: 'Integer',
  };
  const OPTIONAL = new Set(['initial', 'data', 'end', 'scale']);
  return formFields(form).map((field) => ({
    path: [field],
    label: field,
    slot: SLOTS[field] ?? 'unknown',
    optional: OPTIONAL.has(field),
  }));
}

/** A node's label: what it computes, as the cell editor names it. */
function labelOf(e: Expr): { label: string; detail?: string } {
  if (Array.isArray(e)) return { label: `list [${e.length}]` };
  if (!isObj(e)) return { label: String(e) };
  if ('op' in e) return { label: operationLabel(e.op as string).head.replace(/\(\)$/, ''), detail: e.op as string };
  if ('call' in e) return { label: e.call as string, detail: 'cluster' };
  if ('object' in e) return { label: '{ options }' };
  if ('value' in e) return { label: describeJson(e.value), detail: 'stored value' };
  if ('of' in e) return { label: 'index' in e ? `[${e.index}]` : `.${e.field}` };
  if (isSharedForm<Expr>(e)) {
    const symbol: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', neg: '−x' };
    if ('math' in e && e.math in symbol) return { label: symbol[e.math]!, detail: 'math' };
    return { label: toCall(e)?.name ?? '?', detail: 'lib' };
  }
  return { label: '?' };
}

/** The ports of an expression node, with paths below it and slot types. */
function portsOf(e: Expr, slot: Type, fns: ReadonlyMap<string, Fn>): Omit<Port, 'key' | 'literal' | 'filled'>[] {
  if (Array.isArray(e)) {
    const item = Array.isArray(slot) ? slot[0]! : 'unknown';
    return e.map((_, i) => ({ path: [i], label: String(i), slot: item, optional: false }));
  }
  if (!isObj(e)) return [];
  if ('op' in e) {
    const op = operationById.get(e.op as string);
    if (!op) return [];
    const ports: Omit<Port, 'key' | 'literal' | 'filled'>[] = [];
    if (!op.static) ports.push({ path: ['self'], label: op.owner, slot: op.owner, optional: false });
    const args = (e.args ?? {}) as Record<string, Expr>;
    for (const [name, s] of op.params) {
      const value = args[name];
      if (isRest(s) && Array.isArray(value))
        value.forEach((_, i) =>
          ports.push({
            path: ['args', name, i],
            label: `${name}[${i}]`,
            slot: slotType(s),
            optional: true,
            restOf: name,
          }),
        );
      else if (isRest(s))
        ports.push({ path: ['args', name], label: `…${name}`, slot: [slotType(s)], optional: true, restOf: name });
      else ports.push({ path: ['args', name], label: name, slot: slotType(s), optional: isOptional(s) });
    }
    return ports;
  }
  if ('call' in e) {
    const fn = fns.get(e.call as string);
    return (fn?.params ?? []).map((p) => ({
      path: ['args', p.name],
      label: p.name,
      slot: safeType(p.type),
      optional: false,
    }));
  }
  if ('object' in e)
    return Object.keys(e.object as object).map((k) => ({
      path: ['object', k],
      label: k,
      slot: 'unknown',
      optional: true,
    }));
  if ('of' in e) return [{ path: ['of'], label: 'of', slot: 'unknown', optional: false }];
  if (isSharedForm<Expr>(e)) return formPorts(e, slot);
  return [];
}

/** The graph of a definition. */
export function toGraph(definition: Definition): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fns = new Map(definition.functions.map((fn) => [fn.name, fn]));
  const cells = new Set(definition.cells.map((c) => c.name));
  const inputs = new Set(definition.inputs.map((i) => i.name));

  for (const input of definition.inputs)
    nodes.push({
      key: inputKey(input.name),
      kind: 'input',
      canvas: 'main',
      path: [],
      label: input.name,
      name: input.name,
      type: input.type,
      expr: input.value,
      inputs: [],
    });

  /** Where a `{ ref }` in `owner` points. */
  const refKey = (owner: Owner, name: string): string | undefined => {
    if (owner.kind === 'function') {
      const fn = fns.get(owner.name);
      return fn?.params.some((p) => p.name === name) ? paramKey(owner.name, name) : undefined;
    }
    return inputs.has(name) ? inputKey(name) : cells.has(name) ? cellKey(name) : undefined;
  };

  /** Adds the node for `e` at `path` in `owner` (and the nodes it uses); returns its key. */
  function add(e: Expr, owner: Owner, path: ExprPath, slot: Type, root?: Partial<GraphNode>): string {
    const key = nodeKey(owner, path);
    const canvas = canvasOf(owner);
    if (isInline(e) || (isObj(e) && 'ref' in e)) {
      // A cell (or body) whose root is a literal or a name: a panel or a pass-through node.
      const alias = isObj(e) && 'ref' in e;
      const port: Port = { key: '', label: 'value', path: [], slot, optional: false, filled: true };
      const node: GraphNode = {
        key,
        kind: alias ? 'alias' : 'literal',
        canvas,
        owner,
        path,
        expr: e,
        label: alias ? '=' : 'value',
        inputs: alias ? [port] : [],
        ...root,
      };
      nodes.push(node);
      if (alias) wire(e as { ref: string }, owner, key, port);
      return key;
    }
    const kind: NodeKind = Array.isArray(e)
      ? 'list'
      : 'op' in e
        ? 'op'
        : 'call' in e
          ? 'call'
          : 'object' in e
            ? 'object'
            : 'value' in e
              ? 'value'
              : 'of' in e
                ? 'part'
                : 'form';
    const node: GraphNode = { key, kind, canvas, owner, path, expr: e, inputs: [], ...labelOf(e), ...root };
    if (kind === 'form' && 'fn' in (e as object)) node.fn = (e as { fn: string }).fn;
    nodes.push(node);
    for (const port of portsOf(e, slot, fns)) {
      const value = at(e, port.path);
      const p: Port = { ...port, key: pathKey(port.path), filled: value !== undefined };
      node.inputs.push(p);
      if (value === undefined) continue;
      if (isInline(value)) p.literal = value;
      else if (isObj(value) && 'ref' in value) wire(value as { ref: string }, owner, key, p);
      else {
        const source = add(value, owner, [...path, ...port.path], port.slot);
        edges.push({ id: `${key}:${p.key}`, source, target: key, port: p.key });
      }
    }
    return key;
  }
  function wire(e: { ref: string }, owner: Owner, target: string, port: Port) {
    const source = refKey(owner, e.ref);
    if (source) edges.push({ id: `${target}:${port.key}`, source, target, port: port.key });
    else port.unresolved = e.ref;
  }

  for (const cell of definition.cells) {
    const slot = cell.type ? safeType(cell.type) : 'unknown';
    add(cell.expr, { kind: 'cell', name: cell.name }, [], slot, {
      cell: { name: cell.name, output: cell.output === true, ...(cell.type !== undefined && { type: cell.type }) },
    });
  }
  for (const fn of definition.functions) {
    const canvas: Canvas = `fn:${fn.name}`;
    for (const p of fn.params)
      nodes.push({
        key: paramKey(fn.name, p.name),
        kind: 'param',
        canvas,
        path: [],
        label: p.name,
        name: p.name,
        type: p.type,
        inputs: [],
      });
    const out: GraphNode = {
      key: outKey(fn.name),
      kind: 'out',
      canvas,
      owner: { kind: 'function', name: fn.name },
      path: [],
      label: fn.name,
      detail: 'cluster output',
      inputs: [],
    };
    const owner: Owner = { kind: 'function', name: fn.name };
    const port: Port = { key: '', label: 'result', path: [], slot: 'unknown', optional: false, filled: true };
    if (isInline(fn.body)) port.literal = fn.body;
    out.inputs.push(port);
    nodes.push(out);
    if (isInline(fn.body)) continue;
    if (isObj(fn.body) && 'ref' in fn.body) wire(fn.body as { ref: string }, owner, out.key, port);
    else {
      const source = add(fn.body, owner, [], 'unknown');
      edges.push({ id: `${out.key}:`, source, target: out.key, port: '' });
    }
  }
  return {
    nodes,
    edges,
    byKey: new Map(nodes.map((n) => [n.key, n])),
    inputs: definition.inputs,
    functions: definition.functions.map((fn) => ({ name: fn.name, params: fn.params })),
  };
}

/** The name a wire from a named node stands for (an input, a cell, a param), if it is one. */
const nameOf = (node: GraphNode): string | undefined =>
  node.kind === 'input' || node.kind === 'param' ? node.name : node.cell?.name;

/** Rebuilds the definition a graph was made from (the inverse of `toGraph`). */
export function toDefinition(graph: Graph): Definition {
  const into = new Map<string, Map<string, string>>();
  for (const edge of graph.edges) {
    if (!into.has(edge.target)) into.set(edge.target, new Map());
    into.get(edge.target)!.set(edge.port, edge.source);
  }
  function build(key: string): Expr {
    const node = graph.byKey.get(key)!;
    if (node.kind === 'literal') return node.expr!;
    const wires = into.get(key) ?? new Map<string, string>();
    // The node's own shape: its expression with every port cleared, then each port written back.
    let e: Expr = node.kind === 'alias' || node.kind === 'out' ? null : node.expr!;
    for (const port of node.inputs) if (port.filled && port.path.length) e = setAt(e, port.path, null);
    for (const port of node.inputs) {
      if (!port.filled) {
        if (port.path.length) e = setAt(e, port.path, undefined);
        continue;
      }
      const source = wires.get(port.key);
      const value: Expr =
        source !== undefined
          ? (operand(graph.byKey.get(source)!) ?? build(source))
          : port.unresolved !== undefined
            ? { ref: port.unresolved }
            : (port.literal as Expr);
      e = setAt(e, port.path, value);
    }
    return e;
  }
  const operand = (source: GraphNode): Expr | undefined => {
    const name = nameOf(source);
    return name === undefined ? undefined : { ref: name };
  };
  const cells: Cell[] = graph.nodes
    .filter((n) => n.cell)
    .map((n) => ({
      name: n.cell!.name,
      expr: build(n.key),
      ...(n.cell!.type !== undefined && { type: n.cell!.type }),
      ...(n.cell!.output && { output: true as const }),
    }));
  const functions: Fn[] = graph.functions.map((fn) => ({ ...fn, body: build(outKey(fn.name)) }));
  return { format: 'vec2-definition', version: 4, inputs: graph.inputs, functions, cells };
}

/** Issues by node: those on a port (by path) and those on the node itself (the deepest node above the issue). */
export function issuesByNode(graph: Graph, analysis: Analysis) {
  const out = new Map<string, { node: string[]; ports: Map<string, string[]> }>();
  const entry = (key: string) => {
    if (!out.has(key)) out.set(key, { node: [], ports: new Map() });
    return out.get(key)!;
  };
  for (const issue of analysis.issues) {
    if (issue.kind === 'input') {
      entry(inputKey(issue.name)).node.push(issue.message);
      continue;
    }
    const owner: Owner = { kind: issue.kind === 'cell' ? 'cell' : 'function', name: issue.name };
    const path = issue.path;
    // A function's own issues (its params, a duplicate name) go on its output node.
    if (owner.kind === 'function' && path[0] === 'params') {
      entry(outKey(owner.name)).node.push(issue.message);
      continue;
    }
    let placed = false;
    for (let n = path.length; n >= 0 && !placed; n--) {
      const node = graph.byKey.get(nodeKey(owner, path.slice(0, n)));
      if (!node) continue;
      const below = pathKey(path.slice(n));
      const port = node.inputs.find((p) => p.key === below);
      if (port) entry(node.key).ports.set(port.key, [...(entry(node.key).ports.get(port.key) ?? []), issue.message]);
      else entry(node.key).node.push(issue.message);
      placed = true;
    }
    if (!placed) entry(owner.kind === 'cell' ? cellKey(owner.name) : outKey(owner.name)).node.push(issue.message);
  }
  return out;
}

/**
 * The definition with the node `key`'s expression as a cell of its own, right before its cell, so it can be
 * evaluated and drawn; `undefined` for nodes that are not inside a cell (inputs are drawn by name, function bodies
 * have no param values).
 */
export function withPreviewCell(
  definition: Definition,
  graph: Graph,
  key: string,
  name: string,
): { definition: Definition; name: string } | undefined {
  const node = graph.byKey.get(key);
  if (!node || node.owner?.kind !== 'cell') return undefined;
  if (node.cell) return { definition, name: node.cell.name };
  const index = definition.cells.findIndex((c) => c.name === node.owner!.name);
  const cell = definition.cells[index];
  const expr = cell && at(cell.expr, node.path);
  if (!cell || expr === undefined) return undefined;
  const cells = [...definition.cells];
  cells.splice(index, 0, { name, expr });
  return { definition: { ...definition, cells }, name };
}
