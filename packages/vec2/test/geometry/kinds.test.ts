import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Vec2 } from '../../src/core/vec2';
import { isContainer2, isGeometry2, isLineLike2, isRegion2 } from '../../src/geometry/kinds';
import { Hesse2 } from '../../src/geometry/primitives/hesse2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { Contains2 } from '../../src/operations/contains2';

describe('geometry type tags', () => {
  test('instances expose their class tag without an own property', () => {
    const point = new Vec2(1, 2);
    expect(point.type).toBe('Vec2');
    expect(Object.keys(point)).toEqual(['x', 'y']);
    expect(JSON.stringify(point)).toBe('{"x":1,"y":2}');
    expect(new Circle2(point, 1).type).toBe('Circle2');
  });

  test('guards classify geometry by tag', () => {
    const line = new Line2(new Vec2(0, 0), new Vec2(1, 0));
    expect(isLineLike2(line)).toBe(true);
    expect(isRegion2(line)).toBe(false);
    expect(isContainer2(Aabb2.fromPoints(new Vec2(0, 0), new Vec2(1, 1)))).toBe(true);
    expect(isContainer2(new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0)))).toBe(true);
  });

  test('isGeometry2 rejects plain JSON with a geometry type', () => {
    expect(isGeometry2(new Vec2(0, 0))).toBe(true);
    expect(isGeometry2(new Vec2(0, 0).toJson())).toBe(false);
    expect(isGeometry2({ type: 'Line2', toJson: 'nope' })).toBe(false);
    expect(isGeometry2(null)).toBe(false);
  });

  test('Contains2 treats a Hesse2 guest as its infinite line', () => {
    const lowerHalfPlane = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    expect(Contains2.contains(lowerHalfPlane, new Hesse2(new Vec2(0, 1), -1))).toBe(true);
    expect(Contains2.contains(lowerHalfPlane, new Hesse2(new Vec2(0, 1), 1))).toBe(false);
  });
});
