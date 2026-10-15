import { describe, expect, test } from 'bun:test';
import { Hesse2 } from '../../../src/geometry/primitives/hesse2';
import { InfiniteLine2 } from '../../../src/geometry/primitives/infinite-line2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('InfiniteLine2', () => {
  const line = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));

  test('evaluate', () => {
    expectVec2Close(line.evaluate(3), new Vec2(3, 0));
    expectVec2Close(line.evaluate(-2), new Vec2(-2, 0));
  });

  test('closest point is unconstrained', () => {
    expectClose(line.closestParameterForPoint(new Vec2(-4, 0)), -4);
    expectVec2Close(line.closestPointForPoint(new Vec2(2, 5)), new Vec2(2, 0));
    expectClose(line.distanceToPoint(new Vec2(2, 5)), 5);
  });

  test('signedDistance', () => {
    expectClose(line.signedDistance(new Vec2(0, 5)), 5, 1e-9, 'left of +X is positive');
    expectClose(line.signedDistance(new Vec2(0, -5)), -5, 1e-9, 'right of +X is negative');
    expectClose(line.signedDistance(new Vec2(3, 0)), 0, 1e-9, 'on the line');
  });

  test('signedDistance on angled and non-unit directions', () => {
    const diagonal = new InfiniteLine2(new Vec2(1, 1), new Vec2(2, 2));
    // Line is y = x; point (1, 1 + √2) is √2 left of unit direction (1,1)/√2… wait
    // direction (2,2), unit = (1/√2, 1/√2), left normal = (-1/√2, 1/√2)
    // Point (0, 2): from through (1,1) delta (-1, 1), cross = 2*1 - 2*(-1) = 4, /√8 = 4/(2√2) = √2
    expectClose(diagonal.signedDistance(new Vec2(0, 2)), Math.SQRT2, 1e-9, 'left of diagonal');
    expectClose(diagonal.signedDistance(new Vec2(2, 0)), -Math.SQRT2, 1e-9, 'right of diagonal');
    expectClose(diagonal.signedDistance(new Vec2(5, 5)), 0, 1e-9, 'on diagonal');
  });

  test('signedDistance flips when direction is reversed', () => {
    const forward = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));
    const backward = new InfiniteLine2(new Vec2(0, 0), new Vec2(-1, 0));
    const point = new Vec2(2, 3);

    expectClose(forward.signedDistance(point), 3);
    expectClose(backward.signedDistance(point), -3);
  });

  test('hesseNormal matches signedDistance', () => {
    const line = new InfiniteLine2(new Vec2(2, -1), new Vec2(3, 4));
    const hesse = Hesse2.fromInfiniteLine(line);
    const point = new Vec2(-2, 5);

    expectClose(hesse.signedDistance(point), line.signedDistance(point));
  });

  test('signedDistance magnitude matches distanceToPoint', () => {
    const angled = new InfiniteLine2(new Vec2(2, -1), new Vec2(3, 4));
    const point = new Vec2(-2, 5);

    expectClose(Math.abs(angled.signedDistance(point)), angled.distanceToPoint(point));
  });
});
