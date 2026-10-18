import { describe, expect, test } from 'bun:test';
import { densing, undensing } from 'densing';
import { Vec2 } from '../../../src/core/vec2';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { defaultRegistry } from '../../../src/io/default-registry';
import type { Definition } from '../../../src/recording/definition';
import { createRecorder } from '../../../src/recording/recorder';
import { evaluateDefinition } from '../../../src/recording/replay';
import { recordPlate } from '../../../examples/definitions/plate';
import { operations, types } from '../../../schema/schema';
import {
  createDefinitionSchema,
  createValueSchema,
  decodeDefinition,
  decodeValue,
  encodeDefinition,
  encodeValue,
  resolvePreset,
} from '../../../schema/dense/definition';

/** Node ids renumbered by position, as decoding does. */
function normalise(definition: Definition) {
  const ids = new Map(definition.nodes.map((node, i) => [node.id, `n${i}`]));
  return JSON.parse(JSON.stringify(definition).replace(/"(n\d+)"/g, (_, id: string) => `"${ids.get(id) ?? id}"`));
}
const roundTrip = (definition: Definition, presets = {}) =>
  decodeDefinition(encodeDefinition(definition, presets)).definition;

function recordMixed(): Definition {
  const rec = createRecorder({ strict: true });
  const { Vec2: V, Line2: L, Polygon2, Boolean2, Interval2, Epsilon, Circle2 } = rec.lib;
  const size = rec.param('size', 4);
  const a = new V(0, 0);
  const b = new V(size, 0);
  const square = new Polygon2([a, b, new V(size, size), new V(0, size)]);
  const other = new Polygon2([new V(2, 2), new V(6, 2), new V(6, 6), new V(2, 6)]);
  rec.output('union', Boolean2.union([square, other], { slack: Epsilon.custom(0.0005) }).polygons);
  rec.output('mesh', rec.lib.ConstrainedDelaunay.triangulate([a, b, new V(1, 3)], [[0, 2], 1]));
  rec.output('ray', new Interval2(-1, Infinity));
  rec.output('point', new L(a, b).evaluate(0.25));
  rec.output('rim', new Circle2(new V(1, 1), 0.5).evaluate(1.047));
  rec.output('outside', V.center(new Vec2(2, 4), a));
  rec.output('hull', rec.lib.helpers.convexHullLoop([a, b, new V(1, 3)]));
  return rec.definition();
}

describe('definition schema', () => {
  test('every schema operation has a node variant, nested along its schema path', () => {
    const { schema } = createDefinitionSchema();
    const root = (schema.fields.find((f) => f.name === 'nodes') as any).items;
    // Each level is a union keyed `type`; a level with one entry is left out, so a path segment may be skipped.
    const reaches = (union: any, path: string[]): boolean => {
      const i = path.findIndex((part) => part in union.variants);
      if (i < 0) return false;
      const fields = union.variants[path[i]!];
      const nested = fields.length === 1 && fields[0].type === 'union' && fields[0].name === path[i];
      return i + 1 === path.length ? !nested : nested && reaches(fields[0], path.slice(i + 1));
    };
    expect(operations.filter((op) => !reaches(root, op.path)).map((op) => op.id)).toEqual([]);
    expect(root.discriminator.options).toEqual(['result', 'bounds', 'core', 'geometry', 'grid', 'operations']);
    expect([root.discriminator.name, root.variants.core[0].name]).toEqual(['type', 'core']);
  });

  test('names are densing names: no markers, no joined paths, no serialised type expressions', () => {
    const { schema } = createDefinitionSchema();
    const names: string[] = [];
    const visit = (f: any): void => {
      if (!f || typeof f !== 'object') return;
      if (typeof f.name === 'string') names.push(f.name);
      if (f.type === 'union') names.push(...f.discriminator.options);
      Object.values(f).forEach((v) => (Array.isArray(v) ? v.forEach(visit) : typeof v === 'object' && visit(v)));
    };
    [...schema.fields, ...(schema.templates ?? [])].forEach(visit);
    expect(names.filter((name) => /[#$/"]|Arg</.test(name))).toEqual([]);
  });

  test('the plate definition round-trips and replays to the same result', () => {
    const definition = recordPlate();
    const decoded = roundTrip(definition, { Radians: '±7@0.0001' });
    expect(decoded.nodes).toHaveLength(definition.nodes.length);
    expect(decoded.params).toEqual(definition.params);
    expect(evaluateDefinition(decoded).outputs.area).toBe(24);
    expect(encodeDefinition(definition).length).toBeLessThan(JSON.stringify(definition).length / 6);
  });

  test('lists, tuples, options, helpers, infinities, angles and outside values round-trip', () => {
    const definition = recordMixed();
    expect(normalise(roundTrip(definition))).toEqual(normalise(definition));
    const replayed = evaluateDefinition(roundTrip(definition)).outputs;
    const original = evaluateDefinition(definition).outputs;
    expect((replayed.mesh as { toJson(): unknown }).toJson()).toEqual(
      (original.mesh as { toJson(): unknown }).toJson(),
    );
  });

  test('numbers off the range grid are snapped; out-of-range numbers throw', () => {
    const rec = createRecorder();
    rec.output('p', new rec.lib.Vec2(1.23456, 2));
    const definition = rec.definition();
    expect(roundTrip(definition).nodes[0]).toMatchObject({ args: [1.23, 2] });
    expect(roundTrip(definition, { Coordinate: '±10@0.0001' }).nodes[0]).toMatchObject({ args: [1.2346, 2] });
    expect(() => encodeDefinition(definition, { Coordinate: '0..1@0.1' })).toThrow();
  });

  test('payloads from another vec2 schema are rejected with a clear error', () => {
    const { schema } = createDefinitionSchema();
    const data = undensing(schema, encodeDefinition(recordPlate())) as Record<string, unknown>;
    expect(() => decodeDefinition(densing(schema, { ...data, stamp: 1 }))).toThrow(/another version/);
  });

  test('operations outside the schema cannot be packed', () => {
    const nodes = [{ id: 'n0', op: 'Vec2.nope' }];
    const definition: Definition = { format: 'vec2-definition', version: 3, params: {}, nodes, outputs: {} };
    expect(() => encodeDefinition(definition)).toThrow(/not in the vec2 schema/);
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
