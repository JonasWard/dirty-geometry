/** Plain graph descriptions shared by the graph examples (no React, no rendering). */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { UndirectedGraph2D } from '../src/undirected-graph/undirected-graph-2d';

/** Optional per-edge weight; a weight of 0 (or less) blocks the edge. */
export type WeightedEdge = { weight?: number };

export type GraphSpec = {
  nodes: Readonly<Record<string, readonly [number, number]>>;
  /** `[id, a, b]` or `[id, a, b, weight]`. */
  edges: readonly (readonly [string, string, string] | readonly [string, string, string, number])[];
};

export function buildGraph(spec: GraphSpec): UndirectedGraph2D<WeightedEdge> {
  const graph = new UndirectedGraph2D<WeightedEdge>();
  for (const [id, [x, y]] of Object.entries(spec.nodes)) graph.addNode(id, new Vec2(x, y));
  for (const [id, a, b, weight] of spec.edges) graph.addEdge(id, a, b, weight === undefined ? {} : { weight });
  return graph;
}

/** Node positions of a spec, for framing a drawing. */
export function specPoints(spec: GraphSpec): Vec2[] {
  return Object.values(spec.nodes).map(([x, y]) => new Vec2(x, y));
}

/** Rectangular lattice: nodes `x,y`, edges `h:x,y` (to the right) and `v:x,y` (upwards). */
export function latticeSpec(columns: number, rows: number, weight?: (id: string) => number | undefined): GraphSpec {
  const nodes: Record<string, [number, number]> = {};
  const edges: ([string, string, string] | [string, string, string, number])[] = [];
  const add = (id: string, a: string, b: string) => {
    const w = weight?.(id);
    edges.push(w === undefined ? [id, a, b] : [id, a, b, w]);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      nodes[`${x},${y}`] = [x, y];
      if (x + 1 < columns) add(`h:${x},${y}`, `${x},${y}`, `${x + 1},${y}`);
      if (y + 1 < rows) add(`v:${x},${y}`, `${x},${y}`, `${x},${y + 1}`);
    }
  }
  return { nodes, edges };
}

/** How a node is marked in a result drawing. */
export type NodeMarkerKind = 'start' | 'goal' | 'via' | 'leaf' | 'junction';
export type NodeMarker = { nodeId: string; kind: NodeMarkerKind; label?: string };

/** What a graph scenario evaluates to, in terms of the scenario's own node and edge ids. */
export type GraphScenarioResult = {
  /** Whether the operation produced something (a path, a cycle, `true`). */
  found: boolean;
  /** One line for the card, e.g. `cost 5.0 · 5 hops`. */
  summary: string;
  /** Edge ids of the result (path, kept edges, cycle). */
  highlight: readonly string[];
  /** Edge ids drawn as blocked. */
  blocked?: readonly string[];
  /** Edge ids of the input subset, drawn behind the result. */
  input?: readonly string[];
  /** Edge-id groups drawn in distinct colours (e.g. connected components). */
  groups?: readonly (readonly string[])[];
  markers?: readonly NodeMarker[];
};
