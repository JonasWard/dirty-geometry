import { describe, expect, test } from 'bun:test';
import {
  evaluateMinkowskiScenario,
  explainDisc,
  explainSum,
  minkowskiScenarios,
} from '../../examples/minkowski2/scenarios';
import type { Boolean2Result } from '../../src/operations/boolean2';

const area = (result: Boolean2Result) =>
  (result.regions ?? []).reduce((sum, r) => sum + r.signedArea(), 0) +
  result.polygons.reduce((sum, p) => sum + p.signedArea(), 0);

describe('Minkowski2 demo scenarios', () => {
  for (const scenario of minkowskiScenarios) {
    test(`${scenario.name}: has area, and grows or shrinks as it should`, () => {
      const result = evaluateMinkowskiScenario(scenario);
      const input = scenario.a.reduce((sum, p) => sum + p.signedArea(), 0);
      expect(area(result)).toBeGreaterThan(0);
      if (scenario.section === 'erode') expect(area(result)).toBeLessThan(input);
      else expect(area(result)).toBeGreaterThan(input);
    });
  }
});

describe('Minkowski2 demo steps', () => {
  const sumSteps = minkowskiScenarios.filter((s) => s.stage === 'pieces');

  for (const scenario of sumSteps) {
    test(`${scenario.name}: pieces cover each shape, one sum per pair`, () => {
      const { piecesA, piecesB, pairs } = explainSum(scenario.a, scenario.b!);
      const total = (loops: readonly { signedArea(): number }[]) => loops.reduce((sum, p) => sum + p.signedArea(), 0);
      expect(total(piecesA)).toBeCloseTo(total(scenario.a), 9);
      expect(total(piecesB)).toBeCloseTo(total(scenario.b!), 9);
      expect([...piecesA, ...piecesB].every((piece) => piece.isConvex())).toBe(true);
      expect(pairs).toHaveLength(piecesA.length * piecesB.length);
      expect(piecesA.length).toBeGreaterThan(1);
    });
  }

  test('one capsule per edge', () => {
    const scenario = minkowskiScenarios.find((s) => s.stage === 'capsules')!;
    expect(explainDisc(scenario.a, scenario.radius!)).toHaveLength(scenario.a[0]!.vertices.length);
  });
});
