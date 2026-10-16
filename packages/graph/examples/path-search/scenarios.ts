/** Path-search scenarios on one weighted lattice: BFS, Dijkstra and A*, via waypoints, blocked edges. */
import type { UndirectedNode2D } from '../../src/undirected-graph/undirected-node-2d';
import type { EdgeInterpretFn, PathSearchKind, ViaWaypoint } from '../../src/undirected-graph/path-search';
import {
  buildGraph,
  latticeSpec,
  type GraphScenarioResult,
  type GraphSpec,
  type NodeMarker,
  type WeightedEdge,
} from '../shared';

/**
 * 6 × 4 lattice. The horizontal edges between columns 2 and 3 in the lower three rows are slow
 * (weight 9), so the cheapest weighted route from `0,0` to `5,0` detours over the top row.
 */
export const cityGraphSpec: GraphSpec = latticeSpec(6, 4, (id) =>
  id === 'h:2,0' || id === 'h:2,1' || id === 'h:2,2' ? 9 : undefined,
);

/** How an edge is costed: its length, its length times its weight, or one per hop. */
export type PathCostKind = 'length' | 'weighted' | 'hops';

export type PathSearchScenario = {
  name: string;
  search: PathSearchKind;
  cost: PathCostKind;
  from: string;
  to: string;
  via?: readonly ({ node: string } | { edge: string })[];
  /** Edge ids that cannot be traversed. */
  blocked?: readonly string[];
  /** A* only: pass a Euclidean heuristic (admissible here, since every weight is at least 1). */
  euclideanHeuristic?: boolean;
};

const route = { from: '0,0', to: '5,0' } as const;

export const pathSearchComparisonScenarios: PathSearchScenario[] = [
  { name: 'BFS: fewest hops', search: 'bfs', cost: 'hops', ...route },
  { name: 'Dijkstra: weighted', search: 'dijkstra', cost: 'weighted', ...route },
  { name: 'A*: weighted + Euclidean', search: 'astar', cost: 'weighted', euclideanHeuristic: true, ...route },
  { name: 'A*: hop cost, no heuristic', search: 'astar', cost: 'hops', ...route },
];

export const pathSearchConstraintScenarios: PathSearchScenario[] = [
  { name: 'BFS around blocked edges', search: 'bfs', cost: 'hops', blocked: ['h:2,0', 'h:2,1'], ...route },
  { name: 'Via node 1,3', search: 'dijkstra', cost: 'weighted', via: [{ node: '1,3' }], ...route },
  { name: 'Forced edge v:4,1', search: 'dijkstra', cost: 'weighted', via: [{ edge: 'v:4,1' }], ...route },
  {
    name: 'Forced edge is blocked',
    search: 'dijkstra',
    cost: 'weighted',
    via: [{ edge: 'v:4,1' }],
    blocked: ['v:4,1'],
    ...route,
  },
];

function interpretFor(cost: PathCostKind, blocked: ReadonlySet<string>): EdgeInterpretFn<WeightedEdge> {
  return (edge) => {
    if (blocked.has(edge.id)) return Number.POSITIVE_INFINITY;
    if (cost === 'hops') return 1;
    const weight = cost === 'weighted' ? (edge.data.weight ?? 1) : 1;
    return weight > 0 ? edge.length() * weight : Number.POSITIVE_INFINITY;
  };
}

const euclidean = (node: UndirectedNode2D, goal: UndirectedNode2D) => node.position.distance(goal.position);

export function evaluatePathSearch(scenario: PathSearchScenario): GraphScenarioResult {
  const graph = buildGraph(cityGraphSpec);
  const blocked = new Set(scenario.blocked ?? []);
  const via: ViaWaypoint<WeightedEdge>[] = (scenario.via ?? []).map((waypoint) =>
    'node' in waypoint ? graph.getNode(waypoint.node) : graph.getEdge(waypoint.edge),
  );

  const path = graph.path(scenario.from, scenario.to, {
    search: scenario.search,
    interpret: interpretFor(scenario.cost, blocked),
    heuristic: scenario.euclideanHeuristic ? euclidean : undefined,
    via,
  });

  const markers: NodeMarker[] = [
    { nodeId: scenario.from, kind: 'start', label: 'start' },
    { nodeId: scenario.to, kind: 'goal', label: 'goal' },
    ...(scenario.via ?? []).flatMap((waypoint): NodeMarker[] =>
      'node' in waypoint ? [{ nodeId: waypoint.node, kind: 'via', label: 'via' }] : [],
    ),
  ];
  const forced = (scenario.via ?? []).flatMap((waypoint) => ('edge' in waypoint ? [waypoint.edge] : []));
  const slow = graph.edges.filter((edge) => (edge.data.weight ?? 1) > 1).map((edge) => edge.id);

  if (!path) {
    return { found: false, summary: 'no path', highlight: [], blocked: [...blocked], input: forced, markers };
  }

  const hops = path.edges.length;
  const costLabel = scenario.cost === 'hops' ? `cost ${path.cost}` : `cost ${path.cost.toFixed(1)}`;
  return {
    found: true,
    summary: `${costLabel} · ${hops} hop${hops === 1 ? '' : 's'}`,
    highlight: path.edges.map((edge) => edge.id),
    blocked: [...blocked],
    input: scenario.cost === 'weighted' ? [...slow, ...forced] : forced,
    markers,
  };
}
