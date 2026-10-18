import { describe, expect, test } from 'bun:test';
import { densing, undensing } from 'densing';
import { Vec2 } from '../../../src/core/vec2';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { defaultRegistry } from '../../../src/io/default-registry';
import type { Definition } from '../../../src/recording/definition';
import { evaluate } from '../../../src/recording/evaluate';
import { fromV3 } from '../../../src/recording/migrate';
import type { DefinitionV3 } from '../../../src/recording/v3';
import { recordPlate } from '../../../examples/definitions/plate';
import { operations, types } from '../../../schema/schema';
import { groupKey } from '../../../schema/typing';
import {
  createDefinitionSchema,
  createValueSchema,
  decodeDefinition,
  decodeValue,
  encodeDefinition,
  encodeValue,
  resolvePreset,
} from '../../../schema/dense/definition';
import { arbitraryDefinition } from '../../recording/arbitrary';
import v3Fixtures from './v3/fixtures.json';

const fixtures = v3Fixtures as unknown as { name: string; dense: string; definition: DefinitionV3 }[];
const roundTrip = (definition: Definition, presets = {}) =>
  decodeDefinition(encodeDefinition(definition, presets)).definition;
const def = (cells: Definition['cells'], inputs: Definition['inputs'] = []): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs,
  functions: [],
  cells,
});
const point = (x: number, y: number) => ({ op: 'Vec2.new', args: { x, y } });

