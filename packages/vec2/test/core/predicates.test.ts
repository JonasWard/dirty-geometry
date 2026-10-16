import { describe, expect, test } from 'bun:test';
import { inCircle, orient } from '../../src/core/predicates';
import { Vec2 } from '../../src/core/vec2';

const V = (x: number, y: number) => new Vec2(x, y);

describe('exact predicates', () => {
  test('orient uses the same sign as Vec2.orient (CCW positive)', () => {
    for (const [a, b, c] of [
      [V(0, 0), V(1, 0), V(0, 1)],
      [V(0, 0), V(0, 1), V(1, 0)],
      [V(3, -2), V(-7, 5), V(1.5, 9)],
    ]) {
      expect(Math.sign(orient(a!, b!, c!))).toBe(Math.sign(Vec2.orient(a!, b!, c!)));
    }
    expect(orient(V(0, 0), V(1, 1), V(2, 2))).toBe(0);
  });

  test('orient is exact where floating point is not', () => {
    // a sits one ulp off the line through b and c; the naive determinant rounds to 0.
    const a = V(0.5 + 2 ** -53, 0.5);
    const b = V(12, 12);
    const c = V(24, 24);
    expect(Vec2.orient(a, b, c)).toBe(0);
    expect(orient(a, b, c)).toBeLessThan(0);
  });

  test('inCircle is positive inside a CCW circumcircle and flips for CW', () => {
    const [a, b, c] = [V(0, 0), V(1, 0), V(0, 1)];
    expect(inCircle(a, b, c, V(0.25, 0.25))).toBeGreaterThan(0);
    expect(inCircle(a, b, c, V(5, 5))).toBeLessThan(0);
    expect(inCircle(a, b, c, V(1, 1))).toBe(0);
    expect(inCircle(a, c, b, V(0.25, 0.25))).toBeLessThan(0);
  });

  test('decisions do not change with scale or offset', () => {
    const points = [V(0, 0), V(1, 0), V(0, 1), V(0.6, 0.6)];
    for (const [scale, shift] of [
      [1, 0],
      [1e-4, 0],
      [1, 1e6],
      [1e5, -3e7],
    ] as const) {
      const [a, b, c, d] = points.map((p) => V(p.x * scale + shift, p.y * scale + shift));
      expect(Math.sign(inCircle(a!, b!, c!, d!))).toBe(Math.sign(inCircle(...(points as [Vec2, Vec2, Vec2, Vec2]))));
    }
  });
});
