import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../src/core/mat3';
import { Vec2 } from '../../src/core/vec2';
import { Angle } from '../../src/core/angle';
import { expectClose, expectVec2Close } from '../testHelpers';

describe('Vec2', () => {
  test('add, subtract, scale', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);

    expectVec2Close(a.add(b), new Vec2(4, 6));
    expectVec2Close(a.subtract(b), new Vec2(-2, -2));
    expectVec2Close(a.scale(3), new Vec2(3, 6));
  });

  test('length and distance', () => {
    const a = new Vec2(3, 4);
    const b = new Vec2(0, 0);

    expectClose(a.length(), 5);
    expectClose(a.distance(b), 5);
    expectClose(b.distance(a), 5);
  });

  test('dot and crossProduct', () => {
    const a = new Vec2(1, 0);
    const b = new Vec2(0, 1);

    expectClose(a.dot(b), 0);
    expectClose(a.crossProduct(b), 1);
    expectClose(b.crossProduct(a), -1);
  });

  test('orient is signed parallelogram area', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(2, 0);
    const c = new Vec2(0, 3);

    expectClose(Vec2.orient(a, b, c), 6);
    expectClose(Vec2.orient(a, c, b), -6);
    expectClose(Vec2.orient(a, b, new Vec2(1, 0)), 0);
  });

  test('unit, negate, perpendicular', () => {
    const v = new Vec2(3, 4);

    expectVec2Close(v.unit(), new Vec2(0.6, 0.8));
    expectVec2Close(v.negate(), new Vec2(-3, -4));
    expectVec2Close(v.perpendicular(), new Vec2(-4, 3));
  });

  test('unit throws on zero vector', () => {
    expect(() => new Vec2(0, 0).unit()).toThrow('zero vector');
  });

  test('clone', () => {
    const v = new Vec2(1, 2);
    const c = v.clone();

    expect(c).not.toBe(v);
    expectVec2Close(c, v);
  });

  test('transform', () => {
    const v = new Vec2(1, 0);
    const m = Mat3.translation(10, 20).multiply(Mat3.rotation(Math.PI / 2));

    expectVec2Close(v.transform(m), new Vec2(10, 21));
  });

  test('center', () => {
    expectVec2Close(Vec2.center(new Vec2(0, 0), new Vec2(2, 4)), new Vec2(1, 2));
    expect(() => Vec2.center()).toThrow();
  });

  test('toJson', () => {
    expect(new Vec2(1, 2).toJson()).toEqual({ type: 'Vec2', x: 1, y: 2 });
  });

  test('angleWith is directed CCW in [0, 2π)', () => {
    const x = new Vec2(1, 0);
    const y = new Vec2(0, 1);
    const negX = new Vec2(-1, 0);

    expectClose(x.angleWith(y).radians(), Math.PI / 2);
    expectClose(y.angleWith(x).radians(), (3 * Math.PI) / 2);
    expectClose(x.angleWith(negX).radians(), Math.PI);
    expectClose(x.angleWith(x).radians(), 0);
  });

  test('angleWithSmallest is unsigned in [0, π]', () => {
    const x = new Vec2(1, 0);
    const y = new Vec2(0, 1);
    const almostNegX = new Vec2(-1, 0.01);

    expectClose(x.angleWithSmallest(y).radians(), Math.PI / 2);
    expectClose(y.angleWithSmallest(x).radians(), Math.PI / 2);
    expectClose(x.angleWithSmallest(new Vec2(-1, 0)).radians(), Math.PI);
    expect(x.angleWithSmallest(almostNegX).radians()).toBeLessThanOrEqual(Math.PI);
  });

  test('anglePositive wraps atan2 into [0, 2π)', () => {
    expectClose(new Vec2(1, 0).anglePositive().radians(), 0);
    expectClose(new Vec2(0, 1).anglePositive().radians(), Math.PI / 2);
    expectClose(new Vec2(-1, 0).anglePositive().radians(), Math.PI);
    expectClose(new Vec2(0, -1).anglePositive().radians(), (3 * Math.PI) / 2);
  });

  test('Angle.fromPt3 is unsigned with ignoreSens and directed otherwise', () => {
    const a = new Vec2(1, 0);
    const b = new Vec2(0, 0);
    const c = new Vec2(0, 1);

    expectClose(Angle.fromPt3(a, b, c, { ignoreSens: true }).radians(), Math.PI / 2);
    expectClose(Angle.fromPt3(c, b, a, { ignoreSens: true }).radians(), Math.PI / 2);
    expectClose(Angle.fromPt3(a, b, new Vec2(-1, 0), { ignoreSens: true }).radians(), Math.PI);
    expectClose(Angle.fromPt3(a, b, c).radians(), Math.PI / 2);
    expectClose(Angle.fromPt3(c, b, a).radians(), (3 * Math.PI) / 2);
  });

  test('angle helpers reject zero-length vectors', () => {
    const zero = new Vec2(0, 0);
    const x = new Vec2(1, 0);

    expect(() => x.angleWith(zero)).toThrow('zero-length');
    expect(() => zero.anglePositive()).toThrow('zero-length');
    expect(() => Angle.fromPt3(zero, new Vec2(0, 0), x)).toThrow('zero-length');
  });

  test('transformDirection applies the linear part only', () => {
    expectVec2Close(new Vec2(0, 1).transformDirection(Mat3.translation(10, 0)), new Vec2(0, 1));
    expectVec2Close(new Vec2(1, 0).transformDirection(Mat3.rotation(Math.PI / 2)), new Vec2(0, 1));
    expectVec2Close(new Vec2(1, 2).transformDirection(Mat3.scale(2, 3)), new Vec2(2, 6));
  });
});
