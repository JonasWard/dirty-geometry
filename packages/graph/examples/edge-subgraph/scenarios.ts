/** Edge-subset helpers: simple cycles, spur peeling, 2-cores, components, cycles and leaf-to-leaf paths. */
import {
  connectedEdgeComponents,
  degreesInEdgeSet,
  findCycleInEdgeSet,
  isSimpleCycleEdgeSet,
  leafNodesInEdgeSet,
  pathBetweenLeaves,
  peelSpurs,
  twoCore,
} from '../../src/undirected-graph/edge-subgraph';
import { buildGraph, latticeSpec, type GraphScenarioResult, type GraphSpec, type NodeMarker } from '../shared';

export type EdgeSubgraphOperation =
  | 'isSimpleCycle'
  | 'peelSpurs'
  | 'twoCore'
  | 'components'
  | 'findCycle'
  | 'shortestBetweenLeaves'
  | 'longestBetweenLeaves';

export type EdgeSubgraphScenario = {
  name: string;
  operation: EdgeSubgraphOperation;
  spec: GraphSpec;
  /** The edge subset the helper works on; defaults to every edge of `spec`. */
  subset?: readonly string[];
};

const square: GraphSpec = {
  nodes: { a: [0, 0], b: [1, 0], c: [1, 1], d: [0, 1] },
  edges: [
    ['ab', 'a', 'b'],
    ['bc', 'b', 'c'],
    ['cd', 'c', 'd'],
    ['da', 'd', 'a'],
  ],
};

const twoSquares: GraphSpec = {
  nodes: { ...square.nodes, e: [2, 0], f: [3, 0], g: [3, 1], h: [2, 1] },
  edges: [...square.edges, ['ef', 'e', 'f'], ['fg', 'f', 'g'], ['gh', 'g', 'h'], ['he', 'h', 'e']],
};

/** Two squares that share the corner `c`. */
const figureEight: GraphSpec = {
  nodes: { ...square.nodes, e: [2, 1], f: [2, 2], g: [1, 2] },
  edges: [...square.edges, ['ce', 'c', 'e'], ['ef', 'e', 'f'], ['fg', 'f', 'g'], ['gc', 'g', 'c']],
};

/** A junction `o` with arms of 2, 1 and 3 edges. */
const yShape: GraphSpec = {
  nodes: { o: [0, 0], a1: [-0.9, -0.5], a2: [-1.8, -1], b1: [0.9, -0.5], c1: [0, 1], c2: [0, 2], c3: [0, 3] },
  edges: [
    ['o-a1', 'o', 'a1'],
    ['a1-a2', 'a1', 'a2'],
    ['o-b1', 'o', 'b1'],
    ['o-c1', 'o', 'c1'],
    ['c1-c2', 'c1', 'c2'],
    ['c2-c3', 'c2', 'c3'],
  ],
};

/** A square with a two-edge spur hanging off `c`. */
const cycleWithSpur: GraphSpec = {
  nodes: { ...square.nodes, s1: [2, 1.5], s2: [3, 2] },
  edges: [...square.edges, ['c-s1', 'c', 's1'], ['s1-s2', 's1', 's2']],
};

/** A triangle, a two-edge path and a lone edge. */
const threeClusters: GraphSpec = {
  nodes: {
    t1: [0, 0],
    t2: [1, 0],
    t3: [0.5, 0.9],
    p1: [2, 0],
    p2: [2.6, 0.8],
    p3: [3.2, 0],
    q1: [0.5, 2],
    q2: [2.5, 2],
  },
  edges: [
    ['t1-t2', 't1', 't2'],
    ['t2-t3', 't2', 't3'],
    ['t3-t1', 't3', 't1'],
    ['p1-p2', 'p1', 'p2'],
    ['p2-p3', 'p2', 'p3'],
    ['q1-q2', 'q1', 'q2'],
  ],
};

/** A path with a triangle loop hanging off `p2`. */
const treeWithLoop: GraphSpec = {
  nodes: { p0: [0, 0], p1: [1, 0], p2: [2, 0], p3: [3, 0], p4: [2.5, 1], p5: [1.5, 1] },
  edges: [
    ['p0-p1', 'p0', 'p1'],
    ['p1-p2', 'p1', 'p2'],
    ['p2-p3', 'p2', 'p3'],
    ['p2-p4', 'p2', 'p4'],
    ['p4-p5', 'p4', 'p5'],
    ['p5-p2', 'p5', 'p2'],
  ],
};

