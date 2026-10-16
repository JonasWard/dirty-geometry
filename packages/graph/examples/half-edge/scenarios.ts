/** Half-edge meshes built with createFromNGon, and the fan of outgoing edges around one vertex. */
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { createFromNGon } from '../../src/he-graph/factory';
import { NGonMesh } from '../../src/he-graph/ngon-mesh';

export type HalfEdgeScenario = {
  name: string;
  vertices: readonly (readonly [number, number])[];
  /** Counter-clockwise vertex loops. */
  faces: readonly (readonly number[])[];
  /** The vertex whose fan is shown. */
  pick: number;
};

/** One directed half-edge, by vertex index, with the face it bounds. */
export type HalfEdgeView = {
  origin: number;
  destination: number;
  face: number;
  boundary: boolean;
  /** Position in `iterateVertex(pick)`, or `null` when the edge does not leave the picked vertex. */
  fanIndex: number | null;
};

export type HalfEdgeScenarioResult = {
  vertices: Vec2[];
  faces: number[][];
  halfEdges: HalfEdgeView[];
  /** Destinations of `iterateVertex(pick)`, in order. */
  fan: number[];
  /** True when rotating counter-clockwise from the last fan edge returns to the first (interior vertex). */
  closedFan: boolean;
  summary: string;
};

const hexagonFan: HalfEdgeScenario = {
  name: 'Interior vertex: fan of 6',
  vertices: [
    [0, 0],
    ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as const),
  ],
  faces: Array.from({ length: 6 }, (_, i) => [0, i + 1, ((i + 1) % 6) + 1]),
  pick: 0,
};

const quadStrip: HalfEdgeScenario = {
  name: 'Boundary vertex: quad strip',
  vertices: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  faces: [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
  ],
  pick: 1,
};

const mixedVertices = [
  [0, 0],
  [2, 0],
  [3, 1.5],
  [2, 3],
  [0, 3],
  [1, 1.5],
] as const;
const mixedFaces = [
  [0, 1, 5],
  [1, 2, 3, 5],
  [5, 3, 4],
  [0, 5, 4],
];

export const halfEdgeScenarios: HalfEdgeScenario[] = [
  hexagonFan,
  quadStrip,
  { name: 'Mixed polygons: interior', vertices: mixedVertices, faces: mixedFaces, pick: 5 },
  { name: 'Mixed polygons: corner', vertices: mixedVertices, faces: mixedFaces, pick: 0 },
];

export function evaluateHalfEdge(scenario: HalfEdgeScenario): HalfEdgeScenarioResult {
  const vertices = scenario.vertices.map(([x, y]) => new Vec2(x, y));
  const faces = scenario.faces.map((face) => [...face]);
  const graph = createFromNGon(new NGonMesh(vertices, faces));

  const faceIndex = new Map(graph.faces.map((face, index) => [face, index]));
  const fanEdges = [...graph.iterateVertex(scenario.pick)];
  const fanPosition = new Map(fanEdges.map((edge, index) => [edge, index]));
  const last = fanEdges[fanEdges.length - 1];
  const closedFan = last !== undefined && last.rotateAroundOrigin() === fanEdges[0];

  const halfEdges: HalfEdgeView[] = graph.halfEdges.map((edge) => ({
    origin: edge.origin,
    destination: edge.destination(),
    face: faceIndex.get(edge.face)!,
    boundary: edge.isBoundary(),
    fanIndex: fanPosition.get(edge) ?? null,
  }));
  const boundary = halfEdges.filter((edge) => edge.boundary).length;

  return {
    vertices,
    faces,
    halfEdges,
    fan: fanEdges.map((edge) => edge.destination()),
    closedFan,
    summary: `${graph.faces.length} faces · ${halfEdges.length} half-edges (${boundary} boundary) · fan of ${scenario.pick}: ${fanEdges.length} ${closedFan ? 'closed' : 'open'}`,
  };
}
