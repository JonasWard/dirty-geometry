import { describe, expect, test } from 'bun:test';
import {
  evaluatePathSearch,
  pathSearchComparisonScenarios,
  pathSearchConstraintScenarios,
} from '../../examples/path-search/scenarios';
import {
  edgeSubgraphCycleScenarios,
  edgeSubgraphPathScenarios,
  edgeSubgraphPeelScenarios,
  evaluateEdgeSubgraph,
} from '../../examples/edge-subgraph/scenarios';
import { evaluateHalfEdge, halfEdgeScenarios } from '../../examples/half-edge/scenarios';

const byName = <T extends { name: string }>(scenarios: readonly T[], name: string): T => {
  const scenario = scenarios.find((candidate) => candidate.name === name);
  if (!scenario) throw new Error(`No scenario ${name}`);
  return scenario;
};

describe('path-search examples', () => {
  const all = [...pathSearchComparisonScenarios, ...pathSearchConstraintScenarios];

  test('BFS takes the 5-hop straight route; weighted searches detour around the slow edges', () => {
    expect(evaluatePathSearch(byName(all, 'BFS: fewest hops')).summary).toBe('cost 5 · 5 hops');
    expect(evaluatePathSearch(byName(all, 'Dijkstra: weighted')).summary).toBe('cost 11.0 · 11 hops');
    expect(evaluatePathSearch(byName(all, 'A*: weighted + Euclidean')).summary).toBe('cost 11.0 · 11 hops');
    expect(evaluatePathSearch(byName(all, 'A*: hop cost, no heuristic')).summary).toBe('cost 5 · 5 hops');
  });

  test('blocked edges, via nodes and forced edges', () => {
    expect(evaluatePathSearch(byName(all, 'BFS around blocked edges')).highlight).not.toContain('h:2,0');
    expect(evaluatePathSearch(byName(all, 'Via node 1,3')).highlight).toContain('h:0,3');
    expect(evaluatePathSearch(byName(all, 'Forced edge v:4,1')).highlight).toContain('v:4,1');
    expect(evaluatePathSearch(byName(all, 'Forced edge is blocked')).found).toBe(false);
  });
});

describe('edge-subgraph examples', () => {
  const all = [...edgeSubgraphCycleScenarios, ...edgeSubgraphPeelScenarios, ...edgeSubgraphPathScenarios];
  const found = (name: string) => evaluateEdgeSubgraph(byName(all, name));

  test('simple cycles and cycle search', () => {
    expect(found('One square').found).toBe(true);
    expect(found('Two disjoint squares').found).toBe(false);
    expect(found('Figure eight').found).toBe(false);
    expect([...found('Find the loop').highlight].sort()).toEqual(['p2-p4', 'p4-p5', 'p5-p2']);
  });

  test('peelSpurs keeps the Y path and the cycle; twoCore drops trees', () => {
    expect(found('Y: peelSpurs').highlight).toHaveLength(5);
    expect(found('Y: twoCore').highlight).toHaveLength(0);
    expect([...found('Cycle + spur: peelSpurs').highlight].sort()).toEqual(['ab', 'bc', 'cd', 'da']);
    expect([...found('Cycle + spur: twoCore').highlight].sort()).toEqual(['ab', 'bc', 'cd', 'da']);
  });

  test('components and leaf-to-leaf paths', () => {
    expect(found('Connected components').groups?.map((group) => group.length)).toEqual([3, 2, 1]);
    expect(found('Shortest between leaves').highlight).toHaveLength(2);
    expect(found('Longest between leaves').highlight).toHaveLength(8);
  });
});

describe('half-edge examples', () => {
  const result = (name: string) => evaluateHalfEdge(byName(halfEdgeScenarios, name));

  test('interior fans close, boundary fans are complete and open', () => {
    const hexagon = result('Interior vertex: fan of 6');
    expect(hexagon.closedFan).toBe(true);
    expect([...hexagon.fan].sort()).toEqual([1, 2, 3, 4, 5, 6]);

    const strip = result('Boundary vertex: quad strip');
    expect(strip.closedFan).toBe(false);
    expect(strip.fan).toEqual([2, 5]);

    expect(result('Mixed polygons: interior').fan).toHaveLength(4);
    expect(result('Mixed polygons: corner').fan).toEqual([1, 5]);
  });

  test('every half-edge of the picked vertex gets a fan position', () => {
    for (const scenario of halfEdgeScenarios) {
      const { halfEdges, fan } = evaluateHalfEdge(scenario);
      const outgoing = halfEdges.filter((edge) => edge.origin === scenario.pick);
      expect(outgoing.map((edge) => edge.fanIndex).sort()).toEqual(fan.map((_, index) => index));
    }
  });
});
