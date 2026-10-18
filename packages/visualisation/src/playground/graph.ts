/** A definition as a layered graph, for inspecting or drawing it. */
import type { ArgV3 as Arg, DefinitionV3 as Definition, NodeV3 as Node, SourceV3 as Source } from '@dirty-geometry/vec2/recording/v3';

export type DefinitionGraphNodeKind = 'param' | 'operation' | 'item' | 'field';

export type DefinitionGraphNode = {
  id: string;
  kind: DefinitionGraphNodeKind;
  op: string;
  /** Short label, e.g. `Line2.evaluate(·, 0.5)`, `width`, `[3]`, `.polygons`. */
  label: string;
  /** Longest distance from an input; nodes with no inputs have depth 0. */
  depth: number;
  /** Position among the nodes of the same depth. */
  row: number;
  /** Output names that point at this node. */
  outputs: string[];
};

export type DefinitionGraphEdge = { from: string; to: string; role: 'self' | 'arg' | 'of' };

export type DefinitionGraph = {
  nodes: DefinitionGraphNode[];
  edges: DefinitionGraphEdge[];
  /** Number of depth layers. */
  depth: number;
};

const formatArg = (arg: Arg): string => {
  if (typeof arg === 'number') return String(Number(arg.toFixed(3)));
  if (arg === null || typeof arg !== 'object') return JSON.stringify(arg);
  if (Array.isArray(arg)) return `[${arg.length}]`;
  if ('number' in arg) return arg.number;
  if ('omit' in arg) return '–';
  if ('param' in arg) return arg.param;
  if ('ref' in arg) return '·';
  return 'value' in arg ? String((arg.value as { type?: unknown })?.type ?? 'value') : '{…}';
};

/** Graph ids of what an arg uses: node ids, and `param:<name>` for params. */
const usesOf = (arg: Arg): string[] =>
  Array.isArray(arg)
    ? arg.flatMap(usesOf)
    : arg === null || typeof arg !== 'object'
      ? []
      : 'ref' in arg
        ? [arg.ref]
        : 'param' in arg
          ? [`param:${arg.param}`]
          : 'object' in arg
            ? Object.values(arg.object).flatMap(usesOf)
            : [];
const idOf = (source: Source) => (typeof source === 'string' ? source : `param:${source.param}`);

function labelOf(node: Node): string {
  if ('index' in node) return `[${node.index}]`;
  if ('name' in node) return `.${node.name}`;
  return `${node.op.replace(/\.new$/, '')}(${(node.args ?? []).map(formatArg).join(', ')})`;
}

export function definitionGraph(definition: Definition): DefinitionGraph {
  const outputsOf = new Map<string, string[]>();
  for (const [name, source] of Object.entries(definition.outputs)) {
    outputsOf.set(idOf(source), [...(outputsOf.get(idOf(source)) ?? []), name]);
  }
  const edges: DefinitionGraphEdge[] = [];
  const depth = new Map<string, number>();
  const rows = new Map<number, number>([[0, 0]]);
  const params: DefinitionGraphNode[] = Object.keys(definition.params).map((name, row) => {
    const id = `param:${name}`;
    depth.set(id, 0);
    rows.set(0, row + 1);
    return { id, kind: 'param', op: 'param', label: name, depth: 0, row, outputs: outputsOf.get(id) ?? [] };
  });
  const nodes: DefinitionGraphNode[] = definition.nodes.map((node) => {
    const incoming: DefinitionGraphEdge[] = [];
    if ('of' in node) incoming.push({ from: node.of, to: node.id, role: 'of' });
    else {
      if (node.self !== undefined) incoming.push({ from: idOf(node.self), to: node.id, role: 'self' });
      for (const use of (node.args ?? []).flatMap(usesOf)) incoming.push({ from: use, to: node.id, role: 'arg' });
    }
    edges.push(...incoming);
    const level = incoming.reduce((max, edge) => Math.max(max, (depth.get(edge.from) ?? 0) + 1), 0);
    depth.set(node.id, level);
    const row = rows.get(level) ?? 0;
    rows.set(level, row + 1);
    const kind: DefinitionGraphNodeKind = 'index' in node ? 'item' : 'name' in node ? 'field' : 'operation';
    return {
      id: node.id,
      kind,
      op: node.op,
      label: labelOf(node),
      depth: level,
      row,
      outputs: outputsOf.get(node.id) ?? [],
    };
  });
  return { nodes: [...params, ...nodes], edges, depth: rows.size };
}
