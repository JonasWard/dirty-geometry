/** A definition as a layered graph, for inspecting or drawing it. */
import type { ArgJson, Definition, NodeJson } from './definition';
import { isOperationNode } from './definition';

export type DefinitionGraphNodeKind = 'param' | 'operation' | 'item' | 'field';

export type DefinitionGraphNode = {
  id: string;
  kind: DefinitionGraphNodeKind;
  op: string;
  /** Short label, e.g. `Line2#evaluate(·, 0.5)`, `width`, `[3]`, `.polygons`. */
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

const formatArg = (arg: ArgJson): string => {
  if ('lit' in arg) return typeof arg.lit === 'number' ? String(Number(arg.lit.toFixed(3))) : JSON.stringify(arg.lit);
  if ('number' in arg) return arg.number;
  if ('undefined' in arg) return '–';
  if ('ref' in arg) return '·';
  if ('value' in arg) return String((arg.value as { type?: unknown })?.type ?? 'value');
  if ('array' in arg) return `[${arg.array.length}]`;
  return '{…}';
};

const refsOf = (arg: ArgJson): string[] =>
  'ref' in arg
    ? [arg.ref]
    : 'array' in arg
      ? arg.array.flatMap(refsOf)
      : 'object' in arg
        ? Object.values(arg.object).flatMap(refsOf)
        : [];

function labelOf(node: NodeJson, paramNames: ReadonlyMap<string, string>): string {
  if (node.op === 'param' && 'name' in node && !('of' in node)) return paramNames.get(node.id) ?? node.name;
  if (node.op === 'item' && 'index' in node) return `[${node.index}]`;
  if (node.op === 'field' && 'of' in node && 'name' in node) return `.${node.name}`;
  if (!isOperationNode(node)) return node.op;
  const name = node.op.includes(':') ? node.op.slice(node.op.indexOf(':') + 1) : node.op.replace(/\.new$/, '');
  const args = node.args.map(formatArg).join(', ');
  return `${name}(${args})`;
}

export function definitionGraph(definition: Definition): DefinitionGraph {
  const paramNames = new Map(Object.entries(definition.params).map(([name, param]) => [param.node, name]));
  const outputsOf = new Map<string, string[]>();
  for (const [name, id] of Object.entries(definition.outputs)) outputsOf.set(id, [...(outputsOf.get(id) ?? []), name]);

  const edges: DefinitionGraphEdge[] = [];
  const depth = new Map<string, number>();
  const rows = new Map<number, number>();
  const nodes: DefinitionGraphNode[] = definition.nodes.map((node) => {
    const incoming: DefinitionGraphEdge[] = [];
    if (isOperationNode(node)) {
      if (node.self) incoming.push({ from: node.self, to: node.id, role: 'self' });
      for (const ref of node.args.flatMap(refsOf)) incoming.push({ from: ref, to: node.id, role: 'arg' });
    } else if ('of' in node) {
      incoming.push({ from: node.of, to: node.id, role: 'of' });
    }
    edges.push(...incoming);
    const level = incoming.reduce((max, edge) => Math.max(max, (depth.get(edge.from) ?? 0) + 1), 0);
    depth.set(node.id, level);
    const row = rows.get(level) ?? 0;
    rows.set(level, row + 1);

    const kind: DefinitionGraphNodeKind =
      node.op === 'param' && !('of' in node) && 'name' in node
        ? 'param'
        : node.op === 'item' && 'index' in node
          ? 'item'
          : node.op === 'field' && 'of' in node
            ? 'field'
            : 'operation';
    return {
      id: node.id,
      kind,
      op: node.op,
      label: labelOf(node, paramNames),
      depth: level,
      row,
      outputs: outputsOf.get(node.id) ?? [],
    };
  });

  return { nodes, edges, depth: rows.size };
}
