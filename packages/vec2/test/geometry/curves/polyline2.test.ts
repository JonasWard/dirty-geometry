import { describe, expect, test } from 'bun:test';
import { Polyline2 } from '../../../src/geometry/curves/polyline2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Polyline2', () => {
  const polyline = new Polyline2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10)]);
  const unequal = new Polyline2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 10)]);

  test('requires at least two vertices', () => {
    expect(() => new Polyline2([new Vec2(0, 0)])).toThrow();
  });

  test('segments and length', () => {
    expect(polyline.segments()).toHaveLength(2);
    expect(polyline.n()).toBe(2);
    expectClose(polyline.length(), 20);
  });

  test('clones vertices', () => {
    const source = [new Vec2(0, 0), new Vec2(1, 0)];
    const pl = new Polyline2(source);
    expect(pl.vertices[0]).not.toBe(source[0]);
    expect(pl.vertices[0]!.x).toBe(0);
  });

  test('evaluate uses index-domain t', () => {
    expectVec2Close(polyline.evaluate(0), new Vec2(0, 0));
    expectVec2Close(polyline.evaluate(1), new Vec2(10, 0));
    expectVec2Close(polyline.evaluate(2), new Vec2(10, 10));
    expectVec2Close(polyline.evaluate(0.5), new Vec2(5, 0));
    expectVec2Close(polyline.evaluate(1.5), new Vec2(10, 5));
  });

  test('evaluate clamps outside [0, n]', () => {
    expectVec2Close(polyline.evaluate(-2), new Vec2(0, 0));
    expectVec2Close(polyline.evaluate(99), new Vec2(10, 10));
  });

  test('index domain ignores segment length', () => {
    expectVec2Close(unequal.evaluate(0.5), new Vec2(1, 0));
    expectVec2Close(unequal.evaluate(1.5), new Vec2(2, 5));
  });

  test('evaluateAtLength uses arc length', () => {
    expectVec2Close(polyline.evaluateAtLength(5), new Vec2(5, 0));
    expectVec2Close(polyline.evaluateAtLength(15), new Vec2(10, 5));
    expectVec2Close(polyline.evaluateAtLength(20), new Vec2(10, 10));
    expectVec2Close(polyline.evaluateAtLength(40), new Vec2(10, 30));
    expectVec2Close(polyline.evaluateAtLength(-1), new Vec2(-1, 0));
  });

  test('evaluateAtLength extrapolates outside [0, length]', () => {
    expectVec2Close(polyline.evaluateAtLength(-5), new Vec2(-5, 0));
    expectVec2Close(polyline.evaluateAtLength(25), new Vec2(10, 15));
  });

  test('evaluate and evaluateAtLength disagree on unequal segments', () => {
    expectVec2Close(unequal.evaluate(0.5), new Vec2(1, 0));
    expectVec2Close(unequal.evaluateAtLength(0.5 * unequal.length()), new Vec2(2, 4));
    expectClose(unequal.length(), 12);
  });

  test('closest queries use index-domain t', () => {
    const point = new Vec2(5, 3);

    expectClose(polyline.distanceToPoint(point), 3);
    expect(polyline.closestParametersForPoint(point)).toEqual([0.5]);
    expectVec2Close(polyline.closestPointsForPoint(point)[0]!, new Vec2(5, 0));
    expectVec2Close(polyline.evaluate(0.5), polyline.closestPointsForPoint(point)[0]!);
  });

  test('corner ties return multiple parameters', () => {
    const params = polyline.closestParametersForPoint(new Vec2(10, 0));
    expect(params).toEqual([1, 1]);
  });

  test('additionalTolerance includes near-miss closest points', () => {
    const point = new Vec2(5, 1);
    // First segment: (5, 0) at distance 1. Second: (10, 1) at distance 5.
    expect(polyline.closestParametersForPoint(point)).toEqual([0.5]);
    expectVec2Close(polyline.closestPointsForPoint(point)[0]!, new Vec2(5, 0));

    const params = polyline.closestParametersForPoint(point, 4.1);
    const points = polyline.closestPointsForPoint(point, 4.1);
    expect(params).toEqual([0.5, 1.1]);
    expectVec2Close(points[0]!, new Vec2(5, 0));
    expectVec2Close(points[1]!, new Vec2(10, 1));
  });

  test('additionalTolerance zero matches default closest', () => {
    const point = new Vec2(5, 3);
    expect(polyline.closestParametersForPoint(point, 0)).toEqual(polyline.closestParametersForPoint(point));
  });

  test('evaluateAtLength skips zero-length end segments (M7)', () => {
    const trailing = new Polyline2([new Vec2(0, 0), new Vec2(1, 0), new Vec2(1, 0)]);
    expectVec2Close(trailing.evaluateAtLength(1), new Vec2(1, 0));
    expectVec2Close(trailing.evaluateAtLength(2), new Vec2(2, 0));

    const leading = new Polyline2([new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 1)]);
    expectVec2Close(leading.evaluateAtLength(-1), new Vec2(0, -1));

    const degenerate = new Polyline2([new Vec2(3, 4), new Vec2(3, 4)]);
    expectVec2Close(degenerate.evaluateAtLength(5), new Vec2(3, 4));
  });
});
