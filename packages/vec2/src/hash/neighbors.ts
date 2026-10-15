import { dehash2, hash2, wrapHashIndex } from './core';

/**
 * Hash neighboring cells using Moore neighborhood - https://en.wikipedia.org/wiki/Moore_neighborhood
 * Indexes wrap like `hash2scale`, so cells on either side of 0 are neighbours.
 */
export function mooreNeighborCellHashes(h: number, count = 1): number[] {
  const [gi, gj] = dehash2(h);
  const hashes: number[] = [];
  for (let di = -count; di <= count; di++) {
    for (let dj = -count; dj <= count; dj++) {
      if (di === 0 && dj === 0) continue;
      hashes.push(hash2(wrapHashIndex(gi + di), wrapHashIndex(gj + dj)));
    }
  }
  return hashes;
}

/** hash neighboring cells using von Neumann neighborhood - https://en.wikipedia.org/wiki/Von_Neumann_neighborhood */
export function vonNeumannNeighborCellHashes(h: number, count = 1): number[] {
  const [gi, gj] = dehash2(h);
  const hashes: number[] = [];
  for (let di = -count; di <= count; di++) {
    const yCount = count - Math.abs(di);
    for (let dj = -yCount; dj <= yCount; dj++) {
      if (di === 0 && dj === 0) continue;
      hashes.push(hash2(wrapHashIndex(gi + di), wrapHashIndex(gj + dj)));
    }
  }
  return hashes;
}
