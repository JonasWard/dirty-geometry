import { describe, expect, test } from 'bun:test';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { encodeDefinition } from '@dirty-geometry/vec2/schema/dense/definition';
import { choosePresets, quantisationReport, rangeOf } from '../src/playground/presets';
import { decodeAppState, encodeAppState } from '../src/playground/url';

const point = (x: number, y: number): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [],
  cells: [{ name: 'p', expr: { op: 'Vec2.new', args: { x, y } }, output: true }],
});

describe('presets', () => {
  test('numbers off the preset grid are reported', () => {
    expect(quantisationReport(point(1.23456, 2))).toEqual(['Coordinate 1.23456 → 1.23']);
    expect(quantisationReport(point(1.23456, 2), { Coordinate: '±10@0.0001' })).toEqual([
      'Coordinate 1.23456 → 1.2346',
    ]);
    expect(quantisationReport(point(250, 2))).toEqual(['Coordinate 250 → out of range [-100, 100]']);
  });

  test('choosePresets picks the cheapest exact presets', () => {
    const definition = point(3, 7);
    const presets = choosePresets(definition);
    expect(presets.Coordinate).toBe('±10');
    expect(encodeDefinition(definition, presets).length).toBeLessThan(encodeDefinition(definition).length);
    expect(choosePresets(point(0.123, 4)).Coordinate).toBe('±10@0.001');
  });
});

describe('playground URL', () => {
  test('a definition with custom presets survives the URL', () => {
    const state = {
      options: { custom: { Coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } },
      presets: { Coordinate: 'site' },
      definition: point(123.25, -40),
    };
    const decoded = decodeAppState(encodeAppState(state));
    expect(decoded.options).toEqual(state.options);
    expect(decoded.presets).toMatchObject({ Coordinate: 'site' });
    expect(decoded.definition).toEqual(state.definition);
  });
});

describe('slider ranges', () => {
  test("a number type's slider spans its active preset, stepping by its precision", () => {
    expect(rangeOf({}, { Coordinate: '±10@0.01' }, 'Coordinate')).toEqual({ min: -10, max: 10, step: 0.01 });
    expect(rangeOf({}, {}, 'Index')).toEqual({ min: 0, max: 1024, step: 1 });
  });

  test('custom presets count; a type without presets has no slider', () => {
    const options = { custom: { Length: { site: { min: 0, max: 500, precision: 0.25 } } } };
    expect(rangeOf(options, { Length: 'site' }, 'Length')).toEqual({ min: 0, max: 500, step: 0.25 });
    expect(rangeOf({}, {}, 'number')).toBeUndefined();
    expect(rangeOf({}, {}, 'Vec2')).toBeUndefined();
  });
});
