import { UndirectedEdge2D } from './undirected-edge-2d';
import type { UndirectedNode2D } from './undirected-node-2d';

/** Cost / filter for traversing an edge from `from` toward `to`. Non-finite or ≤ 0 ⇒ blocked. */
export type EdgeInterpretFn<T extends object> = (
  edge: UndirectedEdge2D<T>,
  from: UndirectedNode2D,
  to: UndirectedNode2D,
) => number;

export type PathSearchKind = 'bfs' | 'dijkstra' | 'astar';

export type PathSearchOptions<T extends object> = {
  /** Defaults to Euclidean edge length for Dijkstra / A*; BFS still uses hop count. */
  interpret?: EdgeInterpretFn<T>;
  search?: PathSearchKind;
  /**
   * A* estimate of the remaining cost from a node to the goal. Must not overestimate the
   * interpreted cost. Defaults to Euclidean distance with the default `interpret`, and to 0 (plain
   * Dijkstra) when a custom `interpret` is given, since straight-line distance can overestimate it.
   */
  heuristic?: (node: UndirectedNode2D, goal: UndirectedNode2D) => number;
};

export type GraphPath<T extends object> = {
  nodes: UndirectedNode2D[];
  edges: UndirectedEdge2D<T>[];
  /** Hop count for BFS; summed interpreted costs for Dijkstra / A*. */
  cost: number;
};

export type ViaWaypoint<T extends object> = UndirectedNode2D | UndirectedEdge2D<T>;

/** Euclidean length; impassable when endpoints coincide. */
export function defaultEdgeCost<T extends object>(
  edge: UndirectedEdge2D<T>,
  _from: UndirectedNode2D,
  _to: UndirectedNode2D,
): number {
  const length = edge.length();
  return length > 0 ? length : Number.POSITIVE_INFINITY;
}

export function isTraversable(cost: number): boolean {
  return Number.isFinite(cost) && cost > 0;
}

/**
 * Interpret callback that only traverses `allowed` edges.
 * Optional `cost` overrides the default Euclidean length.
 */
export function allowEdges<T extends object>(
  allowed: ReadonlySet<string>,
  cost: EdgeInterpretFn<T> = defaultEdgeCost,
): EdgeInterpretFn<T> {
  return (edge, from, to) => {
    if (!allowed.has(edge.id)) return Number.POSITIVE_INFINITY;
    return cost(edge, from, to);
  };
}

/** Default cap on depth-first expansions in {@link searchLongestSimplePath}. */
export const DEFAULT_MAX_EXPANSIONS = 200_000;

/**
 * Longest simple path (no repeated node) from `start` to `goal`, by hop count, then interpreted cost.
 * Uses `interpret` as a filter / length weight — same contract as {@link searchPath}.
 * The search is exponential, so it stops after `maxExpansions` steps and returns the best path so far.
 */
export function searchLongestSimplePath<T extends object>(
  start: UndirectedNode2D,
  goal: UndirectedNode2D,
  options: PathSearchOptions<T> & { maxLength?: number; maxExpansions?: number } = {},
): GraphPath<T> | null {
  const interpret = options.interpret ?? defaultEdgeCost;
  const maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
  let budget = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;

  let best: GraphPath<T> | null = null;

  function consider(nodes: UndirectedNode2D[], edges: UndirectedEdge2D<T>[], cost: number) {
    if (edges.length === 0) return;
    if (!best || edges.length > best.edges.length || (edges.length === best.edges.length && cost > best.cost)) {
      best = { nodes: [...nodes], edges: [...edges], cost };
    }
  }

  function dfs(
    node: UndirectedNode2D,
    nodes: UndirectedNode2D[],
    edges: UndirectedEdge2D<T>[],
    visited: Set<string>,
    cost: number,
  ) {
    if (budget-- <= 0) return;
    if (node.id === goal.id) {
      consider(nodes, edges, cost);
      return;
    }
    if (edges.length >= maxLength) return;

    for (const edge of node.edgesOf<T>()) {
      const next = edge.other(node);
      if (visited.has(next.id)) continue;
      const step = interpret(edge, node, next);
      if (!isTraversable(step)) continue;

      visited.add(next.id);
      nodes.push(next);
      edges.push(edge);
      dfs(next, nodes, edges, visited, cost + step);
      edges.pop();
      nodes.pop();
      visited.delete(next.id);
    }
  }

  dfs(start, [start], [], new Set([start.id]), 0);
  return best;
}

type CameFrom<T extends object> = Map<string, { prev: UndirectedNode2D; edge: UndirectedEdge2D<T> }>;

function reconstructPath<T extends object>(goal: UndirectedNode2D, cameFrom: CameFrom<T>, cost: number): GraphPath<T> {
  const nodes: UndirectedNode2D[] = [goal];
  const edges: UndirectedEdge2D<T>[] = [];
  let current = goal;

  while (cameFrom.has(current.id)) {
    const step = cameFrom.get(current.id)!;
    edges.push(step.edge);
    nodes.push(step.prev);
    current = step.prev;
  }

  nodes.reverse();
  edges.reverse();
  return { nodes, edges, cost };
}

function euclideanHeuristic(a: UndirectedNode2D, b: UndirectedNode2D): number {
  return a.position.distance(b.position);
}

const zeroHeuristic = () => 0;

/** Binary min-heap over `{ id, priority }`. */
class MinHeap {
  private readonly items: { id: string; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(id: string, priority: number): void {
    this.items.push({ id, priority });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): { id: string; priority: number } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent]!.priority <= this.items[index]!.priority) break;
      [this.items[parent], this.items[index]] = [this.items[index]!, this.items[parent]!];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.items.length && this.items[left]!.priority < this.items[best]!.priority) best = left;
      if (right < this.items.length && this.items[right]!.priority < this.items[best]!.priority) best = right;
      if (best === index) break;
      [this.items[best], this.items[index]] = [this.items[index]!, this.items[best]!];
      index = best;
    }
  }
}

