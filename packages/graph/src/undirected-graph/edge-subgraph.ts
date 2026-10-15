import type { UndirectedGraph2D } from './undirected-graph-2d';
import type { UndirectedNode2D } from './undirected-node-2d';
import { allowEdges, searchLongestSimplePath, searchPath, type GraphPath } from './path-search';

/** Incident degree of each node within an undirected edge subset. Missing ids are skipped. */
export function degreesInEdgeSet<T extends object>(
  graph: UndirectedGraph2D<T>,
  edgeIds: ReadonlySet<string>,
): Map<string, number> {
  const degree = new Map<string, number>();
  for (const edgeId of edgeIds) {
    const edge = graph.tryGetEdge(edgeId);
    if (!edge) continue;
    degree.set(edge.a.id, (degree.get(edge.a.id) ?? 0) + 1);
    degree.set(edge.b.id, (degree.get(edge.b.id) ?? 0) + 1);
  }
  return degree;
}

/** True when the edge subset is one simple cycle: ≥ 3 known edges, every node of degree 2, connected. */
export function isSimpleCycleEdgeSet<T extends object>(
  graph: UndirectedGraph2D<T>,
  edgeIds: ReadonlySet<string>,
): boolean {
  if (edgeIds.size < 3) return false;
  if (![...edgeIds].every((id) => graph.hasEdge(id))) return false;
  if (![...degreesInEdgeSet(graph, edgeIds).values()].every((count) => count === 2)) return false;
  return connectedEdgeComponents(graph, [...edgeIds]).length === 1;
}

/** Nodes with degree 1 inside an edge subset. */
export function leafNodesInEdgeSet<T extends object>(
  graph: UndirectedGraph2D<T>,
  edgeIds: ReadonlySet<string>,
): UndirectedNode2D[] {
  return [...degreesInEdgeSet(graph, edgeIds).entries()]
    .filter(([, count]) => count === 1)
    .map(([id]) => graph.getNode(id));
}

/**
 * Remove dangling chains (a leaf up to the junction it hangs from) while the subset still has a node
 * of degree > 2, shortest chain first (ties by edge id). A Y keeps the path through its two longest
 * arms; a cycle keeps the cycle. Ids missing from the graph are dropped.
 * @see twoCore to drop every tree part instead.
 */
export function peelSpurs<T extends object>(graph: UndirectedGraph2D<T>, edgeIds: readonly string[]): Set<string> {
  const active = new Set(edgeIds.filter((id) => graph.hasEdge(id)));

  for (;;) {
    const degree = degreesInEdgeSet(graph, active);
    if (![...degree.values()].some((count) => count > 2)) return active;

    let shortest: string[] | null = null;
    for (const leaf of leafNodesInEdgeSet(graph, active)) {
      const chain = danglingChain(leaf, active, degree);
      if (!chain) continue;
      if (!shortest || chain.length < shortest.length || (chain.length === shortest.length && chain[0]! < shortest[0]!)) {
        shortest = chain;
      }
    }
    if (!shortest) return active;
    for (const id of shortest) active.delete(id);
  }
}

/** Edge ids from `leaf` to the first node of degree > 2, or `null` when the chain ends at another leaf. */
function danglingChain(
  leaf: UndirectedNode2D,
  active: ReadonlySet<string>,
  degree: ReadonlyMap<string, number>,
): string[] | null {
  const chain: string[] = [];
  let node = leaf;
  let previous: string | null = null;

  for (;;) {
    const edge = node.edgesOf().find((candidate) => active.has(candidate.id) && candidate.id !== previous);
    if (!edge) return null;
    chain.push(edge.id);
    previous = edge.id;
    node = edge.other(node);
    const nodeDegree = degree.get(node.id) ?? 0;
    if (nodeDegree > 2) return chain;
    if (nodeDegree !== 2) return null;
  }
}

/** The 2-core of an edge subset: repeatedly drop edges at degree-1 nodes until none remain. */
export function twoCore<T extends object>(graph: UndirectedGraph2D<T>, edgeIds: readonly string[]): Set<string> {
  const active = new Set(edgeIds.filter((id) => graph.hasEdge(id)));
  for (let leaves = leafNodesInEdgeSet(graph, active); leaves.length > 0; leaves = leafNodesInEdgeSet(graph, active)) {
    for (const leaf of leaves) {
      for (const edge of leaf.edgesOf()) active.delete(edge.id);
    }
  }
  return active;
}

/**
 * Close an open path (exactly two leaves) with the longest simple bridge through
 * `bridgeAllowed` edges that are not already in `active`.
 */
export function bridgeOpenPath<T extends object>(
  graph: UndirectedGraph2D<T>,
  active: ReadonlySet<string>,
  bridgeAllowed: ReadonlySet<string>,
  maxBridgeLength = 24,
): Set<string> {
  const leaves = leafNodesInEdgeSet(graph, active);
  if (leaves.length !== 2) return new Set(active);

  const allowed = new Set([...bridgeAllowed].filter((id) => !active.has(id)));
  const bridge = searchLongestSimplePath(leaves[0]!, leaves[1]!, {
    interpret: allowEdges(allowed),
    maxLength: maxBridgeLength,
  });
  if (!bridge) return new Set(active);

  return new Set([...active, ...bridge.edges.map((edge) => edge.id)]);
}

/**
 * Path between the two leaves of `edgeIds`, restricted to `allowed`.
 * Uses longest simple path when `longest` is true, otherwise Dijkstra.
 */
export function pathBetweenLeaves<T extends object>(
  graph: UndirectedGraph2D<T>,
  edgeIds: ReadonlySet<string>,
  allowed: ReadonlySet<string> = edgeIds,
  longest = false,
): GraphPath<T> | null {
  const leaves = leafNodesInEdgeSet(graph, edgeIds);
  if (leaves.length !== 2) return null;

  const interpret = allowEdges<T>(allowed);
  if (longest) {
    return searchLongestSimplePath(leaves[0]!, leaves[1]!, { interpret });
  }
  return searchPath(leaves[0]!, leaves[1]!, { search: 'dijkstra', interpret });
}

/** Cycle through any edge in `allowed`, via {@link UndirectedGraph2D.findCycle}. Missing ids are skipped. */
export function findCycleInEdgeSet<T extends object>(
  graph: UndirectedGraph2D<T>,
  allowed: ReadonlySet<string>,
): GraphPath<T> | null {
  const interpret = allowEdges<T>(allowed);
  for (const edgeId of allowed) {
    const edge = graph.tryGetEdge(edgeId);
    if (!edge) continue;
    const cycle = graph.findCycle(edge, interpret);
    if (cycle) return cycle;
  }
  return null;
}

/** Connected components of an edge subset (edges sharing a junction). */
export function connectedEdgeComponents<T extends object>(
  graph: UndirectedGraph2D<T>,
  edgeIds: readonly string[],
): string[][] {
  const remaining = new Set(edgeIds);
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    remaining.delete(start);
    const startEdge = graph.tryGetEdge(start);
    if (!startEdge) continue;

    const component: string[] = [];
    const stack = [start];

    while (stack.length > 0) {
      const edgeId = stack.pop()!;
      component.push(edgeId);
      const edge = graph.tryGetEdge(edgeId);
      if (!edge) continue;
      for (const node of [edge.a, edge.b]) {
        for (const next of node.edgesOf<T>()) {
          if (!remaining.has(next.id)) continue;
          remaining.delete(next.id);
          stack.push(next.id);
        }
      }
    }
    if (component.length > 0) components.push(component);
  }

  return components;
}
