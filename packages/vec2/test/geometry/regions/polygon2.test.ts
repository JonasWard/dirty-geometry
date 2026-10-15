import { describe, expect, test } from 'bun:test';
import { Polygon2 } from '../../../src/geometry/regions/polygon2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Polygon2', () => {
  const square = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);

  const triangle = new Polygon2([new Vec2(0, 0), new Vec2(8, 0), new Vec2(4, 6)]);

  test('requires at least three vertices', () => {
    expect(() => new Polygon2([new Vec2(0, 0), new Vec2(1, 0)])).toThrow();
  });

  test('segments include closing edge', () => {
    expect(square.segments()).toHaveLength(4);
    expect(square.n()).toBe(4);
    expectClose(square.length(), 40);
  });

  test('containsPoint', () => {
    expect(square.containsPoint(new Vec2(5, 5))).toBe(true);
    expect(square.containsPoint(new Vec2(15, 5))).toBe(false);
  });

  test('isPointInside uses even-odd across loops', () => {
    const outer = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
    const hole = new Polygon2([new Vec2(2, 2), new Vec2(8, 2), new Vec2(8, 8), new Vec2(2, 8)]);

    expect(Polygon2.isPointInside([outer, hole], new Vec2(5, 5))).toBe(false);
    expect(Polygon2.isPointInside([outer, hole], new Vec2(1, 1))).toBe(true);
    expect(Polygon2.isPointInside([outer, hole], new Vec2(15, 5))).toBe(false);
  });

  test('signedDistanceFromLoops uses even-odd across loops', () => {
    const outer = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);
    const hole = new Polygon2([new Vec2(2, 2), new Vec2(8, 2), new Vec2(8, 8), new Vec2(2, 8)]);
    const loops = [outer, hole];

    expectClose(Polygon2.signedDistanceFromLoops(loops, new Vec2(1, 1)), -1, 1e-9, 'inside ring');
    expect(Polygon2.signedDistanceFromLoops(loops, new Vec2(5, 5))).toBeGreaterThan(0);
    expectClose(Polygon2.signedDistanceFromLoops(loops, new Vec2(0, 5)), 0, 1e-9, 'on outer boundary');
  });

  test('signedDistance', () => {
    expectClose(square.signedDistance(new Vec2(5, 5)), -5, 1e-9, 'center is inside');
    expectClose(square.signedDistance(new Vec2(15, 5)), 5, 1e-9, 'right of square');
    expectClose(square.signedDistance(new Vec2(5, 0)), 0, 1e-9, 'on bottom edge');
  });

  test('signedDistance inside, outside, and on vertices', () => {
    expectClose(square.signedDistance(new Vec2(1, 1)), -1, 1e-9, 'near bottom-left inside');
    expectClose(square.signedDistance(new Vec2(9, 8)), -1, 1e-9, 'near right edge inside');
    expectClose(square.signedDistance(new Vec2(-3, 5)), 3, 1e-9, 'left of square');
    expectClose(square.signedDistance(new Vec2(5, 14)), 4, 1e-9, 'above square');
    expectClose(square.signedDistance(new Vec2(0, 0)), 0, 1e-9, 'bottom-left vertex');
    expectClose(square.signedDistance(new Vec2(10, 10)), 0, 1e-9, 'top-right vertex');
  });

  test('signedDistance outside near a corner uses corner distance', () => {
    // Closest feature is vertex (0,0), distance = 5.
    expectClose(square.signedDistance(new Vec2(-3, -4)), 5, 1e-9, 'SW of origin corner');
  });

  test('signedDistance on a triangle', () => {
    expectClose(triangle.signedDistance(new Vec2(4, 2)), -2, 1e-9, 'inside toward base');
    expectClose(triangle.signedDistance(new Vec2(4, -3)), 3, 1e-9, 'below base');
    expectClose(triangle.signedDistance(new Vec2(4, 0)), 0, 1e-9, 'on base');
    expectClose(triangle.signedDistance(new Vec2(4, 6)), 0, 1e-9, 'apex vertex');
  });

  test('signedDistance absolute value matches distanceToPoint', () => {
    const inside = new Vec2(2, 7);
    const outside = new Vec2(12, 12);

    expectClose(Math.abs(square.signedDistance(inside)), square.distanceToPoint(inside));
    expectClose(Math.abs(square.signedDistance(outside)), square.distanceToPoint(outside));
    expect(square.signedDistance(inside)).toBeLessThan(0);
    expect(square.signedDistance(outside)).toBeGreaterThan(0);
  });

  test('evaluate uses index-domain t', () => {
    expectVec2Close(square.evaluate(0), new Vec2(0, 0));
    expectVec2Close(square.evaluate(1), new Vec2(10, 0));
    expectVec2Close(square.evaluate(2), new Vec2(10, 10));
    expectVec2Close(square.evaluate(3), new Vec2(0, 10));
    expectVec2Close(square.evaluate(4), new Vec2(0, 0));
    expectVec2Close(square.evaluate(0.5), new Vec2(5, 0));
    expectVec2Close(square.evaluate(3.5), new Vec2(0, 5));
  });

  test('evaluate wraps index-domain t', () => {
    expectVec2Close(square.evaluate(5), new Vec2(10, 0));
    expectVec2Close(square.evaluate(8), new Vec2(0, 0));
    expectVec2Close(square.evaluate(-0.5), new Vec2(0, 5));
    expectVec2Close(square.evaluate(-4), new Vec2(0, 0));
  });

  test('triangle evaluate hits vertices at integers', () => {
    expect(triangle.n()).toBe(3);
    expectVec2Close(triangle.evaluate(0), new Vec2(0, 0));
    expectVec2Close(triangle.evaluate(1), new Vec2(8, 0));
    expectVec2Close(triangle.evaluate(2), new Vec2(4, 6));
    expectVec2Close(triangle.evaluate(3), new Vec2(0, 0));
  });

  test('evaluateAtLength uses arc length', () => {
    expectVec2Close(square.evaluateAtLength(5), new Vec2(5, 0));
    expectVec2Close(square.evaluateAtLength(40), new Vec2(0, 0));
    expectVec2Close(square.evaluateAtLength(-1), new Vec2(-1, 0));
    expectVec2Close(square.evaluateAtLength(-5), new Vec2(-5, 0));
    expectVec2Close(square.evaluateAtLength(45), new Vec2(0, -5));
  });

  test('index domain and arc length disagree on non-uniform edges', () => {
    // Edges: 8, ~7.21, ~7.21 — mid index on first edge is (4,0); mid length is further along.
    expectVec2Close(triangle.evaluate(0.5), new Vec2(4, 0));
    const midLength = triangle.evaluateAtLength(triangle.length() / 2);
    expect(midLength.x).not.toBeCloseTo(4, 5);
  });

  test('closest queries return index-domain t', () => {
    expectClose(square.distanceToPoint(new Vec2(5, 5)), 5);
    expect(square.closestParametersForPoint(new Vec2(5, 0))).toEqual([0.5]);
    expectVec2Close(square.evaluate(0.5), square.closestPointsForPoint(new Vec2(5, 0))[0]!);
  });

  test('closest on closing edge uses t in [n - 1, n]', () => {
    const params = square.closestParametersForPoint(new Vec2(0, 5));
    expect(params).toEqual([3.5]);
    expectVec2Close(square.evaluate(3.5), new Vec2(0, 5));
  });

  test('additionalTolerance includes near-miss closest points', () => {
    const point = new Vec2(5, -1);
    // Bottom edge: (5, 0) at distance 1. Side corners ~√26 ≈ 5.1.
    expect(square.closestParametersForPoint(point)).toEqual([0.5]);
    expectVec2Close(square.closestPointsForPoint(point)[0]!, new Vec2(5, 0));

    const params = square.closestParametersForPoint(point, 4.2);
    const points = square.closestPointsForPoint(point, 4.2);
    expect(params).toEqual([0.5, 1, 4]);
    expectVec2Close(points[0]!, new Vec2(5, 0));
    expectVec2Close(points[1]!, new Vec2(10, 0));
    expectVec2Close(points[2]!, new Vec2(0, 0));
  });

  test('additionalTolerance zero matches default closest', () => {
    const point = new Vec2(5, 0);
    expect(square.closestParametersForPoint(point, 0)).toEqual(square.closestParametersForPoint(point));
  });

  test('corner ties return multiple parameters', () => {
    const params = square.closestParametersForPoint(new Vec2(10, 0));
    expect(params).toEqual([1, 1]);
  });
});
