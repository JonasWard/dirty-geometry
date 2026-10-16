import { describe, expect, test } from 'bun:test';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Line2', () => {
  const line = new Line2(new Vec2(0, 0), new Vec2(10, 0));

  test('length and direction', () => {
    expectClose(line.length(), 10);
    expectVec2Close(line.direction(), new Vec2(10, 0));
  });

  test('evaluate', () => {
    expectVec2Close(line.evaluate(0), new Vec2(0, 0));
    expectVec2Close(line.evaluate(0.5), new Vec2(5, 0));
    expectVec2Close(line.evaluate(1), new Vec2(10, 0));
  });

  test('closest point on segment clamps t', () => {
    expectClose(line.closestParameterForPoint(new Vec2(5, 3)), 0.5);
    expectVec2Close(line.closestPointForPoint(new Vec2(5, 3)), new Vec2(5, 0));
    expectClose(line.distanceToPoint(new Vec2(5, 3)), 3);

    expectClose(line.closestParameterForPoint(new Vec2(-5, 0)), 0);
    expectClose(line.closestParameterForPoint(new Vec2(15, 0)), 1);
  });

  test('unclampedClosestParameterForPoint extrapolates past the tips', () => {
    expectClose(line.infiniteLine().closestParameterForPoint(new Vec2(5, 3)), 0.5);
    expectClose(line.infiniteLine().closestParameterForPoint(new Vec2(-5, 0)), -0.5);
    expectClose(line.infiniteLine().closestParameterForPoint(new Vec2(15, 0)), 1.5);
  });

  test('works with non-unit segment direction', () => {
    const diagonal = new Line2(new Vec2(0, 0), new Vec2(2, 0));
    expectClose(diagonal.closestParameterForPoint(new Vec2(1, 1)), 0.5);
    expectClose(diagonal.distanceToPoint(new Vec2(1, 1)), 1);
  });

  test('lengthTable', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];
    expect(Line2.lengthTable(segments)).toEqual([0, 10, 20]);
  });

  test('closestToPointForSegments uses index-domain t', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];
    const result = Line2.closestToPointForSegments(segments, new Vec2(5, 3));

    expectClose(result.smallestDistance, 3);
    expect(result.tParameters).toEqual([0.5]);
    expectVec2Close(result.points[0]!, new Vec2(5, 0));
  });

  test('closestToPointForSegments returns ties at vertices', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];
    const result = Line2.closestToPointForSegments(segments, new Vec2(10, 0));

    expectClose(result.smallestDistance, 0);
    expect(result.tParameters).toEqual([1, 1]);
    expect(result.points).toHaveLength(2);
  });

  test('closestToPointForSegments additionalTolerance includes near misses', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];
    const point = new Vec2(5, 0.2);
    const tight = Line2.closestToPointForSegments(segments, point);
    const loose = Line2.closestToPointForSegments(segments, point, 5);

    expect(tight.tParameters).toEqual([0.5]);
    expect(loose.tParameters.length).toBeGreaterThan(1);
  });

  test('evaluateAtLength samples by arc length', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];

    expectVec2Close(Line2.evaluateAtLength(segments, 5), new Vec2(5, 0));
    expectVec2Close(Line2.evaluateAtLength(segments, 15), new Vec2(10, 5));
    expectVec2Close(Line2.evaluateAtLength(segments, 20), new Vec2(10, 10));
    expectVec2Close(Line2.evaluateAtLength(segments, -1), new Vec2(-1, 0));
  });

  test('evaluateAtLength extrapolates outside the chain', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(10, 0)), new Line2(new Vec2(10, 0), new Vec2(10, 10))];

    expectVec2Close(Line2.evaluateAtLength(segments, -5), new Vec2(-5, 0));
    expectVec2Close(Line2.evaluateAtLength(segments, 25), new Vec2(10, 15));
  });

  test('closestToPointForSegments requires segments', () => {
    expect(() => Line2.closestToPointForSegments([], new Vec2(0, 0))).toThrow();
  });

  test('toJson', () => {
    expect(line.toJson().type).toBe('Line2');
  });
});
