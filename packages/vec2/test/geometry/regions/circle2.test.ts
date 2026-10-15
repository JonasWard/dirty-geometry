import { describe, expect, test } from 'bun:test';
import { Circle2 } from '../../../src/geometry/regions/circle2';
import { Vec2 } from '../../../src/core/vec2';
import { expectClose, expectVec2Close } from '../../testHelpers';

describe('Circle2', () => {
  const unit = new Circle2(new Vec2(0, 0), 1);

  test('rejects negative or non-finite radius', () => {
    expect(() => new Circle2(new Vec2(0, 0), -1)).toThrow();
    expect(() => new Circle2(new Vec2(0, 0), Number.NaN)).toThrow();
  });

  test('clones the center', () => {
    const center = new Vec2(1, 2);
    const circle = new Circle2(center, 3);
    expect(circle.center).not.toBe(center);
    expect(circle.center.x).toBe(1);
  });

  test('evaluate samples the boundary', () => {
    expectVec2Close(unit.evaluate(0), new Vec2(1, 0));
    expectVec2Close(unit.evaluate(Math.PI / 2), new Vec2(0, 1));
    expectVec2Close(unit.evaluate(Math.PI), new Vec2(-1, 0));
  });

  test('area and circumference', () => {
    expectClose(unit.area(), Math.PI);
    expectClose(unit.circumference(), 2 * Math.PI);
  });

  test('signedDistance and contains', () => {
    expectClose(unit.signedDistance(new Vec2(0, 0)), -1);
    expectClose(unit.signedDistance(new Vec2(1, 0)), 0);
    expectClose(unit.signedDistance(new Vec2(2, 0)), 1);
    expectClose(unit.distanceToPoint(new Vec2(0, 0)), 1);

    expect(unit.containsPoint(new Vec2(0, 0))).toBe(true);
    expect(unit.containsPoint(new Vec2(1, 0))).toBe(true);
    expect(unit.containsPoint(new Vec2(2, 0))).toBe(false);

    expect(unit.strictlyContainsPoint(new Vec2(0, 0))).toBe(true);
    expect(unit.strictlyContainsPoint(new Vec2(1, 0))).toBe(false);
  });

  test('fromDiameter', () => {
    const circle = Circle2.fromDiameter(new Vec2(0, 0), new Vec2(4, 0));
    expectVec2Close(circle.center, new Vec2(2, 0));
    expectClose(circle.radius, 2);
  });

  test('circumcircle of a right triangle', () => {
    const circle = Circle2.circumcircle(new Vec2(0, 0), new Vec2(4, 0), new Vec2(0, 2));
    expect(circle).not.toBeNull();
    expectVec2Close(circle!.center, new Vec2(2, 1));
    expectClose(circle!.radius, Math.hypot(2, 1));
    expectClose(circle!.center.distance(new Vec2(0, 0)), circle!.radius);
    expectClose(circle!.center.distance(new Vec2(4, 0)), circle!.radius);
    expectClose(circle!.center.distance(new Vec2(0, 2)), circle!.radius);
  });

  test('circumcircle returns null for collinear points', () => {
    expect(Circle2.circumcircle(new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0))).toBeNull();
  });

  test('inCircle matches circumcircle containment for a CCW triangle', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(4, 0);
    const c = new Vec2(0, 4);
    const circle = Circle2.circumcircle(a, b, c)!;

    expect(Circle2.inCircle(a, b, c, circle.center)).toBe(true);
    expect(Circle2.inCircle(a, b, c, new Vec2(10, 10))).toBe(false);
    // On the circumcircle is not strictly inside.
    expect(Circle2.inCircle(a, b, c, a)).toBe(false);
  });

  test('inCircle respects clockwise winding', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(0, 4);
    const c = new Vec2(4, 0);
    expect(Circle2.inCircle(a, b, c, new Vec2(1, 1))).toBe(true);
    expect(Circle2.inCircle(a, b, c, new Vec2(10, 10))).toBe(false);
  });

  test('toJson', () => {
    const json = unit.toJson();
    expect(json.type).toBe('Circle2');
    expect(json.radius).toBe(1);
    expect(json.center.x).toBe(0);
  });
});