describe('definition schema', () => {
  const { schema } = createDefinitionSchema();
  const templates = schema.templates as any[];

  test('is well formed: references in range, unique template names, a variant for every option', () => {
    const problems: string[] = [];
    const names = new Set<string>();
    const reached = new Set<number>();
    const visit = (f: any, at: string): void => {
      if (!f || typeof f !== 'object') return;
      if (f.type === 'reference') {
        if (!templates[f.ref]) problems.push(`${at}: no template ${f.ref}`);
        else if (!reached.has(f.ref)) {
          reached.add(f.ref);
          visit(templates[f.ref], `templates[${f.ref}]`);
        }
      }
      if (f.type === 'reference_numeric' && !schema.definitions!.some((d) => d.name === f.ref))
        problems.push(`${at}: no number type ${f.ref}`);
      if (f.type === 'union')
        for (const option of f.discriminator.options)
          if (!(option in f.variants)) problems.push(`${at}: ${f.name} has no variant ${option}`);
      for (const [key, value] of Object.entries(f))
        if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${at}.${key}[${i}]`));
        else if (typeof value === 'object') visit(value, `${at}.${key}`);
    };
    schema.fields.forEach((f, i) => visit(f, `fields[${i}]`));
    for (const t of templates) {
      if (names.has(t.name)) problems.push(`template ${t.name} appears twice`);
      names.add(t.name);
    }
    expect(problems).toEqual([]);
    expect(templates.length - reached.size).toBe(0);
  });

  test('every operation can be packed where its result type is expected', () => {
    const missing = operations.filter((op) => {
      const group = `${groupKey(op.returns)} call`;
      const calls = templates.find((t) => t.name === group);
      const own = templates.find((t) => t.name === (typeof op.returns === 'string' ? op.returns : ''));
      return !calls?.variants[op.id] || (own && !own.variants[group]);
    });
    expect(missing.map((op) => op.id)).toEqual([]);
  });

  test('an expression only offers the operations whose result fits', () => {
    const vec2 = templates.find((t) => t.name === 'Vec2');
    const calls = Object.keys(vec2.variants).filter((key) => key.endsWith(' call'));
    expect(calls).toEqual(['Vec2 call']);
    const coordinate = templates.find((t) => t.name === 'Coordinate');
    expect(Object.keys(coordinate.variants)).toEqual(expect.arrayContaining(['number', 'math', 'neg', 'number call']));
  });

  test('names are densing names: no markers, no joined paths', () => {
    const names: string[] = [];
    const visit = (f: any): void => {
      if (!f || typeof f !== 'object') return;
      if (typeof f.name === 'string') names.push(f.name);
      Object.values(f).forEach((v) => (Array.isArray(v) ? v.forEach(visit) : typeof v === 'object' && visit(v)));
    };
    [...schema.fields, ...templates].forEach(visit);
    expect(names.filter((name) => /[#$/"]|Arg</.test(name))).toEqual([]);
  });
});

describe('definitions', () => {
  test.each(fixtures.filter((f) => f.dense).map((f) => [f.name, f] as const))(
    '%s (migrated) round-trips, packs smaller than version 3 and evaluates the same',
    (_, fixture) => {
      const definition = fromV3(fixture.definition);
      const encoded = encodeDefinition(definition);
      expect(decodeDefinition(encoded).definition).toEqual(definition);
      expect(encoded.length).toBeLessThan(fixture.dense.length);
    },
  );

  test('the plate packs to a seventh of its JSON and replays', () => {
    const definition = fromV3(recordPlate());
    const decoded = roundTrip(definition, { Radians: '±7@0.0001' });
    expect(evaluate(decoded).outputs.area).toBe(24);
    expect(encodeDefinition(definition).length).toBeLessThan(JSON.stringify(definition).length / 7);
  });

  test('random well-typed definitions round-trip', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const definition = arbitraryDefinition(seed);
      expect({ seed, definition: roundTrip(definition) }).toEqual({ seed, definition });
    }
  });

  test('numbers off the range grid are snapped; out-of-range numbers throw', () => {
    const definition = def([{ name: 'p', expr: point(1.23456, 2) }]);
    expect(roundTrip(definition).cells[0]!.expr).toEqual(point(1.23, 2));
    expect(roundTrip(definition, { Coordinate: '±10@0.0001' }).cells[0]!.expr).toEqual(point(1.2346, 2));
    expect(() => encodeDefinition(definition, { Coordinate: '0..1@0.1' })).toThrow();
  });

  test('arithmetic literals pack as the number type of their slot', () => {
    const angle = {
      op: 'Circle2.evaluate',
      self: { value: { type: 'Circle2', center: { type: 'Vec2', x: 0, y: 0 }, radius: 1 } },
      args: { theta: { math: '*', args: [0.12345, 2] } },
    };
    const decoded = roundTrip(def([{ name: 'p', expr: angle as never }]));
    expect((decoded.cells[0]!.expr as any).args.theta).toEqual({ math: '*', args: [0.123, 2] });
  });

  test('expressions that do not fit their slot cannot be packed', () => {
    expect(() => encodeDefinition(def([{ name: 'p', expr: { op: 'Vec2.new', args: { x: point(1, 2) } } }]))).toThrow(
      /Vec2.new \(it returns Vec2\)/,
    );
    expect(() => encodeDefinition(def([{ name: 'p', expr: { op: 'Vec2.nope' } }]))).toThrow(/not a vec2 operation/);
    expect(() => encodeDefinition(def([{ name: 'p', expr: { ref: 'q' } }]))).toThrow(/not defined/);
  });

  test('declared cell types are kept', () => {
    const definition = def([{ name: 'r', expr: 2, type: 'Length' }], [{ name: 'w', type: 'Coordinate', value: 3 }]);
    expect(roundTrip(definition)).toEqual(definition);
  });

  test('payloads from another vec2 schema are rejected with a clear error', () => {
    const { schema } = createDefinitionSchema();
    const definition = fromV3(recordPlate());
    const data = undensing(schema, encodeDefinition(definition)) as Record<string, unknown>;
    expect(() => decodeDefinition(densing(schema, { ...data, stamp: 1 }))).toThrow(/another version/);
  });
});

/** One codec-JSON sample per value type, every number on the default presets' grids. */
const samples: Record<string, unknown> = {
  Vec2: { type: 'Vec2', x: 1.25, y: -3.5 },
  Mat3: { type: 'Mat3', elements: [1, 0, 0, 0, 1, 0, 2.5, -4, 1] },
  Angle: { type: 'Angle', value: 0.785, domainKind: 'tau', precision: 0.1 },
  Frame2: {
    type: 'Frame2',
    origin: { type: 'Vec2', x: 1, y: 2 },
    xAxis: { type: 'Vec2', x: 0, y: 1 },
    yAxis: { type: 'Vec2', x: -1, y: 0 },
  },
  Epsilon: { type: 'Epsilon', value: -0.00025 },
  Interval2: { type: 'Interval2', min: -2, max: null },
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
  // Older JSON: `defaultSize` and a sizes record still decode.
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

describe('value schema', () => {
  const schema = createValueSchema();

  test('every registered codec type is a MathJson member', () => {
    const tags = (types.MathJson as { or: string[] }).or.map((name) => name.replace(/Json$/, ''));
    expect(tags.sort()).toEqual([...defaultRegistry.types()].sort());
  });

  test.each(Object.keys(samples))('%s goes through densing as its toJson()', (type) => {
    const value = defaultRegistry.decode(samples[type]) as { toJson(): Record<string, unknown> };
    const decoded = decodeValue(encodeValue(value, {}, schema));
    expect((defaultRegistry.decode(decoded) as { toJson(): unknown }).toJson()).toEqual(value.toJson());
  });

  test('nested JSON types are packed untagged and get their tag back', () => {
    const line = new Line2(new Vec2(0, 0), new Vec2(3, 4));
    expect(decodeValue(encodeValue(line, {}, schema))).toEqual(line.toJson());
  });

  test('a Length cannot be negative', () => {
    const circle = (radius: number) => ({
      toJson: () => ({ type: 'Circle2', center: { type: 'Vec2', x: 0, y: 0 }, radius }),
    });
    expect(() => encodeValue(circle(1), {}, schema)).not.toThrow();
    expect(() => encodeValue(circle(-1), {}, schema)).toThrow();
  });

  test('ranges trade size for extent and precision', () => {
    const point = new Vec2(1234.5, 2);
    expect(() => encodeValue(point, {}, schema)).toThrow();
    expect(decodeValue(encodeValue(point, { Coordinate: '±10000@0.1' }, schema))).toEqual(point.toJson());
    const small = encodeValue(new Vec2(1, 2), { Coordinate: '0..10@1' }, schema);
    expect(small.length).toBeLessThan(encodeValue(new Vec2(1, 2), { Coordinate: '±10000@0.0001' }, schema).length);
  });

  test('custom ranges are added to their number type; refinements clamp their parent', () => {
    const { schema } = createDefinitionSchema({
      custom: { Coordinate: { site: { min: -500, max: 500, precision: 0.05 } } },
    });
    expect(resolvePreset(schema.definitions!, 'Coordinate', { Coordinate: 'site' })).toMatchObject({
      min: -500,
      max: 500,
    });
    expect(resolvePreset(schema.definitions!, 'Coordinate').name).toBe('±100@0.01');
    expect(resolvePreset(schema.definitions!, 'Length').name).toBe('0..100@0.01');
    expect(resolvePreset(schema.definitions!, 'Index').name).toBe('0..1024');
  });
});
