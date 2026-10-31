import { describe, expect, test } from 'bun:test';
import {
  arcBooleanScenarios,
  evaluateArcBooleanScenario,
  type ArcBooleanScenario,
} from '../../examples/arc-boolean2/scenarios';
import { ArcPolygon2 } from '../../src/geometry/regions/arc-polygon2';
import type { Boolean2Result } from '../../src/operations/boolean2';

const area = (result: Boolean2Result) =>
  (result.regions ?? []).reduce((sum, r) => sum + r.signedArea(), 0) +
  result.polygons.reduce((sum, p) => sum + p.signedArea(), 0);
const byName = (name: string): ArcBooleanScenario => arcBooleanScenarios.find((s) => s.name === name)!;
const exactScenarios = arcBooleanScenarios.filter((s) => s.options?.arcs?.mode !== 'approximate');

describe('arc boolean demo scenarios', () => {
  for (const scenario of exactScenarios) {
    test(`${scenario.name}: exact matches a fine approximation`, () => {
      const exact = evaluateArcBooleanScenario(scenario);
      expect(exact.regions!.length).toBeGreaterThan(0);
      for (const region of exact.regions!) {
        expect(region).toBeInstanceOf(ArcPolygon2);
        expect(region.area()).toBeGreaterThan(0);
      }
      const approximate = evaluateArcBooleanScenario(scenario, {
        arcs: { mode: 'approximate', chordTolerance: 1e-5 },
      });
      expect(Math.abs(area(exact) - area(approximate))).toBeLessThan(1e-3);
    });
  }

  test('structure: holes, splits and islands', () => {
    const holes = (name: string) =>
      evaluateArcBooleanScenario(byName(name)).regions!.filter((r) => r.signedArea() < 0).length;
    const count = (name: string) => evaluateArcBooleanScenario(byName(name)).regions!.length;
    expect(holes('Ring of six discs')).toBe(1);
    expect(holes('Annulus ∩ rounded block')).toBe(1);
    expect(count('Block − curved wall')).toBe(2);
    expect(count('Rounded block − holed scallop')).toBe(3); // the block, the scallop hole, the island inside it
  });

  test('approximate cells converge on the exact one', () => {
    const exact = area(evaluateArcBooleanScenario(byName('Flower ∪ bar · exact')));
    const coarse = Math.abs(area(evaluateArcBooleanScenario(byName('Flower ∪ bar · approximate 0.05'))) - exact);
    const fine = Math.abs(area(evaluateArcBooleanScenario(byName('Flower ∪ bar · approximate 0.005'))) - exact);
    expect(fine).toBeLessThan(coarse);
  });
});
