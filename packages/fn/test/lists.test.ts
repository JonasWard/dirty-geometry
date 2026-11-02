import { describe, expect, test } from 'bun:test';
import { at, filter, generate, GENERATE_LIMIT, map, slice, sortBy } from '../src/lists';

describe('generate', () => {
  test('passes index, previous and count', () => {
    const calls: unknown[] = [];
    const items = generate(3, (i, previous, n) => (calls.push([i, previous, n]), i * 10));
    expect(items).toEqual([0, 10, 20]);
    expect(calls).toEqual([
      [0, null, 3],
      [1, 0, 3],
      [2, 10, 3],
    ]);
  });
  test('starts from initial', () => {
    expect(generate(4, (_i, previous: number | null) => previous! * 2, 1)).toEqual([2, 4, 8, 16]);
  });
  test('zero items, bad counts, and the limit', () => {
    expect(generate(0, () => 1)).toEqual([]);
    expect(() => generate(1.5, () => 1)).toThrow('whole number');
    expect(() => generate(-1, () => 1)).toThrow('whole number');
    expect(() => generate(GENERATE_LIMIT + 1, () => 1)).toThrow('at most');
    expect(generate(GENERATE_LIMIT, () => 1)).toHaveLength(GENERATE_LIMIT);
  });
});

describe('list operations', () => {
  test('map and filter pass the index', () => {
    expect(map(['a', 'b'], (s, i) => `${s}${i}`)).toEqual(['a0', 'b1']);
    expect(filter([5, 6, 7, 8], (_v, i) => i % 2 === 0)).toEqual([5, 7]);
    expect(() => filter([1], () => 1 as unknown as boolean)).toThrow('true or false');
  });
  test('sortBy is ascending, stable, and puts NaN last', () => {
    const items = [
      { k: 2, id: 'a' },
      { k: NaN, id: 'n' },
      { k: 1, id: 'b' },
      { k: 2, id: 'c' },
      { k: -Infinity, id: 'd' },
      { k: Infinity, id: 'e' },
    ];
    expect(sortBy(items, (item) => item.k).map((item) => item.id)).toEqual(['d', 'b', 'a', 'c', 'e', 'n']);
    expect(() => sortBy([1], () => 'x' as unknown as number)).toThrow('number');
  });
  test('slice and at count negative positions from the end', () => {
    expect(slice([1, 2, 3, 4], 1, -1)).toEqual([2, 3]);
    expect(slice([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect([at([1, 2, 3], 0), at([1, 2, 3], -1)]).toEqual([1, 3]);
    expect(() => at([1, 2, 3], 3)).toThrow('outside');
    expect(() => at([1, 2, 3], -4)).toThrow('outside');
    expect(() => at([1, 2, 3], 0.5)).toThrow('whole number');
  });
  test('inputs are not changed', () => {
    const items = [3, 1, 2];
    sortBy(items, (v) => v);
    expect(items).toEqual([3, 1, 2]);
  });
});
