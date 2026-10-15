import { describe, expect, test } from 'bun:test';
import { Epsilon } from '../../../src/core/epsilon';
import {
  clusterByCenter,
  clusterByDbscan,
  clusterByGap,
  clusterByKmeans,
  clusterByRange,
} from '../../../src/analysis/clustering';

const eps = Epsilon.custom(0.1);
const tight = Epsilon.custom(1e-3);

function membersOf(clusters: { members: readonly number[] }[]): number[][] {
  return clusters.map((c) => [...c.members]);
}

describe('1D clustering shared behaviour', () => {
  const algos: Array<{
    name: string;
    run: (values: readonly number[], epsilon: Epsilon) => { members: readonly number[] }[];
  }> = [
    { name: 'gap', run: (v, e) => clusterByGap(v, e) },
    { name: 'range', run: (v, e) => clusterByRange(v, e) },
    { name: 'center', run: (v, e) => clusterByCenter(v, e) },
    {
      name: 'dbscan',
      run: (v, e) => clusterByDbscan(v, e, []),
    },
    { name: 'kmeans', run: (v, e) => clusterByKmeans(v, e, { k: Math.max(1, Math.min(2, v.length || 1)) }) },
  ];

  for (const algo of algos) {
    test(`${algo.name}: empty input → []`, () => {
      expect(algo.run([], eps)).toEqual([]);
    });

    test(`${algo.name}: singleton`, () => {
      if (algo.name === 'dbscan') {
        const noise: number[] = [];
        expect(clusterByDbscan([4.2], eps, noise)).toEqual([]);
        expect(noise).toEqual([4.2]);
        return;
      }
      const clusters = algo.run([4.2], eps);
      expect(membersOf(clusters)).toEqual([[4.2]]);
    });

    test(`${algo.name}: rejects preferOut / negative epsilon`, () => {
      expect(() => algo.run([0, 1], Epsilon.preferOut)).toThrow();
      expect(() => algo.run([0, 1], Epsilon.custom(-1e-3))).toThrow();
    });
  }
});

describe('clusterByGap', () => {
  test('splits on consecutive gaps > T', () => {
    expect(membersOf(clusterByGap([0, 0.05, 1, 1.02, 5], eps))).toEqual([[0, 0.05], [1, 1.02], [5]]);
  });

  test('sorts unsorted input', () => {
    expect(membersOf(clusterByGap([5, 0.05, 0, 1.02, 1], eps))).toEqual([[0, 0.05], [1, 1.02], [5]]);
  });
});

describe('clusterByRange', () => {
  test('grows while max − min ≤ T', () => {
    expect(membersOf(clusterByRange([0, 0.05, 0.08, 0.15, 0.2], eps))).toEqual([
      [0, 0.05, 0.08],
      [0.15, 0.2],
    ]);
  });

  test('differs from gap when intermediate points bridge a wide span', () => {
    const values = [0, 0.06, 0.12, 0.18];
    expect(membersOf(clusterByGap(values, eps))).toEqual([[0, 0.06, 0.12, 0.18]]);
    expect(membersOf(clusterByRange(values, eps))).toEqual([
      [0, 0.06],
      [0.12, 0.18],
    ]);
  });
});

describe('clusterByCenter', () => {
  test('matches Epsilon.clusterSortedValues means', () => {
    const values = [0, 0.0005, 1, 1.0004, 2];
    const clusters = clusterByCenter(values, tight);
    expect(clusters.map((c) => c.mean)).toEqual(tight.clusterSortedValues([...values]));
  });

  test('chains successive averages into mean', () => {
    const clusters = clusterByCenter([0, 0.5, 0.9, 3], Epsilon.custom(1));
    expect(clusters.map((c) => c.mean)).toEqual([0.575, 3]);
    expect(membersOf(clusters)).toEqual([[0, 0.5, 0.9], [3]]);
  });
});

describe('clusterByDbscan', () => {
  test('writes isolates to noise out-array', () => {
    const noise: number[] = [99];
    const clusters = clusterByDbscan([0, 0.05, 1, 5, 5.05], eps, noise, { minPoints: 2 });
    expect(membersOf(clusters)).toEqual([
      [0, 0.05],
      [5, 5.05],
    ]);
    expect(noise).toEqual([1]);
  });

  test('clears noise before filling', () => {
    const noise = [1, 2, 3];
    clusterByDbscan([], eps, noise);
    expect(noise).toEqual([]);
  });

  test('all noise when no dense cores', () => {
    const noise: number[] = [];
    const clusters = clusterByDbscan([0, 1, 2], Epsilon.custom(0.1), noise, { minPoints: 2 });
    expect(clusters).toEqual([]);
    expect(noise).toEqual([0, 1, 2]);
  });
});

describe('clusterByKmeans', () => {
  test('splits two well-separated groups with k=2', () => {
    const clusters = clusterByKmeans([0, 0.1, 0.2, 10, 10.1, 10.2], eps, { k: 2 });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.members).toEqual([0, 0.1, 0.2]);
    expect(clusters[1]!.members).toEqual([10, 10.1, 10.2]);
  });

  test('invalid k throws', () => {
    expect(() => clusterByKmeans([0, 1], eps, { k: 0 })).toThrow();
    expect(() => clusterByKmeans([0, 1], eps, { k: 3 })).toThrow();
  });
});
