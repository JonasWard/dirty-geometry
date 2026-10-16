import { describe, expect, test } from 'bun:test';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { bresenhamLine } from '../../src/grid/helper/bresenham';
import { GridLine2 } from '../../src/grid/regions/grid-line2';

function cellKeys(cells: { i: number; j: number }[]): string[] {
  return cells.map((c) => `${c.i},${c.j}`);
}

function line(from: GridCell2, to: GridCell2): GridLine2 {
  return new GridLine2(from, to);
}

describe('bresenhamLine', () => {
  test('horizontal line', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(0, 2), new GridCell2(4, 2))))).toEqual([
      '0,2',
      '1,2',
      '2,2',
      '3,2',
      '4,2',
    ]);
  });

  test('vertical line', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(2, 0), new GridCell2(2, 4))))).toEqual([
      '2,0',
      '2,1',
      '2,2',
      '2,3',
      '2,4',
    ]);
  });

  test('diagonal line', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(0, 0), new GridCell2(4, 4))))).toEqual([
      '0,0',
      '1,1',
      '2,2',
      '3,3',
      '4,4',
    ]);
  });

  test('degenerate point', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(3, 3), new GridCell2(3, 3))))).toEqual(['3,3']);
  });

  test('steep diagonal', () => {
    const cells = bresenhamLine(line(new GridCell2(0, 4), new GridCell2(4, 0)));
    expect(cells[0]).toEqual(new GridCell2(0, 4));
    expect(cells[cells.length - 1]).toEqual(new GridCell2(4, 0));
    expect(cells.length).toBe(5);
  });

  test('shallow slope with repeated row visits', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(0, 0), new GridCell2(6, 2))))).toEqual([
      '0,0',
      '1,0',
      '2,1',
      '3,1',
      '4,1',
      '5,2',
      '6,2',
    ]);
  });

  test('steep slope with repeated column visits', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(0, 0), new GridCell2(2, 6))))).toEqual([
      '0,0',
      '0,1',
      '1,2',
      '1,3',
      '1,4',
      '2,5',
      '2,6',
    ]);
  });

  test('line across negative indexes', () => {
    expect(cellKeys(bresenhamLine(line(new GridCell2(-2, -1), new GridCell2(1, -1))))).toEqual([
      '-2,-1',
      '-1,-1',
      '0,-1',
      '1,-1',
    ]);
  });
});
