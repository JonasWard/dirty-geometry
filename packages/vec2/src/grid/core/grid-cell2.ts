import { dehash2, hash2 } from '../../hash/core';
import { GRID_MAX_INDEX, GRID_MIN_INDEX } from './limits';

/** Integer grid index pair. World position is derived via `Grid2` + `Frame2`. */
export class GridCell2 {
  static readonly type = 'GridCell2' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof GridCell2.type {
    return GridCell2.type;
  }

  constructor(
    public readonly i: number,
    public readonly j: number,
  ) {
    if (i < GRID_MIN_INDEX || i > GRID_MAX_INDEX || j < GRID_MIN_INDEX || j > GRID_MAX_INDEX) {
      throw new Error('Grid cell index out of bounds');
    }
  }

  equals(other: GridCell2): boolean {
    return this.i === other.i && this.j === other.j;
  }

  add(delta: GridCell2): GridCell2 {
    return new GridCell2(this.i + delta.i, this.j + delta.j);
  }

  subtract(other: GridCell2): GridCell2 {
    return new GridCell2(this.i - other.i, this.j - other.j);
  }

  /** Cells within `count` steps (Manhattan for von Neumann, Chebyshev for Moore); cells past the index limits are skipped. */
  neighbors(count = 1, type: 'vonNeumann' | 'moore' = 'vonNeumann'): GridCell2[] {
    const cells: GridCell2[] = [];
    for (let di = -count; di <= count; di++) {
      const reach = type === 'vonNeumann' ? count - Math.abs(di) : count;
      for (let dj = -reach; dj <= reach; dj++) {
        if (di === 0 && dj === 0) continue;
        const i = this.i + di;
        const j = this.j + dj;
        if (i < GRID_MIN_INDEX || i > GRID_MAX_INDEX || j < GRID_MIN_INDEX || j > GRID_MAX_INDEX) continue;
        cells.push(new GridCell2(i, j));
      }
    }
    return cells;
  }

  hash(): number {
    return hash2(this.i - GRID_MIN_INDEX, this.j - GRID_MIN_INDEX);
  }

  clone(): GridCell2 {
    return new GridCell2(this.i, this.j);
  }

  toJson(): GridCell2Json {
    return { type: GridCell2.type, i: this.i, j: this.j };
  }

  static fromHash(hash: number): GridCell2 {
    const [i, j] = dehash2(hash);
    return new GridCell2(i + GRID_MIN_INDEX, j + GRID_MIN_INDEX);
  }

  static cellsHashSet(cells: Iterable<GridCell2>): Set<number> {
    return new Set(Array.from(cells).map((cell) => cell.hash()));
  }

  static filterDuplicates(cells: Iterable<GridCell2>): GridCell2[] {
    return Array.from(GridCell2.cellsHashSet(cells)).map((hash) => GridCell2.fromHash(hash));
  }

  static cellsContain(cells: Iterable<GridCell2>, cell: GridCell2): boolean {
    return GridCell2.cellsHashSet(cells).has(cell.hash());
  }
}

export type GridCell2Json = {
  type: typeof GridCell2.type;
  i: number;
  j: number;
};
