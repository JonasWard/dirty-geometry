import { describe, expect, test } from 'bun:test';
import { evaluateMinkowskiScenario, minkowskiScenarios } from '../../examples/minkowski2/scenarios';
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
