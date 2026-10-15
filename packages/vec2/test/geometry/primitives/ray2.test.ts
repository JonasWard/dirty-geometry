import { describe, test } from 'bun:test';
import { Ray2 } from '../../../src/geometry/primitives/ray2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Ray2', () => {
  const ray = new Ray2(new Vec2(1, 1), new Vec2(1, 0));

  test('evaluate', () => {
    expectVec2Close(ray.evaluate(0), new Vec2(1, 1));
    expectVec2Close(ray.evaluate(2), new Vec2(3, 1));
  });

  test('closest point clamps t to ray interval', () => {
    expectClose(ray.closestParameterForPoint(new Vec2(3, 5)), 2);
    expectVec2Close(ray.closestPointForPoint(new Vec2(3, 5)), new Vec2(3, 1));
    expectClose(ray.distanceToPoint(new Vec2(3, 5)), 4);

    expectClose(ray.closestParameterForPoint(new Vec2(-3, 4)), 0);
    expectClose(ray.distanceToPoint(new Vec2(-3, 4)), 5);
  });
});