const lattice3 = latticeSpec(3, 3);

export const edgeSubgraphCycleScenarios: EdgeSubgraphScenario[] = [
  { name: 'One square', operation: 'isSimpleCycle', spec: square },
  { name: 'Two disjoint squares', operation: 'isSimpleCycle', spec: twoSquares },
  { name: 'Figure eight', operation: 'isSimpleCycle', spec: figureEight },
  { name: 'Find the loop', operation: 'findCycle', spec: treeWithLoop },
];

export const edgeSubgraphPeelScenarios: EdgeSubgraphScenario[] = [
  { name: 'Y: peelSpurs', operation: 'peelSpurs', spec: yShape },
  { name: 'Y: twoCore', operation: 'twoCore', spec: yShape },
  { name: 'Cycle + spur: peelSpurs', operation: 'peelSpurs', spec: cycleWithSpur },
  { name: 'Cycle + spur: twoCore', operation: 'twoCore', spec: cycleWithSpur },
];

export const edgeSubgraphPathScenarios: EdgeSubgraphScenario[] = [
  { name: 'Connected components', operation: 'components', spec: threeClusters },
  { name: 'Shortest between leaves', operation: 'shortestBetweenLeaves', spec: lattice3, subset: ['h:0,0', 'h:1,0'] },
  { name: 'Longest between leaves', operation: 'longestBetweenLeaves', spec: lattice3, subset: ['h:0,0', 'h:1,0'] },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function evaluateEdgeSubgraph(scenario: EdgeSubgraphScenario): GraphScenarioResult {
  const graph = buildGraph(scenario.spec);
  const subset = scenario.subset ?? scenario.spec.edges.map(([id]) => id);
  const subsetSet = new Set(subset);
  const leaves: NodeMarker[] = leafNodesInEdgeSet(graph, subsetSet).map((node) => ({ nodeId: node.id, kind: 'leaf' }));
  const junctions: NodeMarker[] = [...degreesInEdgeSet(graph, subsetSet)]
    .filter(([, degree]) => degree > 2)
    .map(([nodeId, degree]) => ({ nodeId, kind: 'junction', label: `deg ${degree}` }));

  switch (scenario.operation) {
    case 'isSimpleCycle': {
      const simple = isSimpleCycleEdgeSet(graph, subsetSet);
      const components = connectedEdgeComponents(graph, subset).length;
      return {
        found: simple,
        summary: `isSimpleCycleEdgeSet → ${simple} · ${plural(components, 'component')}`,
        highlight: simple ? subset : [],
        input: subset,
        markers: junctions,
      };
    }
    case 'peelSpurs':
    case 'twoCore': {
      const kept = scenario.operation === 'peelSpurs' ? peelSpurs(graph, subset) : twoCore(graph, subset);
      return {
        found: kept.size > 0,
        summary: `${scenario.operation} keeps ${kept.size} of ${plural(subset.length, 'edge')}`,
        highlight: [...kept],
        input: subset,
        markers: [...leaves, ...junctions],
      };
    }
    case 'components': {
      const groups = connectedEdgeComponents(graph, subset);
      return {
        found: groups.length > 0,
        summary: `${plural(groups.length, 'component')} (${groups.map((group) => group.length).join(' + ')} edges)`,
        highlight: [],
        input: subset,
        groups,
      };
    }
    case 'findCycle': {
      const cycle = findCycleInEdgeSet(graph, subsetSet);
      return {
        found: cycle !== null,
        summary: cycle ? `cycle of ${plural(cycle.edges.length, 'edge')}` : 'no cycle',
        highlight: cycle ? cycle.edges.map((edge) => edge.id) : [],
        input: subset,
        markers: junctions,
      };
    }
    case 'shortestBetweenLeaves':
    case 'longestBetweenLeaves': {
      const allowed = new Set(scenario.spec.edges.map(([id]) => id));
      const longest = scenario.operation === 'longestBetweenLeaves';
      const path = pathBetweenLeaves(graph, subsetSet, allowed, longest);
      return {
        found: path !== null,
        summary: path ? `${longest ? 'longest' : 'shortest'}: ${plural(path.edges.length, 'edge')}` : 'no path',
        highlight: path ? path.edges.map((edge) => edge.id) : [],
        input: subset,
        markers: leaves,
      };
    }
  }
}
