/**
 * ConvexDecomposition2, step by step, as `Minkowski2.sum` uses it: triangulate each shape, merge the triangles
 * into convex pieces, sum every pair of pieces, unite the sums.
 */
import { Epsilon } from '../../src/core/epsilon';
import type { Vec2 } from '../../src/core/vec2';
import type { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Boolean2, type Boolean2Result } from '../../src/operations/boolean2';
import { convexPieces } from '../../src/operations/helpers/minkowski/convex-pieces';
import { Minkowski2 } from '../../src/operations/minkowski2';
import { comb, holedSquare, lShape, smallL, triangle } from '../minkowski2/scenarios';

export type ConvexDecompositionStage = 'triangles' | 'pieces' | 'pairs' | 'union';

export type ConvexDecompositionScenario = {
  name: string;
  stage: ConvexDecompositionStage;
  a: Polygon2[];
  b: Polygon2[];
};

/** One example in four cells: its triangles, its convex pieces, every pair of pieces summed, the union. */
const steps = (name: string, a: Polygon2[], b: Polygon2[]): ConvexDecompositionScenario[] => [
  { name: `${name}: 0 triangles`, stage: 'triangles', a, b },
  { name: `${name}: 1 convex pieces`, stage: 'pieces', a, b },
  { name: `${name}: 2 pair sums`, stage: 'pairs', a, b },
  { name: `${name}: 3 union`, stage: 'union', a, b },
];

export const convexDecompositionScenarioRows = [
  steps('L ⊕ triangle', [lShape], [triangle]),
  steps('Comb ⊕ triangle', [comb], [triangle]),
  steps('Holed square ⊕ L', holedSquare, [smallL]),
] as const;

export const convexDecompositionScenarios: ConvexDecompositionScenario[] = convexDecompositionScenarioRows.flat();

/** The result every stage builds towards: `Minkowski2.sum`. */
export function evaluateConvexDecompositionScenario(scenario: ConvexDecompositionScenario): Boolean2Result {
  return Minkowski2.sum(scenario.a, scenario.b);
}

/** The triangles inside the region of `loops`: the mesh `ConvexDecomposition2.decompose` merges. */
export function triangulate(loops: readonly Polygon2[]): Vec2[][] {
  const mesh = Boolean2.union(loops, { mesh: true }).triMesh;
  if (!mesh) return [];
  return mesh.triangles.map(([i, j, k]) => [mesh.vertices[i]!, mesh.vertices[j]!, mesh.vertices[k]!]);
}

/** Every step of `Minkowski2.sum`: the triangles and convex pieces of each shape, and the sum of every pair. */
export function explainSum(a: readonly Polygon2[], b: readonly Polygon2[]) {
  const piecesA = convexPieces(a, Epsilon.preferIn);
  const piecesB = convexPieces(b, Epsilon.preferIn);
  const pairs = piecesA.flatMap((p, i) =>
    piecesB.map((q, j) => ({ pieceA: i, pieceB: j, sum: Minkowski2.convexSum(p, q) })),
  );
  return { trianglesA: triangulate(a), trianglesB: triangulate(b), piecesA, piecesB, pairs };
}
