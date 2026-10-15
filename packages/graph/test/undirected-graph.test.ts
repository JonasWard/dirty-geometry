import { describe, expect, test } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { UndirectedGraph2D } from '../src/undirected-graph';

type WallData = { weight: number };

function squareGraph() {
  const graph = new UndirectedGraph2D<WallData>();
  graph.addNode('a', new Vec2(0, 0));
  graph.addNode('b', new Vec2(1, 0));
  graph.addNode('c', new Vec2(1, 1));
  graph.addNode('d', new Vec2(0, 1));
  graph.addEdge('ab', 'a', 'b', { weight: 1 });
  graph.addEdge('bc', 'b', 'c', { weight: 1 });
  graph.addEdge('cd', 'c', 'd', { weight: 1 });
  graph.addEdge('da', 'd', 'a', { weight: 1 });
  graph.addEdge('ac', 'a', 'c', { weight: 10 });
  return graph;
}

function byWeight(edge: { data: WallData }): number {
  return edge.data.weight;
}

describe('UndirectedGraph2D', () => {
  test('builds connectivity between nodes and edges', () => {
    const graph = squareGraph();
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(5);
    expect(
      graph
        .getNode('a')
        .neighbors()
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'c', 'd']);
    expect(graph.getEdge('ab').other(graph.getNode('a')).id).toBe('b');
  });

  test('bfs finds fewest hops', () => {
    const graph = squareGraph();
    const path = graph.bfs('a', 'c');
    expect(path).not.toBeNull();
    expect(path!.edges).toHaveLength(1);
    expect(path!.edges[0]!.id).toBe('ac');
    expect(path!.cost).toBe(1);
  });

  test('dijkstra respects edge interpret cost', () => {
    const graph = squareGraph();
    const path = graph.dijkstra('a', 'c', (edge) => byWeight(edge));
    expect(path).not.toBeNull();
    expect(path!.edges.map((e) => e.id)).toEqual(['ab', 'bc']);
    expect(path!.cost).toBe(2);
  });

  test('aStar matches dijkstra on Euclidean costs', () => {
    const graph = squareGraph();
    const dijkstra = graph.dijkstra('a', 'c');
    const astar = graph.aStar('a', 'c');
    expect(astar).not.toBeNull();
    expect(dijkstra).not.toBeNull();
    expect(astar!.cost).toBeCloseTo(dijkstra!.cost, 10);
    expect(astar!.edges.map((e) => e.id)).toEqual(dijkstra!.edges.map((e) => e.id));
  });

  test('interpret can block edges', () => {
    const graph = squareGraph();
    const path = graph.dijkstra('a', 'c', (edge) => (edge.id === 'ac' ? Number.POSITIVE_INFINITY : edge.length()));
    expect(path).not.toBeNull();
    expect(path!.edges.map((e) => e.id)).toEqual(['ab', 'bc']);
  });

  test('path visits optional via nodes in order', () => {
    const graph = squareGraph();
    const path = graph.path('a', 'c', {
      via: [graph.getNode('d'), graph.getNode('b')],
      search: 'bfs',
    });
    expect(path).not.toBeNull();
    expect(path!.nodes.map((n) => n.id)).toEqual(['a', 'd', 'c', 'b', 'c']);
  });

  test('path can force traversal of via edges', () => {
    const graph = squareGraph();
    const path = graph.path('a', 'c', {
      via: [graph.getEdge('da')],
      search: 'bfs',
      interpret: (edge) => (edge.id === 'ac' ? Number.POSITIVE_INFINITY : 1),
    });
    expect(path).not.toBeNull();
    expect(path!.edges.some((e) => e.id === 'da')).toBe(true);
    expect(path!.nodes[0]!.id).toBe('a');
    expect(path!.nodes.at(-1)!.id).toBe('c');
  });

  test('findCycle returns a closed loop', () => {
    const graph = squareGraph();
    const cycle = graph.findCycle();
    expect(cycle).not.toBeNull();
    expect(cycle!.nodes.length).toBeGreaterThanOrEqual(4);
    expect(cycle!.nodes[0]!.id).toBe(cycle!.nodes.at(-1)!.id);
    expect(cycle!.edges.length).toBe(cycle!.nodes.length - 1);
  });

  test('findCycle through an edge uses that edge', () => {
    const graph = squareGraph();
    const edge = graph.getEdge('ac');
    const cycle = graph.findCycle(edge, (e) => e.data.weight);
    expect(cycle).not.toBeNull();
    expect(cycle!.edges.some((e) => e.id === 'ac')).toBe(true);
  });

  test('findCycle on a tree returns null', () => {
    const graph = new UndirectedGraph2D();
    graph.addNode('a', new Vec2(0, 0));
    graph.addNode('b', new Vec2(1, 0));
    graph.addNode('c', new Vec2(2, 0));
    graph.addEdge('ab', 'a', 'b');
    graph.addEdge('bc', 'b', 'c');
    expect(graph.findCycle()).toBeNull();
  });

  test('removeNode clears incident edges', () => {
    const graph = squareGraph();
    graph.removeNode('c');
    expect(graph.hasNode('c')).toBe(false);
    expect(graph.hasEdge('bc')).toBe(false);
    expect(graph.hasEdge('ac')).toBe(false);
    expect(graph.hasEdge('cd')).toBe(false);
  });

  test('toJson / fromJson round-trips nodes, edges, and payloads', () => {
    const graph = squareGraph();
    const restored = UndirectedGraph2D.fromJson<{ weight: number }>(graph.toJson());

    expect(restored.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(restored.edges).toHaveLength(5);
    expect(restored.getEdge('ac').data).toEqual({ weight: 10 });
    expect(restored.getNode('a').position).toEqual(new Vec2(0, 0));
    expect(
      restored
        .getNode('a')
        .neighbors()
        .map((n) => n.id)
        .sort(),
    ).toEqual(['b', 'c', 'd']);

    const path = restored.dijkstra('a', 'c', (edge) => edge.data.weight);
    expect(path!.edges.map((e) => e.id)).toEqual(['ab', 'bc']);
  });

  test('serialise / deserialise round-trips through JSON text', () => {
    const graph = squareGraph();
    const restored = UndirectedGraph2D.deserialise<{ weight: number }>(graph.serialise());
    expect(restored.toJson()).toEqual(graph.toJson());
  });

  test('toJson / fromJson round-trips Geometry2 edge payloads', () => {
    type Payload = { weight: number; axis: Line2 };
    const graph = new UndirectedGraph2D<Payload>();
    graph.addNode('a', new Vec2(0, 0));
    graph.addNode('b', new Vec2(2, 0));
    graph.addEdge('ab', 'a', 'b', { weight: 3, axis: new Line2(new Vec2(0, 0), new Vec2(1, 0)) });

    const restored = UndirectedGraph2D.fromJson<Payload>(graph.toJson());
    expect(restored.getEdge('ab').data.weight).toBe(3);
    expect(restored.getEdge('ab').data.axis).toBeInstanceOf(Line2);
    expect(restored.getEdge('ab').data.axis.toJson()).toEqual(graph.getEdge('ab').data.axis.toJson());
  });
  test('fromJson rejects invalid payloads', () => {
    expect(() => UndirectedGraph2D.fromJson({ type: 'nope', nodes: [], edges: [] })).toThrow();
  });
});