/**
 * Shortest path from `start` to `goal`.
 * - `bfs`: fewest hops (interpret only filters blocked edges)
 * - `dijkstra`: min interpreted cost
 * - `astar`: Dijkstra guided by `options.heuristic` (see {@link PathSearchOptions.heuristic})
 */
export function searchPath<T extends object>(
  start: UndirectedNode2D,
  goal: UndirectedNode2D,
  options: PathSearchOptions<T> = {},
): GraphPath<T> | null {
  if (start.id === goal.id) return { nodes: [start], edges: [], cost: 0 };

  const search = options.search ?? 'dijkstra';
  const interpret = options.interpret ?? defaultEdgeCost;

  if (search === 'bfs') return bfs(start, goal, interpret);
  const heuristic =
    search === 'astar' ? (options.heuristic ?? (options.interpret ? zeroHeuristic : euclideanHeuristic)) : zeroHeuristic;
  return weightedSearch(start, goal, interpret, heuristic);
}

function bfs<T extends object>(
  start: UndirectedNode2D,
  goal: UndirectedNode2D,
  interpret: EdgeInterpretFn<T>,
): GraphPath<T> | null {
  const cameFrom: CameFrom<T> = new Map();
  const depth = new Map<string, number>([[start.id, 0]]);
  const queue: UndirectedNode2D[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const currentDepth = depth.get(current.id)!;
    for (const edge of current.edgesOf<T>()) {
      const next = edge.other(current);
      if (depth.has(next.id)) continue;
      const cost = interpret(edge, current, next);
      if (!isTraversable(cost)) continue;
      depth.set(next.id, currentDepth + 1);
      cameFrom.set(next.id, { prev: current, edge });
      if (next.id === goal.id) return reconstructPath(goal, cameFrom, currentDepth + 1);
      queue.push(next);
    }
  }

  return null;
}

function weightedSearch<T extends object>(
  start: UndirectedNode2D,
  goal: UndirectedNode2D,
  interpret: EdgeInterpretFn<T>,
  heuristic: (node: UndirectedNode2D, goal: UndirectedNode2D) => number,
): GraphPath<T> | null {
  const cameFrom: CameFrom<T> = new Map();
  const gScore = new Map<string, number>([[start.id, 0]]);
  const open = new MinHeap();
  open.push(start.id, heuristic(start, goal));
  const nodesById = new Map<string, UndirectedNode2D>([[start.id, start]]);

  while (open.size > 0) {
    const currentEntry = open.pop()!;
    const current = nodesById.get(currentEntry.id);
    if (!current) continue;
    const currentG = gScore.get(current.id) ?? Number.POSITIVE_INFINITY;
    const expectedF = currentG + heuristic(current, goal);
    if (currentEntry.priority > expectedF + 1e-12) continue;
    if (current.id === goal.id) return reconstructPath(goal, cameFrom, currentG);

    for (const edge of current.edgesOf<T>()) {
      const next = edge.other(current);
      const step = interpret(edge, current, next);
      if (!isTraversable(step)) continue;
      const tentative = currentG + step;
      if (tentative >= (gScore.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(next.id, { prev: current, edge });
      gScore.set(next.id, tentative);
      nodesById.set(next.id, next);
      open.push(next.id, tentative + heuristic(next, goal));
    }
  }

  return null;
}

/** Concatenate paths, dropping the duplicated join node. */
export function joinPaths<T extends object>(segments: readonly GraphPath<T>[]): GraphPath<T> | null {
  if (segments.length === 0) return null;
  const first = segments[0]!;
  const nodes = [...first.nodes];
  const edges = [...first.edges];
  let cost = first.cost;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.nodes.length === 0) continue;
    if (nodes.length > 0 && nodes[nodes.length - 1]!.id !== segment.nodes[0]!.id) return null;
    nodes.push(...segment.nodes.slice(1));
    edges.push(...segment.edges);
    cost += segment.cost;
  }

  return { nodes, edges, cost };
}

/** One leg of a via route: search from `from` to `to`, or traverse `forced` directly. */
export type WaypointLeg<T extends object> = {
  from: UndirectedNode2D;
  to: UndirectedNode2D;
  forced?: UndirectedEdge2D<T>;
};

/**
 * Expand a via list into legs between `from` and `to`.
 * An edge waypoint means: arrive at one endpoint, traverse the edge (a forced leg), leave from the other.
 * The endpoint closer (in search cost) to the previous waypoint is chosen as entry.
 */
export function expandWaypoints<T extends object>(
  from: UndirectedNode2D,
  to: UndirectedNode2D,
  via: readonly ViaWaypoint<T>[],
  options: PathSearchOptions<T>,
): WaypointLeg<T>[] | null {
  const legs: WaypointLeg<T>[] = [];
  let current = from;
  const goTo = (next: UndirectedNode2D, forced?: UndirectedEdge2D<T>) => {
    if (next.id !== current.id || forced) legs.push({ from: current, to: next, ...(forced ? { forced } : {}) });
    current = next;
  };

  for (const waypoint of via) {
    if (!(waypoint instanceof UndirectedEdge2D)) {
      goTo(waypoint);
      continue;
    }

    const pathA = searchPath(current, waypoint.a, options);
    const pathB = searchPath(current, waypoint.b, options);
    if (!pathA && !pathB) return null;

    const enterA = !pathB || (pathA !== null && pathA.cost <= pathB.cost);
    goTo(enterA ? waypoint.a : waypoint.b);
    goTo(enterA ? waypoint.b : waypoint.a, waypoint);
  }

  goTo(to);
  return legs;
}
