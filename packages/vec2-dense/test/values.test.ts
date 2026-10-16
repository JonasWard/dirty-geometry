import { describe, expect, test } from 'bun:test';
import { schemaFromJson } from 'densing';
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';
import { COORDINATE_PRECISIONS, COORDINATE_SCALES, createNumerics, quantise, resolvePreset } from '../src/numerics';
import { createValueSchema, decodeValue, decodeValueJson, encodeValue } from '../src/value-schema';
import { VALUE_TYPES } from '../src/values';

/** One codec-JSON sample per value type, every number on the default presets' grids. */
const samples: Record<string, unknown> = {
  Vec2: { type: 'Vec2', x: 1.25, y: -3.5 },
  Mat3: { type: 'Mat3', elements: [1, 0, 0, 0, 1, 0, 2.5, -4, 1] },
  Angle: { type: 'Angle', value: Math.PI / 4, domainKind: 'tau', precision: 0.1 },
  Frame2: {
    type: 'Frame2',
    origin: { type: 'Vec2', x: 1, y: 2 },
    xAxis: { type: 'Vec2', x: 0, y: 1 },
    yAxis: { type: 'Vec2', x: -1, y: 0 },
  },
  Epsilon: { type: 'Epsilon', value: -0.00025 },
  Interval2: { type: 'Interval2', min: -2, max: 'Infinity' },
  Aabb2: {
    type: 'Aabb2',
    x: { type: 'Interval2', min: 0, max: 4 },
    y: { type: 'Interval2', min: '-Infinity', max: 3 },
  },
  Line2: { type: 'Line2', from: { type: 'Vec2', x: 0, y: 0 }, to: { type: 'Vec2', x: 3, y: 4 } },
  Ray2: { type: 'Ray2', start: { type: 'Vec2', x: 0, y: 0 }, direction: { type: 'Vec2', x: 1, y: 0 } },
  InfiniteLine2: {
    type: 'InfiniteLine2',
    through: { type: 'Vec2', x: 0, y: 1 },
    direction: { type: 'Vec2', x: 1, y: 1 },
  },
  Hesse2: { type: 'Hesse2', normal: { type: 'Vec2', x: 0, y: 1 }, offset: 2.5 },
  Polyline2: {
    type: 'Polyline2',
    vertices: [
      { type: 'Vec2', x: 0, y: 0 },
      { type: 'Vec2', x: 1, y: 0 },
      { type: 'Vec2', x: 1, y: 1 },
    ],
  },
  Polygon2: {
    type: 'Polygon2',
    vertices: [
      { type: 'Vec2', x: 0, y: 0 },
      { type: 'Vec2', x: 4, y: 0 },
      { type: 'Vec2', x: 0, y: 3 },
    ],
  },
  Circle2: { type: 'Circle2', center: { type: 'Vec2', x: 1, y: 1 }, radius: 0.75 },
  TriMesh2: {
    type: 'TriMesh2',
    vertices: [
      { type: 'Vec2', x: 0, y: 0 },
      { type: 'Vec2', x: 1, y: 0 },
      { type: 'Vec2', x: 0, y: 1 },
    ],
    triangles: [[0, 1, 2]],
  },
  GridCell2: { type: 'GridCell2', i: -3, j: 7 },
  Axis: {
    type: 'Axis',
    kind: 'custom',
    defaultSize: 1,
    sizes: { 2: 0.5, 5: 2 },
    domain: { type: 'Interval2', min: 0, max: 9 },
  },
  Grid2: {
    type: 'Grid2',
    u: { type: 'Axis', kind: 'uniform', size: 0.5 },
    v: { type: 'Axis', kind: 'unit' },
    frame: {
      type: 'Frame2',
      origin: { type: 'Vec2', x: 0, y: 0 },
      xAxis: { type: 'Vec2', x: 1, y: 0 },
      yAxis: { type: 'Vec2', x: 0, y: 1 },
    },
    epsilon: { type: 'Epsilon', value: 0.000001 },
  },
  GridLine2: { type: 'GridLine2', from: { type: 'GridCell2', i: 0, j: 0 }, to: { type: 'GridCell2', i: 4, j: 0 } },
  GridPolyline2: {
    type: 'GridPolyline2',
    vertices: [
      { type: 'GridCell2', i: 0, j: 0 },
      { type: 'GridCell2', i: 0, j: 3 },
    ],
  },
  GridPolygon2: {
    type: 'GridPolygon2',
    vertices: [
      { type: 'GridCell2', i: 0, j: 0 },
      { type: 'GridCell2', i: 3, j: 0 },
      { type: 'GridCell2', i: 3, j: 3 },
    ],
  },
  GridRectangle2: {
    type: 'GridRectangle2',
    bottomLeft: { type: 'GridCell2', i: 0, j: 0 },
    topRight: { type: 'GridCell2', i: 2, j: 5 },
  },
  CellCollection: {
    type: 'CellCollection',
    cells: [
      { type: 'GridCell2', i: 1, j: 1 },
      { type: 'GridCell2', i: 2, j: 1 },
    ],
  },
};

