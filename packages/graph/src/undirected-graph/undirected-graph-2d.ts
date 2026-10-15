import { Vec2, type Vec2Json } from '@dirty-geometry/vec2/core/vec2';
import { UndirectedEdge2D } from './undirected-edge-2d';
import { UndirectedNode2D } from './undirected-node-2d';
import {
  deserialiseEdgeData,
  isEdgeDataRecord,
  serialiseEdgeData,
  type EdgeDataJson,
  type EdgeDataRecord,
} from './edge-data';
import {
  allowEdges,
  defaultEdgeCost,
  expandWaypoints,
  isTraversable,
  joinPaths,
  searchLongestSimplePath,
  searchPath,
  type EdgeInterpretFn,
  type GraphPath,
  type PathSearchKind,
  type PathSearchOptions,
  type ViaWaypoint,
} from './path-search';

export type { EdgeInterpretFn, GraphPath, PathSearchKind, PathSearchOptions, ViaWaypoint };
export { allowEdges, defaultEdgeCost, isTraversable, searchLongestSimplePath, searchPath };

export type UndirectedNode2DJson = {
  id: string;
  position: Vec2Json;
};

export type UndirectedEdge2DJson = {
  id: string;
  a: string;
  b: string;
  data: EdgeDataJson;
};

export type UndirectedGraph2DJson = {
  type: typeof UndirectedGraph2D.type;
  nodes: UndirectedNode2DJson[];
  edges: UndirectedEdge2DJson[];
};

/**
 * Undirected planar graph.
 * Edge payload `T` is a record of JSON values and/or Geometry2 (or Geometry2 arrays).
 *
 * Pathfinding (`bfs` / `dijkstra` / `aStar` / `path`) accepts an optional
 * `interpret` callback that maps an edge (+ payload) to a positive traversal
 * cost; non-finite or ≤ 0 blocks the edge. BFS uses hop count for ranking but
 * still honours `interpret` as a filter.
 */
export class UndirectedGraph2D<T extends object = Record<string, never>> {
  static readonly type = 'UndirectedGraph2D' as const;

  private readonly nodesById = new Map<string, UndirectedNode2D>();
  private readonly edgesById = new Map<string, UndirectedEdge2D<T>>();

  get nodes(): readonly UndirectedNode2D[] {
    return [...this.nodesById.values()];
  }

  get edges(): readonly UndirectedEdge2D<T>[] {
    return [...this.edgesById.values()];
  }

  hasNode(id: string): boolean {
    return this.nodesById.has(id);
  }

  hasEdge(id: string): boolean {
    return this.edgesById.has(id);
  }

  getNode(id: string): UndirectedNode2D {
    const node = this.nodesById.get(id);
    if (!node) throw new Error(`Unknown node ${id}`);
    return node;
  }

  getEdge(id: string): UndirectedEdge2D<T> {
    const edge = this.edgesById.get(id);
    if (!edge) throw new Error(`Unknown edge ${id}`);
    return edge;
  }

  tryGetNode(id: string): UndirectedNode2D | undefined {
    return this.nodesById.get(id);
  }

  tryGetEdge(id: string): UndirectedEdge2D<T> | undefined {
    return this.edgesById.get(id);
  }

  addNode(id: string, position: Vec2): UndirectedNode2D {
    if (this.nodesById.has(id)) throw new Error(`Node ${id} already exists`);
    const node = new UndirectedNode2D(id, position.clone());
    this.nodesById.set(id, node);
    return node;
  }

