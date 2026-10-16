import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Deserialise } from '../../src/io/deserialise';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Hesse2 } from '../../src/geometry/primitives/hesse2';
import { Interval2 } from '../../src/bounds/interval2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Mat3 } from '../../src/core/mat3';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { Frame2 } from '../../src/core/frame2';
import { Grid2 } from '../../src/grid/core/grid2';
import { GridLine2 } from '../../src/grid/regions/grid-line2';
import { GridPolyline2 } from '../../src/grid/regions/grid-polyline2';
import { GridPolygon2 } from '../../src/grid/regions/grid-polygon2';
import { GridRectangle2 } from '../../src/grid/regions/grid-rectangle2';
import { Angle } from '../../src/core/angle';
import { expectVec2Close, expectClose } from '../testHelpers';

describe('Deserialise', () => {
  test('vec2', () => {
    const v = new Vec2(1, 2);
    const restored = Deserialise.vec2(v.toJson());

    expect(restored).toBeInstanceOf(Vec2);
    expectVec2Close(restored, v);
  });

  test('mat3', () => {
    const m = Mat3.translation(5, 10);
    const restored = Deserialise.mat3(m.toJson());

    expect(restored).toBeInstanceOf(Mat3);
    expect(restored.elements).toEqual(m.elements);
  });

  test('angle', () => {
    const angle = Angle.fromTwoVectors(new Vec2(1, 0), new Vec2(0, 1), { precision: 1e-2 });
    const restored = Deserialise.angle(angle.toJson());

    expect(restored).toBeInstanceOf(Angle);
    expectClose(restored.radians(), angle.radians());
    expect(restored.getPrecision()).toBe(1e-2);
    expect(restored.isTauDomain()).toBe(true);
  });

  test('line2', () => {
    const line = new Line2(new Vec2(0, 0), new Vec2(3, 4));
    const restored = Deserialise.line2(line.toJson());

    expect(restored).toBeInstanceOf(Line2);
    expect(restored.length()).toBe(line.length());
  });

  test('ray2', () => {
    const ray = new Ray2(new Vec2(1, 1), new Vec2(1, 0));
    const restored = Deserialise.ray2(ray.toJson());

    expect(restored).toBeInstanceOf(Ray2);
    expectVec2Close(restored.evaluate(2), ray.evaluate(2));
  });

  test('infiniteLine2', () => {
    const line = new InfiniteLine2(new Vec2(0, 0), new Vec2(0, 1));
    const restored = Deserialise.infiniteLine2(line.toJson());

    expect(restored).toBeInstanceOf(InfiniteLine2);
    expectVec2Close(restored.evaluate(3), line.evaluate(3));
  });

  test('Hesse2', () => {
    const hesse = new Hesse2(new Vec2(0, 2), 4);
    const restored = Deserialise.hesse2(hesse.toJson());

    expect(restored).toBeInstanceOf(Hesse2);
    expectVec2Close(restored.normal, hesse.normal);
    expect(restored.offset).toBe(hesse.offset);
  });

  test('polyline2', () => {
    const polyline = new Polyline2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1)]);
    const restored = Deserialise.polyline2(polyline.toJson());

    expect(restored).toBeInstanceOf(Polyline2);
    expect(restored.vertices).toHaveLength(3);
  });

  test('polygon2', () => {
    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 1)]);
    const restored = Deserialise.polygon2(polygon.toJson());

    expect(restored).toBeInstanceOf(Polygon2);
    expect(restored.vertices).toHaveLength(3);
  });

  test('interval2', () => {
    const interval = Interval2.infinite;
    const restored = Deserialise.interval2(interval.toJson());

    expect(restored).toBeInstanceOf(Interval2);
    expect(restored.min).toBe(-Infinity);
    expect(restored.max).toBe(Infinity);
  });

  test('interval2 round-trips via json string', () => {
    const interval = new Interval2(1, 4);
    const restored = Deserialise.deserialise(JSON.stringify(interval.toJson()));

    expect(restored).toBeInstanceOf(Interval2);
    expect((restored as Interval2).min).toBe(1);
    expect((restored as Interval2).max).toBe(4);
  });

  test('aabb2', () => {
    const box = Aabb2.fromMinMax(new Vec2(1, 2), new Vec2(4, 6));
    const restored = Deserialise.aabb2(box.toJson());

    expect(restored).toBeInstanceOf(Aabb2);
    expect(restored.min().x).toBe(1);
    expect(restored.min().y).toBe(2);
    expect(restored.max().x).toBe(4);
    expect(restored.max().y).toBe(6);
  });

  test('aabb2 round-trips semi-infinite bounds via fromJson', () => {
    const box = Aabb2.union(Aabb2.fromMinMax(new Vec2(0, 0), new Vec2(1, 1)), new Vec2(3, 5));
    const restored = Deserialise.fromJson(box.toJson());

    expect(restored).toBeInstanceOf(Aabb2);
    expect((restored as Aabb2).min().x).toBe(0);
    expect((restored as Aabb2).max().x).toBe(3);
    expect((restored as Aabb2).max().y).toBe(5);
  });

  test('triMesh2', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(1, 1)],
      [
        [0, 1, 2],
        [1, 3, 2],
      ],
    );
    const restored = Deserialise.triMesh2(mesh.toJson());

    expect(restored).toBeInstanceOf(TriMesh2);
    expect(restored.vertices).toHaveLength(4);
    expect(restored.triangles).toEqual([
      [0, 1, 2],
      [1, 3, 2],
    ]);
    expectVec2Close(restored.vertices[0]!, new Vec2(0, 0));
    expectVec2Close(restored.vertices[3]!, new Vec2(1, 1));
  });

  test('circle2', () => {
    const circle = new Circle2(new Vec2(2, 3), 4);
    const restored = Deserialise.circle2(circle.toJson());

    expect(restored).toBeInstanceOf(Circle2);
    expectVec2Close(restored.center, new Vec2(2, 3));
    expect(restored.radius).toBe(4);
  });

  test('gridCell2', () => {
    const cell = new GridCell2(2, 3);
    const restored = Deserialise.gridCell2(cell.toJson());
    expect(restored.equals(cell)).toBe(true);
  });

  test('gridFrame2', () => {
    const frame = Frame2.worldXY();
    const restored = Deserialise.frame2(frame.toJson());
    expectVec2Close(restored.toWorld(new Vec2(1, 1)), new Vec2(1, 1));
  });

  test('grid2', () => {
    const grid = Grid2.uniform(2, 3);
    const restored = Deserialise.grid2(grid.toJson());
    expect(restored.u.defaultSize()).toBe(2);
    expect(restored.v.defaultSize()).toBe(3);
  });

  test('gridLine2', () => {
    const line = new GridLine2(new GridCell2(0, 0), new GridCell2(3, 3));
    const restored = Deserialise.gridLine2(line.toJson());
    expect(restored.toCellCollection().size()).toBe(line.toCellCollection().size());
  });

  test('gridPolyline2', () => {
    const polyline = new GridPolyline2([new GridCell2(0, 0), new GridCell2(1, 1), new GridCell2(2, 0)]);
    const restored = Deserialise.gridPolyline2(polyline.toJson());
    expect(restored.vertices.length).toBe(3);
  });

  test('gridPolygon2', () => {
    const polygon = new GridPolygon2([new GridCell2(0, 0), new GridCell2(2, 0), new GridCell2(2, 2)]);
    const restored = Deserialise.gridPolygon2(polygon.toJson());
    expect(restored.vertices.length).toBe(3);
  });

  test('gridRectangle2', () => {
    const rect = new GridRectangle2(new GridCell2(0, 0), new GridCell2(2, 2));
    const restored = Deserialise.gridRectangle2(rect.toJson());
    expect(restored.toCellCollection().size()).toBe(9);
  });

  test('fromJson dispatches on type', () => {
    const v = Deserialise.fromJson({ type: 'Vec2', x: 2, y: 3 });
    expect(v).toBeInstanceOf(Vec2);
  });

  test('deserialise parses json strings', () => {
    const json = JSON.stringify(new Vec2(4, 5).toJson());
    const v = Deserialise.deserialise(json);

    expect(v).toBeInstanceOf(Vec2);
    expectVec2Close(v as Vec2, new Vec2(4, 5));
  });

  test('rejects unknown type', () => {
    expect(() => Deserialise.fromJson({ type: 'Unknown' })).toThrow('Unknown type');
  });
});
