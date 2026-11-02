import { describe, expect, test } from 'bun:test';
import { BINARY, compare, logic, UNARY } from '../src/math';

describe('math', () => {
  test('unary', () => {
    expect([
      UNARY.neg(2),
      UNARY.abs(-3),
      UNARY.sign(-0.5),
      UNARY.round(2.5),
      UNARY.floor(-1.5),
      UNARY.ceil(1.2),
    ]).toEqual([-2, 3, -1, 3, -2, 2]);
  });
  test('binary', () => {
    expect([BINARY['+'](1, 2), BINARY['-'](1, 2), BINARY['*'](3, 2), BINARY['/'](3, 2)]).toEqual([3, -1, 6, 1.5]);
    expect([BINARY.pow(2, 10), BINARY.pow(9, 0.5), BINARY.min(2, -1), BINARY.max(2, -1)]).toEqual([1024, 3, -1, 2]);
  });
  test('mod is floored, so it wraps negative indices', () => {
    expect([BINARY.mod(5, 3), BINARY.mod(-1, 3), BINARY.mod(-4, 3), BINARY.mod(5.5, 2)]).toEqual([2, 2, 2, 1.5]);
  });
  test('compare', () => {
    expect([compare('<', 1, 2), compare('<', 2, 2), compare('>', 3, 2), compare('>', 2, 2)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(compare('==', 0.1 + 0.2, 0.3)).toBe(true);
    expect(compare('==', 1, 1.001)).toBe(false);
    expect(compare('==', 1, 1.001, 0.01)).toBe(true);
  });
  test('logic', () => {
    expect([logic('and', true, false), logic('or', true, false), logic('not', true)]).toEqual([false, true, false]);
  });
  describe('trigonometry', () => {
    const PI = Math.PI;
    test('sin, cos, tan, cot', () => {
      expect(UNARY.sin(PI / 2)).toBe(1);
      expect(UNARY.cos(PI)).toBe(-1);
      expect(UNARY.tan(PI / 4)).toBeCloseTo(1, 12);
      expect(UNARY.cot(PI / 4)).toBeCloseTo(1, 12);
      expect(UNARY.cot(0)).toBe(Infinity);
    });
    test('inverses undo their functions on their ranges', () => {
      for (const t of [-1.5, -0.7, 0, 0.3, 1.2]) {
        expect(UNARY.asin(UNARY.sin(t))!).toBeCloseTo(t, 12);
        expect(UNARY.atan(UNARY.tan(t))).toBeCloseTo(t, 12);
      }
      for (const t of [0.1, 1, 2, 3]) {
        expect(UNARY.acos(UNARY.cos(t))!).toBeCloseTo(t, 12);
        expect(UNARY.acot(UNARY.cot(t))).toBeCloseTo(t, 12);
      }
    });
    test('asin and acos are null outside -1..1', () => {
      expect(UNARY.asin(1.0000001)).toBeNull();
      expect(UNARY.acos(-2)).toBeNull();
      expect(UNARY.asin(1)).toBe(PI / 2);
      expect(UNARY.acos(-1)).toBe(PI);
    });
    test('acot is continuous, in (0, π)', () => {
      expect(UNARY.acot(0)).toBe(PI / 2);
      expect(UNARY.acot(-1)).toBeCloseTo((3 * PI) / 4, 12);
      expect(Math.abs(UNARY.acot(1e-9) - UNARY.acot(-1e-9))).toBeLessThan(1e-8);
    });
    test('atan2 covers all four quadrants', () => {
      expect(BINARY.atan2(1, 1)).toBeCloseTo(PI / 4, 12);
      expect(BINARY.atan2(1, -1)).toBeCloseTo((3 * PI) / 4, 12);
      expect(BINARY.atan2(-1, -1)).toBeCloseTo((-3 * PI) / 4, 12);
      expect(BINARY.atan2(-1, 1)).toBeCloseTo(-PI / 4, 12);
      expect(BINARY.atan2(0, -1)).toBe(PI);
    });
  });
  test('logarithms, null for 0 and below', () => {
    expect([UNARY.ln(Math.E), UNARY.log2(8), UNARY.log10(1000), UNARY.ln(1)]).toEqual([1, 3, 3, 0]);
    expect(UNARY.log10(0.01)).toBe(-2);
    expect([UNARY.ln(0), UNARY.log2(-1), UNARY.log10(-0)]).toEqual([null, null, null]);
  });
});