  /** Add an undirected edge. When `T` is empty, `data` may be omitted. */
  addEdge(id: string, a: string | UndirectedNode2D, b: string | UndirectedNode2D, data?: T): UndirectedEdge2D<T> {
    if (this.edgesById.has(id)) throw new Error(`Edge ${id} already exists`);
    const nodeA = typeof a === 'string' ? this.getNode(a) : a;
    const nodeB = typeof b === 'string' ? this.getNode(b) : b;
    if (!this.nodesById.has(nodeA.id) || !this.nodesById.has(nodeB.id)) {
      throw new Error('Edge endpoints must belong to this graph');
    }
    if (nodeA.id === nodeB.id) throw new Error('Self-loop edges are not supported');

    const payload = (data ?? {}) as T;
    if (!isEdgeDataRecord(payload)) throw new Error(`Edge ${id} data must be a record of JSON / Geometry2 values`);

    const edge = new UndirectedEdge2D(id, nodeA, nodeB, payload);
    this.edgesById.set(id, edge);
    nodeA.addEdge(edge);
    nodeB.addEdge(edge);
    return edge;
  }

  removeEdge(id: string): boolean {
    const edge = this.edgesById.get(id);
    if (!edge) return false;
    edge.a.removeEdge(edge);
    edge.b.removeEdge(edge);
    this.edgesById.delete(id);
    return true;
  }

  removeNode(id: string): boolean {
    const node = this.nodesById.get(id);
    if (!node) return false;
    for (const edge of [...node.edgesOf<T>()]) this.removeEdge(edge.id);
    this.nodesById.delete(id);
    return true;
  }

  toJson(): UndirectedGraph2DJson {
    return {
      type: UndirectedGraph2D.type,
      nodes: this.nodes.map((node) => ({
        id: node.id,
        position: node.position.toJson(),
      })),
      edges: this.edges.map((edge) => ({
        id: edge.id,
        a: edge.a.id,
        b: edge.b.id,
        data: serialiseEdgeData(edge.data as EdgeDataRecord),
      })),
    };
  }

  serialise(): string {
    return JSON.stringify(this.toJson());
  }

  static fromJson<T extends object = Record<string, never>>(data: unknown): UndirectedGraph2D<T> {
    if (!isUndirectedGraph2DJson(data)) throw new Error('Invalid UndirectedGraph2D JSON');

    const graph = new UndirectedGraph2D<T>();
    for (const node of data.nodes) {
      graph.addNode(node.id, new Vec2(node.position.x, node.position.y));
    }
    for (const edge of data.edges) {
      graph.addEdge(edge.id, edge.a, edge.b, deserialiseEdgeData(edge.data) as T);
    }
    return graph;
  }

  static deserialise<T extends object = Record<string, never>>(json: string): UndirectedGraph2D<T> {
    return UndirectedGraph2D.fromJson<T>(JSON.parse(json));
  }

  /** Fewest-hop path (interpret filters blocked edges only). */
  bfs(
    from: string | UndirectedNode2D,
    to: string | UndirectedNode2D,
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    return this.path(from, to, { search: 'bfs', interpret });
  }

  /** Minimum interpreted-cost path. */
  dijkstra(
    from: string | UndirectedNode2D,
    to: string | UndirectedNode2D,
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    return this.path(from, to, { search: 'dijkstra', interpret });
  }

  /** Dijkstra with Euclidean distance-to-goal heuristic. */
  aStar(
    from: string | UndirectedNode2D,
    to: string | UndirectedNode2D,
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    return this.path(from, to, { search: 'astar', interpret });
  }

  /**
   * Path from `from` to `to`, optionally visiting `via` nodes / edges in order.
   * Edge waypoints force traversal of that edge (entry endpoint chosen by cost).
   */
  path(
    from: string | UndirectedNode2D,
    to: string | UndirectedNode2D,
    options: PathSearchOptions<T> & { via?: readonly ViaWaypoint<T>[] } = {},
  ): GraphPath<T> | null {
    const start = this.resolveNode(from);
    const goal = this.resolveNode(to);
    const { via = [], ...searchOptions } = options;

    if (via.length === 0) return searchPath(start, goal, searchOptions);

    const sequence = expandWaypoints(start, goal, via, searchOptions);
    if (!sequence) return null;

    const segments: GraphPath<T>[] = [];
    for (let i = 0; i < sequence.length - 1; i++) {
      const a = sequence[i]!;
      const b = sequence[i + 1]!;
      if (a.id === b.id) continue;

      const direct = this.directEdgeBetween(a, b, via, searchOptions.interpret);
      if (direct) {
        segments.push(direct);
        continue;
      }

      const hop = searchPath(a, b, searchOptions);
      if (!hop) return null;
      segments.push(hop);
    }

    return joinPaths(segments);
  }

