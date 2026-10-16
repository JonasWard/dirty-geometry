import { Vec2, type Vec2Json } from '@dirty-geometry/vec2/core/vec2';
import { UndirectedEdge2D } from './undirected-edge-2d';
import { UndirectedNode2D } from './undirected-node-2d';
import { jsonEdgeData, type EdgeDataCodec, type EdgeDataJson } from './edge-data';
import {
  defaultEdgeCost,
  expandWaypoints,
  isTraversable,
  joinPaths,
  searchPath,
  type EdgeInterpretFn,
  type GraphPath,
  type PathSearchOptions,
  type ViaWaypoint,
} from './path-search';

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

export type UndirectedGraph2DOptions<T extends object> = {
  /** Validates, writes and reads edge payloads; defaults to plain JSON records ({@link jsonEdgeData}). */
  codec?: EdgeDataCodec<T>;
};

/**
 * Undirected planar graph.
 * Edge payload `T` is checked and serialised by the graph's {@link EdgeDataCodec} (plain JSON by
 * default; pass `geometryEdgeData()` from `undirected-graph/geometry-edge-data` for vec2 geometry).
 *
 * Pathfinding (`bfs` / `dijkstra` / `aStar` / `path`) accepts an optional
 * `interpret` callback that maps an edge (+ payload) to a positive traversal
 * cost; non-finite or ≤ 0 blocks the edge. BFS uses hop count for ranking but
 * still honours `interpret` as a filter.
 */
export class UndirectedGraph2D<T extends object = Record<string, never>> {
  static readonly type = 'UndirectedGraph2D' as const;

  private readonly codec: EdgeDataCodec<T>;
  private readonly nodesById = new Map<string, UndirectedNode2D>();
  private readonly edgesById = new Map<string, UndirectedEdge2D<T>>();
  private nodeList: readonly UndirectedNode2D[] | null = null;
  private edgeList: readonly UndirectedEdge2D<T>[] | null = null;

  constructor(options: UndirectedGraph2DOptions<T> = {}) {
    this.codec = options.codec ?? jsonEdgeData<T>();
  }

  /** All nodes; the same frozen array is returned until the graph changes. */
  get nodes(): readonly UndirectedNode2D[] {
    return (this.nodeList ??= Object.freeze([...this.nodesById.values()]));
  }

  /** All edges; the same frozen array is returned until the graph changes. */
  get edges(): readonly UndirectedEdge2D<T>[] {
    return (this.edgeList ??= Object.freeze([...this.edgesById.values()]));
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
    this.nodeList = null;
    return node;
  }

  /** Add an undirected edge. `data` may be omitted only when `T` has no required fields. */
  addEdge(
    id: string,
    a: string | UndirectedNode2D,
    b: string | UndirectedNode2D,
    ...data: Record<string, never> extends T ? [data?: T] : [data: T]
  ): UndirectedEdge2D<T> {
    if (this.edgesById.has(id)) throw new Error(`Edge ${id} already exists`);
    const nodeA = typeof a === 'string' ? this.getNode(a) : a;
    const nodeB = typeof b === 'string' ? this.getNode(b) : b;
    if (this.nodesById.get(nodeA.id) !== nodeA || this.nodesById.get(nodeB.id) !== nodeB) {
      throw new Error('Edge endpoints must belong to this graph');
    }
    if (nodeA.id === nodeB.id) throw new Error('Self-loop edges are not supported');

    const payload = (data[0] ?? {}) as T;
    if (!this.codec.isValid(payload)) throw new Error(`Edge ${id} data is not accepted by the graph's edge-data codec`);

    const edge = new UndirectedEdge2D(id, nodeA, nodeB, payload);
    this.edgesById.set(id, edge);
    this.edgeList = null;
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
    this.edgeList = null;
    return true;
  }

  removeNode(id: string): boolean {
    const node = this.nodesById.get(id);
    if (!node) return false;
    for (const edge of [...node.edgesOf<T>()]) this.removeEdge(edge.id);
    this.nodesById.delete(id);
    this.nodeList = null;
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
        data: this.codec.toJson(edge.data),
      })),
    };
  }

  serialise(): string {
    return JSON.stringify(this.toJson());
  }

  static fromJson<T extends object = Record<string, never>>(
    data: unknown,
    options: UndirectedGraph2DOptions<T> = {},
  ): UndirectedGraph2D<T> {
    if (!isUndirectedGraph2DJson(data)) throw new Error('Invalid UndirectedGraph2D JSON');

    const graph = new UndirectedGraph2D<T>(options);
    for (const node of data.nodes) {
      graph.addNode(node.id, new Vec2(node.position.x, node.position.y));
    }
    for (const edge of data.edges) {
      graph.addEdge(edge.id, edge.a, edge.b, ...([graph.codec.fromJson(edge.data)] as [T]));
    }
    return graph;
  }

  static deserialise<T extends object = Record<string, never>>(
    json: string,
    options: UndirectedGraph2DOptions<T> = {},
  ): UndirectedGraph2D<T> {
    return UndirectedGraph2D.fromJson<T>(JSON.parse(json), options);
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

  /** A* search; Euclidean heuristic with the default cost, plain Dijkstra with a custom `interpret`. */
  aStar(
    from: string | UndirectedNode2D,
    to: string | UndirectedNode2D,
    interpret?: EdgeInterpretFn<T>,
  ): GraphPath<T> | null {
    return this.path(from, to, { search: 'astar', interpret });
  }

  /**
   * Path from `from` to `to`, optionally visiting `via` nodes / edges in order.
   * Edge waypoints force traversal of that edge (entry endpoint chosen by cost); when `interpret`
   * blocks a forced edge there is no path. With `search: 'bfs'` a forced edge counts as one hop.
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

    const legs = expandWaypoints(start, goal, via, searchOptions);
    if (!legs) return null;
    if (legs.length === 0) return { nodes: [start], edges: [], cost: 0 };

    const weight = searchOptions.interpret ?? defaultEdgeCost;
    const segments: GraphPath<T>[] = [];
    for (const { from: a, to: b, forced } of legs) {
      if (forced) {
        const cost = weight(forced, a, b);
        if (!isTraversable(cost)) return null;
        segments.push({ nodes: [a, b], edges: [forced], cost: searchOptions.search === 'bfs' ? 1 : cost });
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
