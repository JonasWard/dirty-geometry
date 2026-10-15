import { describe, expect, test } from 'bun:test';
import { Mat3 } from '../../src/core/mat3';
import { Vec2 } from '../../src/core/vec2';
import { expectClose, expectVec2Close } from '../testHelpers';

describe('Mat3', () => {
  test('identity', () => {
    const m = Mat3.identity();
    expect(m.elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  test('translation', () => {
    const p = Mat3.translation(5, 10).transformPoint(new Vec2(1, 2));
    expectVec2Close(p, new Vec2(6, 12));
  });

  test('rotation', () => {
    const p = Mat3.rotation(Math.PI / 2).transformPoint(new Vec2(1, 0));
    expectVec2Close(p, new Vec2(0, 1));
  });

  test('scale', () => {
    const p = Mat3.scale(2, 3).transformPoint(new Vec2(1, 1));
    expectVec2Close(p, new Vec2(2, 3));
  });

  test('multiply composes transforms', () => {
    const m = Mat3.translation(10, 0).multiply(Mat3.rotation(Math.PI / 2));
    const p = m.transformPoint(new Vec2(1, 0));

    expectClose(p.x, 10);
    expectClose(p.y, 1);
  });

  test('toJson round-trips elements', () => {
    const m = Mat3.translation(1, 2);
    expect(m.toJson()).toEqual({ type: 'Mat3', elements: [...m.elements] });
  });
});