const schema = createValueSchema();

describe('numeric definitions', () => {
  test('coordinates have 5 scales × 2 domains × 5 precisions', () => {
    const coordinate = createNumerics().find((definition) => definition.name === 'coordinate')!;
    expect(Object.keys(coordinate.presets)).toHaveLength(COORDINATE_SCALES.length * 2 * COORDINATE_PRECISIONS.length);
    expect(coordinate.presets['0..10@0.1']).toEqual({ min: 0, max: 10, precision: 0.1 });
    expect(coordinate.presets['±10000@0.0001']).toEqual({ min: -10000, max: 10000, precision: 0.0001 });
  });

  test('custom presets are appended and validated', () => {
    const numerics = createNumerics({ custom: { coordinate: { site: { min: -500, max: 500, precision: 0.05 } } } });
    expect(resolvePreset(numerics, 'coordinate', { coordinate: 'site' })).toMatchObject({ min: -500, max: 500 });
    expect(() => createNumerics({ custom: { coordinate: { '±10@1': { min: 0, max: 1 } } } })).toThrow();
    expect(() => createNumerics({ custom: { angle: { bad: { min: 1, max: 0 } } } })).toThrow();
  });

  test('values snap onto the preset grid; out-of-range values throw', () => {
    const preset = resolvePreset(createNumerics(), 'coordinate');
    expect(quantise(1.234567, preset)).toBe(1.23);
    expect(quantise(0.1 + 0.2, preset)).toBe(0.3);
    expect(() => quantise(250, preset)).toThrow(RangeError);
  });
});

describe('value schema', () => {
  test('there is a template for every registered codec type', () => {
    expect<string[]>([...VALUE_TYPES].sort()).toEqual([...defaultRegistry.types()].sort());
  });

  test('the schema survives JSON text', () => {
    expect(schemaFromJson(JSON.parse(JSON.stringify(schema.schema)))).toEqual(schema.schema);
  });

  test.each(Object.keys(samples))('%s round-trips through a densing string', (type) => {
    const json = samples[type] as Record<string, unknown>;
    const value = defaultRegistry.decode(json) as { toJson(): unknown };
    const text = encodeValue(schema, value);
    const decoded = decodeValue<{ toJson(): unknown }>(schema, text).toJson() as Record<string, unknown>;
    const expected = value.toJson() as Record<string, unknown>;
    if (type === 'Angle') {
      expect(decoded.value as number).toBeCloseTo(expected.value as number, 12);
      expect({ ...decoded, value: 0 }).toEqual({ ...expected, value: 0 });
    } else {
      expect(decoded).toEqual(expected);
    }
  });

  test('presets trade size for range and precision', () => {
    const point = { type: 'Vec2', x: 1234.5, y: 2 };
    expect(() => encodeValue(schema, point)).toThrow(RangeError);
    const wide = encodeValue(schema, point, { coordinate: '±10000@0.1' });
    expect(decodeValueJson(schema, wide)).toEqual(point);
    expect(encodeValue(schema, { type: 'Vec2', x: 1, y: 2 }, { coordinate: '0..10@1' }).length).toBeLessThan(
      encodeValue(schema, { type: 'Vec2', x: 1, y: 2 }, { coordinate: '±10000@0.0001' }).length,
    );
  });
});
