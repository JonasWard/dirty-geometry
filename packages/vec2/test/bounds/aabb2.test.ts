import { describe, expect, test } from 'bun:test';
import { Aabb2 } from '../../src/bounds/aabb2';
import { Interval2 } from '../../src/bounds/interval2';
import { Epsilon } from '../../src/core/epsilon';
import { Circle2 } from '../../src/geometry/regions/circle2';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';
import { expectClose, expectVec2Close } from '../testHelpers';

function expectAxisClose(actual: number, expected: number, tolerance = 1e-9): void {
  if (!Number.isFinite(expected)) {
    expect(actual).toBe(expected);
    return;
  }
  expectClose(actual, expected, tolerance);
}

function expectAabb2Close(actual: Aabb2, expected: Aabb2, tolerance = 1e-9): void {
  expectAxisClose(actual.min().x, expected.min().x, tolerance);
  expectAxisClose(actual.min().y, expected.min().y, tolerance);
  expectAxisClose(actual.max().x, expected.max().x, tolerance);
  expectAxisClose(actual.max().y, expected.max().y, tolerance);
}

function box(min: Vec2, max: Vec2): Aabb2 {
  return Aabb2.fromMinMax(min, max);
}

describe('Aabb2', () => {
  test('fromIntervals builds a box from per-axis intervals', () => {
    const aabb = Aabb2.fromIntervals(new Interval2(1, 4), new Interval2(-2, 3));
    expectAabb2Close(aabb, box(new Vec2(1, -2), new Vec2(4, 3)));
  });

  test('fromPoints and containsPoint', () => {
    const aabb = Aabb2.fromPoints(new Vec2(1, 2), new Vec2(5, 1), new Vec2(3, 7));
    expectAabb2Close(aabb, box(new Vec2(1, 1), new Vec2(5, 7)));
    expect(aabb.containsPoint(new Vec2(3, 4))).toBe(true);
    expect(aabb.containsPoint(new Vec2(0, 4))).toBe(false);
  });

  test('infinite box contains every point', () => {
    const aabb = Aabb2.infinite();
    expect(aabb.isInfinite()).toBe(true);
    expect(aabb.isFullyInfinite()).toBe(true);
    expect(aabb.containsPoint(new Vec2(-1e9, 1e9))).toBe(true);
  });

  test('axis-aligned semi-infinite box constrains one axis', () => {
    const horizontal = box(new Vec2(-Infinity, 3), new Vec2(Infinity, 3));
    expect(horizontal.isInfinite()).toBe(true);
    expect(horizontal.isFullyInfinite()).toBe(false);
    expectClose(horizontal.height(), 0);
    expect(horizontal.width()).toBe(Infinity);
    expect(horizontal.containsPoint(new Vec2(100, 3))).toBe(true);
    expect(horizontal.containsPoint(new Vec2(100, 4))).toBe(false);
  });

  test('union of boxes and points', () => {
    const a = box(new Vec2(0, 0), new Vec2(2, 2));
    const b = box(new Vec2(1, 1), new Vec2(4, 3));
    const union = Aabb2.union(a, b, new Vec2(-1, 5));
    expectAabb2Close(union, box(new Vec2(-1, 0), new Vec2(4, 5)));
  });

  test('union with fully infinite box is fully infinite', () => {
    const finite = box(new Vec2(0, 0), new Vec2(1, 1));
    expect(Aabb2.union(finite, Aabb2.infinite()).isFullyInfinite()).toBe(true);
    expect(Aabb2.union(new Vec2(0, 0), Aabb2.infinite()).isFullyInfinite()).toBe(true);
  });

  test('union merges semi-infinite boxes per axis', () => {
    const horizontal = box(new Vec2(-Infinity, 0), new Vec2(Infinity, 0));
    const vertical = box(new Vec2(5, -Infinity), new Vec2(5, Infinity));
    expect(Aabb2.union(horizontal, vertical).isFullyInfinite()).toBe(true);
  });

  test('rejects invalid min/max', () => {
    expect(() => box(new Vec2(2, 0), new Vec2(1, 1))).toThrow();
  });

  test('clone and toJson', () => {
    const aabb = box(new Vec2(1, 2), new Vec2(4, 6));
    const clone = aabb.clone();
    expectAabb2Close(clone, aabb);
    expect(clone.toJson()).toEqual({
      type: 'Aabb2',
      x: { type: 'Interval2', min: 1, max: 4 },
      y: { type: 'Interval2', min: 2, max: 6 },
    });
  });

  test('union with semi-infinite strip and point expands bounded axes', () => {
    const strip = box(new Vec2(-Infinity, 2), new Vec2(Infinity, 2));
    const union = Aabb2.union(strip, new Vec2(3, 7));
    expectAabb2Close(union, box(new Vec2(-Infinity, 2), new Vec2(Infinity, 7)));
  });

  test('containsBox covers nested and disjoint boxes', () => {
    const outer = box(new Vec2(0, 0), new Vec2(10, 10));
    const inner = box(new Vec2(2, 3), new Vec2(8, 7));
    const disjoint = box(new Vec2(11, 0), new Vec2(12, 1));

    expect(outer.containsBox(inner)).toBe(true);
    expect(outer.containsBox(disjoint)).toBe(false);
    expect(inner.containsBox(outer)).toBe(false);
  });

  test('containsBox respects slack on boundaries', () => {
    const outer = box(new Vec2(0, 0), new Vec2(10, 10));
    const flush = box(new Vec2(0, 0), new Vec2(5, 5));

    expect(outer.containsBox(flush, Epsilon.preferIn)).toBe(true);
    expect(outer.containsBox(flush, Epsilon.preferOut)).toBe(false);
  });

  test('containsBox rejects semi-infinite guest inside finite outer', () => {
    const outer = box(new Vec2(0, 0), new Vec2(10, 10));
    const unbounded = box(new Vec2(5, 2), new Vec2(Infinity, 4));

    expect(outer.containsBox(unbounded)).toBe(false);
  });

  test('containsBox accepts custom numeric tolerance', () => {
    const outer = box(new Vec2(0, 0), new Vec2(10, 10));
    const slightlyOutside = box(new Vec2(0, 0), new Vec2(10.0001, 5));

    expect(outer.containsBox(slightlyOutside)).toBe(false);
    expect(outer.containsBox(slightlyOutside, Epsilon.custom(0.001))).toBe(true);
  });

  test('signedDistance is negative inside and positive outside', () => {
    const aabb = box(new Vec2(0, 0), new Vec2(10, 10));
    expectClose(aabb.signedDistance(new Vec2(5, 5)), -5);
    expectClose(aabb.signedDistance(new Vec2(0, 5)), 0);
    expectClose(aabb.signedDistance(new Vec2(12, 5)), 2);
    expectClose(aabb.signedDistance(new Vec2(12, 12)), Math.hypot(2, 2));
  });

  test('corners returns the four vertices', () => {
    const aabb = box(new Vec2(1, 2), new Vec2(4, 6));
    const [a, b, c, d] = aabb.corners();
    expectVec2Close(a, new Vec2(1, 2));
    expectVec2Close(b, new Vec2(4, 2));
    expectVec2Close(c, new Vec2(4, 6));
    expectVec2Close(d, new Vec2(1, 6));
  });

  test('Polygon2.fromAabb2 matches corners and bounds', () => {
    const aabb = box(new Vec2(1, 2), new Vec2(4, 6));
    const polygon = Polygon2.fromAabb2(aabb);
    expect(polygon.vertices).toHaveLength(4);
    expectAabb2Close(polygon.aabb2(), aabb);
    expectVec2Close(polygon.vertices[0]!, aabb.corners()[0]);
  });
});

