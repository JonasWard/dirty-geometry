import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Interval2 } from '../../src/bounds/interval2';
import { Angle } from '../../src/core/angle';
import { Epsilon } from '../../src/core/epsilon';
import { Frame2 } from '../../src/core/frame2';
import { Mat3 } from '../../src/core/mat3';
import { Vec2 } from '../../src/core/vec2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Hesse2 } from '../../src/geometry/primitives/hesse2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Axis } from '../../src/grid/core/grid-axis';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { Grid2 } from '../../src/grid/core/grid2';
import { GridCell2Collection } from '../../src/grid/regions/grid-cell2-collection';
import { GridLine2 } from '../../src/grid/regions/grid-line2';
import { GridPolygon2 } from '../../src/grid/regions/grid-polygon2';
import { GridPolyline2 } from '../../src/grid/regions/grid-polyline2';
import { GridRectangle2 } from '../../src/grid/regions/grid-rectangle2';
import { CodecRegistry, codec, defaultRegistry, Deserialise } from '../../src/io/deserialise';

const V = (x: number, y: number) => new Vec2(x, y);
const cell = (i: number, j: number) => new GridCell2(i, j);

const samples: { name: string; value: { toJson(): unknown } }[] = [
  { name: 'Vec2', value: V(1.5, -2) },
  { name: 'Mat3', value: Mat3.translation(2, 3).multiply(Mat3.rotation(0.3)) },
  { name: 'Angle', value: Angle.fromDegrees(30, 1) },
  { name: 'Frame2', value: new Frame2(V(1, 2), V(0, 1), V(-1, 0)) },
  { name: 'Epsilon', value: Epsilon.custom(1e-3) },
  { name: 'Interval2', value: new Interval2(-1, 2) },
  { name: 'Interval2 ray', value: Interval2.ray },
  { name: 'Interval2 empty', value: Interval2.empty() },
  { name: 'Aabb2', value: Aabb2.fromPoints(V(0, 0), V(3, 4)) },
  { name: 'Aabb2 infinite', value: new Aabb2(Interval2.infinite, Interval2.ray) },
  { name: 'Line2', value: new Line2(V(0, 0), V(1, 1)) },
  { name: 'Ray2', value: new Ray2(V(0, 0), V(1, 0)) },
  { name: 'InfiniteLine2', value: new InfiniteLine2(V(0, 1), V(1, 0)) },
  { name: 'Hesse2', value: new Hesse2(V(0, 1), 2) },
  { name: 'Polyline2', value: new Polyline2([V(0, 0), V(1, 0), V(1, 1)]) },
  { name: 'Polygon2', value: new Polygon2([V(0, 0), V(1, 0), V(1, 1)]) },
  { name: 'Circle2', value: new Circle2(V(1, 1), 2) },
  // Raw mesh with a repeated vertex: decoding must not re-run cleanup.
  { name: 'TriMesh2', value: TriMesh2.withoutCleanup([V(0, 0), V(1, 0), V(1, 0), V(0, 1)], [[0, 1, 3], [0, 2, 3]]) },
  { name: 'GridCell2', value: cell(2, -3) },
  { name: 'Axis', value: Axis.custom(1, { 2: 3 }, new Interval2(-4, 6)) },
  {
    name: 'Grid2',
    value: new Grid2({
      u: Axis.uniform(2, new Interval2(0, 5)),
      v: Axis.unit(),
      frame: new Frame2(V(10, 0), V(0, 1), V(-1, 0)),
      epsilon: Epsilon.custom(1e-4),
    }),
  },
  { name: 'GridLine2', value: new GridLine2(cell(0, 0), cell(3, 1)) },
  { name: 'GridPolyline2', value: new GridPolyline2([cell(0, 0), cell(2, 0), cell(2, 2)]) },
  { name: 'GridPolygon2', value: new GridPolygon2([cell(0, 0), cell(2, 0), cell(2, 2)]) },
  { name: 'GridRectangle2', value: new GridRectangle2(cell(0, 0), cell(2, 3)) },
  { name: 'CellCollection', value: new GridCell2Collection([cell(0, 0), cell(1, 0)]) },
];

/** Every `static readonly type` tag declared in vec2's sources. */
function declaredTypes(dir = path.join(import.meta.dir, '../../src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return declaredTypes(full);
    return [...readFileSync(full, 'utf8').matchAll(/static readonly type = '(\w+)'/g)].map((match) => match[1]!);
  });
}

describe('codec registry', () => {
  test('has a codec for every vec2 type tag', () => {
    expect(defaultRegistry.types().sort()).toEqual(declaredTypes().sort());
  });

  for (const { name, value } of samples) {
    test(`${name} round-trips through JSON text (M21)`, () => {
      const json = value.toJson();
      const decoded = Deserialise.deserialise(JSON.stringify(json)) as unknown as { toJson(): unknown };
      expect(decoded.toJson()).toEqual(json as object);
    });
  }

  test('infinite bounds survive JSON.stringify (M21)', () => {
    const decoded = Deserialise.deserialise(JSON.stringify(Aabb2.infinite().toJson())) as Aabb2;
    expect(decoded.isFullyInfinite()).toBe(true);
    expect((Deserialise.deserialise(JSON.stringify(Interval2.empty().toJson())) as Interval2).isEmpty()).toBe(true);
  });

  test('older JSON with null infinite endpoints still decodes', () => {
    const decoded = Deserialise.interval2({ type: 'Interval2', min: null, max: null });
    expect(decoded.isFullyInfinite()).toBe(true);
  });

  test('Grid2 keeps its frame and epsilon (M21)', () => {
    const grid = samples.find((sample) => sample.name === 'Grid2')!.value as Grid2;
    const decoded = Deserialise.grid2(JSON.parse(JSON.stringify(grid.toJson())));
    expect(decoded.cellWorldCenter(cell(0, 0)).x).toBeCloseTo(grid.cellWorldCenter(cell(0, 0)).x);
    expect(decoded.epsilon.value).toBe(1e-4);
  });

  test('rejects angle JSON without a value (M8)', () => {
    expect(() => Deserialise.angle({ type: 'Angle', domainKind: 'pi' })).toThrow('Invalid Angle JSON');
    expect(() => Deserialise.fromJson({ type: 'Angle', domainKind: 'tau', precision: 1 })).toThrow();
  });

  test('custom registries accept new types and reject duplicates', () => {
    type Tag = { type: 'Tag'; label: string };
    const isTag = (json: unknown): json is Tag => (json as Tag)?.type === 'Tag';
    const registry = new CodecRegistry().register(codec('Tag', isTag, (json) => json.label.toUpperCase()));
    expect(registry.decode({ type: 'Tag', label: 'ok' })).toBe('OK');
    expect(() => registry.decode({ type: 'Vec2', x: 0, y: 0 })).toThrow('Unknown type');
    expect(() => registry.register(codec('Tag', isTag, () => 1))).toThrow('already registered');
  });
});
