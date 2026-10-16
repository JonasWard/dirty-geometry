import { describe, expect, test } from 'bun:test';
import { pairwiseDifference, partialSum } from '../../../src/analysis/aggregation';
import { Line2 } from '../../../src/geometry/primitives/line2';
import { Vec2 } from '../../../src/core/vec2';
import { Epsilon } from '../../../src/core/epsilon';
import { buildGrid2FromWorldVertices } from '../../../src/operations/polygon-analysis/grid-from-world';

describe('partialSum', () => {
  test('empty input', () => {
    expect(partialSum([])).toEqual([]);
    expect(partialSum([], true)).toEqual([0]);
  });

  test('inclusive prefixes without leading zero', () => {
    expect(partialSum([1, 2, 3])).toEqual([1, 3, 6]);
  });

  test('inclusive prefixes with leading zero', () => {
    expect(partialSum([1, 2, 3], true)).toEqual([0, 1, 3, 6]);
  });

  test('singleton', () => {
    expect(partialSum([4])).toEqual([4]);
    expect(partialSum([4], true)).toEqual([0, 4]);
  });
});

describe('pairwiseDifference', () => {
  test('empty / singleton → []', () => {
    expect(pairwiseDifference([])).toEqual([]);
    expect(pairwiseDifference([3])).toEqual([]);
  });

  test('consecutive first differences', () => {
    expect(pairwiseDifference([0, 2, 5, 5])).toEqual([2, 3, 0]);
  });

  test('inverts partialSum with startAtZero', () => {
    const spans = [1.5, 2, 0.5];
    expect(pairwiseDifference(partialSum(spans, true))).toEqual(spans);
  });
});

describe('aggregation call sites', () => {
  test('Line2.lengthTable uses partialSum', () => {
    const segments = [new Line2(new Vec2(0, 0), new Vec2(3, 0)), new Line2(new Vec2(3, 0), new Vec2(3, 4))];
    expect(Line2.lengthTable(segments)).toEqual([0, 3, 7]);
    expect(Line2.lengthTable([])).toEqual([0]);
  });

  test('buildGrid2FromWorldVertices spans match pairwiseDifference of clustered coords', () => {
    const epsilon = Epsilon.custom(1e-3);
    const result = buildGrid2FromWorldVertices(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 5), new Vec2(0, 5)],
      epsilon,
    );
    expect(result.extent.columnCount()).toBe(1);
    expect(result.extent.rowCount()).toBe(1);
    expect(result.grid.u.size(0)).toBeCloseTo(2);
    expect(result.grid.v.size(0)).toBeCloseTo(5);
  });
});
