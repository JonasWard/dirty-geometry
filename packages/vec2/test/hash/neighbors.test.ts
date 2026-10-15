import { describe, expect, test } from 'bun:test';
import { dehash2, hash2, hash2scale } from '../../src/hash/core';
import { mooreNeighborCellHashes, vonNeumannNeighborCellHashes } from '../../src/hash/neighbors';

const WRAP = 2 ** 26;

describe('neighbour cell hashes', () => {
  test('wrap the same way as hash2scale at index 0 (M5)', () => {
    const origin = hash2scale(0, 0, 1);
    const neighbours = new Set(mooreNeighborCellHashes(origin));
    expect(neighbours.has(hash2scale(-1, 0, 1))).toBe(true);
    expect(neighbours.has(hash2scale(0, -1, 1))).toBe(true);
    expect(neighbours.has(hash2scale(-1, -1, 1))).toBe(true);
    expect(neighbours.size).toBe(8);
  });

  test('stay valid hashes and never borrow from the other index (M5)', () => {
    for (const hash of [...mooreNeighborCellHashes(hash2(5, 0), 2), ...vonNeumannNeighborCellHashes(hash2(0, 5), 2)]) {
      const [i, j] = dehash2(hash);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(WRAP);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(WRAP);
    }
    expect(vonNeumannNeighborCellHashes(hash2(5, 0))).toContain(hash2(5, WRAP - 1));
  });
});
