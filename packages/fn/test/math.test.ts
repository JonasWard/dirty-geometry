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
});