describe('geometry aabb2', () => {
  test('Line2', () => {
    const line = new Line2(new Vec2(1, 4), new Vec2(6, 2));
    expectAabb2Close(line.aabb2(), box(new Vec2(1, 2), new Vec2(6, 4)));
  });

  test('Circle2', () => {
    const circle = new Circle2(new Vec2(2, 3), 2);
    expectAabb2Close(circle.aabb2(), box(new Vec2(0, 1), new Vec2(4, 5)));
  });

  test('Polyline2 and Polygon2', () => {
    const polyline = new Polyline2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 5)]);
    expectAabb2Close(polyline.aabb2(), box(new Vec2(0, 0), new Vec2(10, 5)));

    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
    expectAabb2Close(polygon.aabb2(), box(new Vec2(0, 0), new Vec2(10, 10)));
  });

  test('TriMesh2', () => {
    const mesh = new TriMesh2(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(0, 2), new Vec2(2, 2)],
      [
        [0, 1, 2],
        [1, 3, 2],
      ],
    );
    expectAabb2Close(mesh.aabb2(), box(new Vec2(0, 0), new Vec2(2, 2)));
  });

  test('Ray2 default is semi-infinite or infinite depending on direction', () => {
    const diagonal = new Ray2(new Vec2(1, 2), new Vec2(3, 4));
    expect(diagonal.aabb2().isFullyInfinite()).toBe(false);
    expectAabb2Close(diagonal.aabb2(), box(new Vec2(1, 2), new Vec2(Infinity, Infinity)));

    const horizontal = new Ray2(new Vec2(1, 2), new Vec2(3, 0));
    expectAabb2Close(horizontal.aabb2(), box(new Vec2(1, 2), new Vec2(Infinity, 2)));

    expectAabb2Close(diagonal.aabb2(true), Line2.definitionOf(diagonal).aabb2());
  });

  test('InfiniteLine2 default constrains axis when parallel to x or y', () => {
    const diagonal = new InfiniteLine2(new Vec2(-1, 0), new Vec2(2, 5));
    expect(diagonal.aabb2().isFullyInfinite()).toBe(true);

    const horizontal = new InfiniteLine2(new Vec2(0, 4), new Vec2(2, 0));
    expectAabb2Close(horizontal.aabb2(), box(new Vec2(-Infinity, 4), new Vec2(Infinity, 4)));
    expectClose(horizontal.aabb2().height(), 0);

    const vertical = new InfiniteLine2(new Vec2(-3, 0), new Vec2(0, 5));
    expectAabb2Close(vertical.aabb2(), box(new Vec2(-3, -Infinity), new Vec2(-3, Infinity)));
    expectClose(vertical.aabb2().width(), 0);

    expectAabb2Close(diagonal.aabb2(true), Line2.definitionOf(diagonal).aabb2());
    expectAabb2Close(diagonal.aabb2(true), box(new Vec2(-1, 0), new Vec2(1, 5)));
  });

  test('Ray2 negative direction extends toward negative infinity', () => {
    const ray = new Ray2(new Vec2(5, 4), new Vec2(-2, 0));
    expectAabb2Close(ray.aabb2(), box(new Vec2(-Infinity, 4), new Vec2(5, 4)));
  });

  test('definitionLine matches start/through to start/through + direction', () => {
    const ray = new Ray2(new Vec2(0, 0), new Vec2(2, 0));
    expectVec2Close(Line2.definitionOf(ray).from, new Vec2(0, 0));
    expectVec2Close(Line2.definitionOf(ray).to, new Vec2(2, 0));
    expectClose(Line2.definitionOf(ray).length(), 2);

    const infinite = new InfiniteLine2(new Vec2(1, 1), new Vec2(0, 3));
    expectVec2Close(Line2.definitionOf(infinite).from, new Vec2(1, 1));
    expectVec2Close(Line2.definitionOf(infinite).to, new Vec2(1, 4));
  });
});

describe('Aabb2.fromParameterInterval (M20)', () => {
  test('a nearly horizontal ray is still unbounded in y', () => {
    const box = Aabb2.fromParameterInterval(new Vec2(0, 0), new Vec2(1, 1e-7), Interval2.ray);
    expect(box.y.min).toBe(0);
    expect(box.y.max).toBe(Infinity);
  });

  test('an exactly horizontal ray is flat in y', () => {
    const box = Aabb2.fromParameterInterval(new Vec2(0, 2), new Vec2(1, 0), Interval2.ray);
    expect([box.y.min, box.y.max]).toEqual([2, 2]);
  });
});

