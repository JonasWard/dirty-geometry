import { describe, expect, test } from 'bun:test';
import { arcScenarioRows } from '../../examples/arcs/scenarios';

describe('arc demo scenarios', () => {
  for (const scenario of arcScenarioRows.flat()) {
    test(`${scenario.name} builds, offsets and answers its query`, () => {
      const geometry = scenario.build();
      expect(geometry.length()).toBeGreaterThan(0);
      for (const distance of scenario.offsets ?? []) {
        const offset =
          geometry.type === 'Arc2'
            ? geometry.offset(distance)
            : geometry.offset(distance, { miterLimit: scenario.miterLimit });
        expect(offset.length()).toBeGreaterThan(0);
      }
      for (const length of scenario.lengthSamples ?? []) {
        expect(length).toBeLessThanOrEqual(geometry.length());
      }
      if (scenario.query) expect(Number.isFinite(geometry.distanceToPoint(scenario.query))).toBe(true);
    });
  }

  test('the rounded rectangle has the area of a rectangle with circular corners', () => {
    const rounded = arcScenarioRows[2].find((s) => s.name === 'Rounded rectangle')!.build();
    expect(rounded.type).toBe('ArcPolygon2');
    if (rounded.type === 'ArcPolygon2') expect(rounded.area()).toBeCloseTo(24 - 4 + Math.PI, 9);
  });
});