  /**
   * Find a simple cycle.
   * - no arg: any cycle in the graph
   * - node: a cycle that contains that node
   * - edge: a cycle that uses that edge (alternate path between endpoints, then close)
   */
  findCycle(
    through?: string | UndirectedNode2D | UndirectedEdge2D<T>,
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    const weight = interpret ?? defaultEdgeCost;

    if (through instanceof UndirectedEdge2D) return this.cycleThroughEdge(through, weight);

    if (through !== undefined) {
      const seed = this.resolveNode(through);
      for (const edge of seed.edgesOf<T>()) {
        const cycle = this.cycleThroughEdge(edge, weight);
        if (cycle) return cycle;
      }
      return null;
    }

    for (const edge of this.edges) {
      const cycle = this.cycleThroughEdge(edge, weight);
      if (cycle) return cycle;
    }
    return null;
  }

  private cycleThroughEdge(edge: UndirectedEdge2D<T>, interpret: EdgeInterpretFn<T>): GraphPath<T> | null {
    const blocked: EdgeInterpretFn<T> = (candidate, from, to) => {
      if (candidate.id === edge.id) return Number.POSITIVE_INFINITY;
      return interpret(candidate, from, to);
    };
    const detour = searchPath(edge.a, edge.b, { search: 'dijkstra', interpret: blocked });
    if (!detour || detour.edges.length === 0) return null;

    const closeCost = interpret(edge, edge.b, edge.a);
    if (!isTraversable(closeCost)) return null;

    return {
      nodes: [...detour.nodes, edge.a],
      edges: [...detour.edges, edge],
      cost: detour.cost + closeCost,
    };
  }

  private directEdgeBetween(
    a: UndirectedNode2D,
    b: UndirectedNode2D,
    via: readonly ViaWaypoint<T>[],
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    const weight = interpret ?? defaultEdgeCost;
    for (const waypoint of via) {
      if (!(waypoint instanceof UndirectedEdge2D)) continue;
      if (!waypoint.hasEndpoint(a) || !waypoint.hasEndpoint(b)) continue;
      const cost = weight(waypoint, a, b);
      if (!isTraversable(cost)) return null;
      return { nodes: [a, b], edges: [waypoint], cost };
    }
    return null;
  }

  private resolveNode(node: string | UndirectedNode2D): UndirectedNode2D {
    return typeof node === 'string' ? this.getNode(node) : node;
  }
}

function isVec2Json(data: unknown): data is Vec2Json {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Vec2Json).type === Vec2.type &&
    typeof (data as Vec2Json).x === 'number' &&
    typeof (data as Vec2Json).y === 'number'
  );
}

function isUndirectedGraph2DJson(data: unknown): data is UndirectedGraph2DJson {
  if (typeof data !== 'object' || data === null) return false;
  const graph = data as UndirectedGraph2DJson;
  if (graph.type !== UndirectedGraph2D.type) return false;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;

  for (const node of graph.nodes) {
    if (typeof node !== 'object' || node === null) return false;
    if (typeof node.id !== 'string' || !isVec2Json(node.position)) return false;
  }

  for (const edge of graph.edges) {
    if (typeof edge !== 'object' || edge === null) return false;
    if (typeof edge.id !== 'string' || typeof edge.a !== 'string' || typeof edge.b !== 'string') return false;
    if (typeof edge.data !== 'object' || edge.data === null || Array.isArray(edge.data)) return false;
  }

  return true;
}
