import { describe, expect, test } from 'bun:test';
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { isSimpleCycleEdgeSet, peelSpurs, twoCore, UndirectedGraph2D } from '../src';

/** Graph from `[id, a, b]` edges; node positions only need to be distinct. */
function graphOf(edges: [string, string, string][]) {
  const graph = new UndirectedGraph2D();
  for (const [, a, b] of edges) {
    for (const id of [a, b]) {
      if (!graph.hasNode(id)) graph.addNode(id, new Vec2(graph.nodes.length, graph.nodes.length % 3));
    }
  }
  for (const [id, a, b] of edges) graph.addEdge(id, a, b);
  return graph;
}

const triangle = (prefix: string): [string, string, string][] => [
  [`${prefix}1`, `${prefix}a`, `${prefix}b`],
  [`${prefix}2`, `${prefix}b`, `${prefix}c`],
  [`${prefix}3`, `${prefix}c`, `${prefix}a`],
];

describe('isSimpleCycleEdgeSet (G3)', () => {
  test('accepts a single cycle', () => {
    const graph = graphOf(triangle('t'));
    expect(isSimpleCycleEdgeSet(graph, new Set(['t1', 't2', 't3']))).toBe(true);
  });

  test('rejects two disjoint cycles', () => {
    const graph = graphOf([...triangle('p'), ...triangle('q')]);
    expect(isSimpleCycleEdgeSet(graph, new Set(['p1', 'p2', 'p3', 'q1', 'q2', 'q3']))).toBe(false);
  });

  test('rejects ids that are not in the graph', () => {
    const graph = graphOf(triangle('t'));
    expect(isSimpleCycleEdgeSet(graph, new Set(['t1', 't2', 't3', 'missing']))).toBe(false);
  });
});

describe('peelSpurs (G4)', () => {
  // Y: centre c with arms of 1, 2 and 3 edges.
  const y: [string, string, string][] = [
    ['a1', 'c', 'a'],
    ['b1', 'c', 'b1n'],
    ['b2', 'b1n', 'b'],
    ['d1', 'c', 'd1n'],
    ['d2', 'd1n', 'd2n'],
    ['d3', 'd2n', 'd'],
  ];

  test('keeps the path through the two longest arms of a Y', () => {
    const graph = graphOf(y);
    expect(
      [
        ...peelSpurs(
          graph,
          y.map(([id]) => id),
        ),
      ].sort(),
    ).toEqual(['b1', 'b2', 'd1', 'd2', 'd3']);
  });

  test('removes a spur hanging off a cycle', () => {
    const edges: [string, string, string][] = [...triangle('t'), ['s1', 'ta', 'x'], ['s2', 'x', 'y']];
    const graph = graphOf(edges);
    expect(
      [
        ...peelSpurs(
          graph,
          edges.map(([id]) => id),
        ),
      ].sort(),
    ).toEqual(['t1', 't2', 't3']);
  });

  test('leaves a graph without leaves alone', () => {
    const theta: [string, string, string][] = [
      ['e1', 'a', 'b'],
      ['e2', 'a', 'm'],
      ['e3', 'm', 'b'],
      ['e4', 'a', 'n'],
      ['e5', 'n', 'b'],
    ];
    const graph = graphOf(theta);
    expect(
      peelSpurs(
        graph,
        theta.map(([id]) => id),
      ).size,
    ).toBe(5);
  });

  test('twoCore drops every tree part', () => {
    const graph = graphOf(y);
    expect(
      twoCore(
        graph,
        y.map(([id]) => id),
      ).size,
    ).toBe(0);
    const edges: [string, string, string][] = [...triangle('t'), ['s1', 'ta', 'x']];
    expect(
      [
        ...twoCore(
          graphOf(edges),
          edges.map(([id]) => id),
        ),
      ].sort(),
    ).toEqual(['t1', 't2', 't3']);
  });
});
