import { describe, expect, test } from 'bun:test';
import {
  convexDecompositionScenarios,
  evaluateConvexDecompositionScenario,
  explainSum,
} from '../../examples/convex-decomposition2/scenarios';
import type { Polygon2 } from '../../src/geometry/regions/polygon2';
import type { Boolean2Result } from '../../src/operations/boolean2';

const total = (loops: readonly { signedArea(): number }[]) => loops.reduce((sum, p) => sum + p.signedArea(), 0);
const area = (result: Boolean2Result) => total(result.regions ?? []) + total(result.polygons);

describe('Convex decomposition demo scenarios', () => {
  const examples = convexDecompositionScenarios.filter((s) => s.stage === 'triangles');

  for (const scenario of examples) {
    test(`${scenario.name}: a simple loop of n vertices has n − 2 triangles`, () => {
      const { trianglesA, trianglesB } = explainSum(scenario.a, scenario.b);
      const triangles = (loops: readonly Polygon2[]) => (loops.length === 1 ? loops[0]!.vertices.length - 2 : null);
      if (triangles(scenario.a) !== null) expect(trianglesA).toHaveLength(triangles(scenario.a)!);
      expect(trianglesB).toHaveLength(triangles(scenario.b)!);
    });

    test(`${scenario.name}: pieces cover each shape, one sum per pair`, () => {
      const { piecesA, piecesB, pairs } = explainSum(scenario.a, scenario.b);
      expect(total(piecesA)).toBeCloseTo(total(scenario.a), 9);
      expect(total(piecesB)).toBeCloseTo(total(scenario.b), 9);
      expect([...piecesA, ...piecesB].every((piece) => piece.isConvex())).toBe(true);
      expect(pairs).toHaveLength(piecesA.length * piecesB.length);
      expect(piecesA.length).toBeGreaterThan(1);
    });

    test(`${scenario.name}: the union grows the shape`, () => {
      expect(area(evaluateConvexDecompositionScenario(scenario))).toBeGreaterThan(total(scenario.a));
    });
  }
});
