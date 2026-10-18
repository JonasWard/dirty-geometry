import { describe, expect, test } from 'bun:test';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { GridCell2Collection } from '../../src/grid/regions/grid-cell2-collection';
import { GridLine2 } from '../../src/grid/regions/grid-line2';
import { GridPolyline2 } from '../../src/grid/regions/grid-polyline2';
import { GridRectangle2 } from '../../src/grid/regions/grid-rectangle2';
import type { GridGeometry2 } from '../../src/grid/regions/kinds';
import { gridLineExamples, gridPolygonExamples } from '../../examples/grid/geometry-examples';
import {
  evaluateChainScenario,
  evaluateGridScenario,
  evaluateSetOpScenario,
  evaluateUnionIterateScenario,
  grid2ChainScenarios,
  grid2DifferenceScenarios,
  grid2IntersectionScenarios,
  grid2LineScenarios,
  grid2PolylineScenarios,
  grid2UnionIterateScenarios,
  grid2VariableSetOpScenarios,
  grid2XorScenarios,
  unionGridGeometries,
} from '../../examples/grid2/scenarios';

function cellKeys(cells: Iterable<{ i: number; j: number }>): string[] {
  return [...cells].map((cell) => `${cell.i},${cell.j}`);
}

describe('CellCollection', () => {
  test('deduplicates cells', () => {
    const collection = new GridCell2Collection([new GridCell2(0, 0), new GridCell2(0, 0), new GridCell2(1, 0)]);
    expect(collection.size()).toBe(2);
  });

  test('union merges collections', () => {
    const a = new GridCell2Collection([new GridCell2(0, 0)]);
    const b = new GridCell2Collection([new GridCell2(1, 0)]);
    expect(GridCell2Collection.union(a, b).size()).toBe(2);
  });

  test('intersection keeps shared cells', () => {
    const a = new GridCell2Collection([new GridCell2(0, 0), new GridCell2(1, 0), new GridCell2(1, 1)]);
    const b = new GridCell2Collection([new GridCell2(1, 0), new GridCell2(1, 1), new GridCell2(2, 1)]);
    const result = GridCell2Collection.intersection(a, b);

    expect(result.size()).toBe(2);
    expect(result.has(new GridCell2(1, 0))).toBe(true);
    expect(result.has(new GridCell2(1, 1))).toBe(true);
  });

  test('difference removes right cells from left', () => {
    const a = new GridRectangle2(new GridCell2(0, 0), new GridCell2(2, 2)).toCellCollection();
    const b = new GridRectangle2(new GridCell2(1, 1), new GridCell2(2, 2)).toCellCollection();
    const result = GridCell2Collection.difference(a, b);

    expect(result.size()).toBe(5);
    expect(result.has(new GridCell2(0, 0))).toBe(true);
    expect(result.has(new GridCell2(2, 2))).toBe(false);
  });

  test('xor keeps cells in exactly one collection', () => {
    const a = new GridRectangle2(new GridCell2(0, 0), new GridCell2(2, 2)).toCellCollection();
    const b = new GridRectangle2(new GridCell2(1, 1), new GridCell2(3, 3)).toCellCollection();
    const result = GridCell2Collection.xor(a, b);

    expect(result.has(new GridCell2(1, 1))).toBe(false);
    expect(result.has(new GridCell2(0, 0))).toBe(true);
    expect(result.has(new GridCell2(3, 3))).toBe(true);
  });

  test('instance methods mirror static ops', () => {
    const a = new GridCell2Collection([new GridCell2(0, 0), new GridCell2(1, 0)]);
    const b = new GridCell2Collection([new GridCell2(1, 0), new GridCell2(2, 0)]);

    expect(a.intersect(b).size()).toBe(1);
    expect(a.subtract(b).size()).toBe(1);
    expect(a.toggle(b).size()).toBe(2);
  });

  test('is a GridGeometry2 via toCellCollection', () => {
    const collection = new GridCell2Collection([new GridCell2(0, 0)]);
    const geometry: GridGeometry2 = collection;
    expect(geometry.toCellCollection().size()).toBe(1);
  });
});

describe('GridLine2', () => {
  test('toCellCollection horizontal', () => {
    const line = new GridLine2(new GridCell2(0, 2), new GridCell2(4, 2));
    expect(line.toCellCollection().size()).toBe(5);
  });

  test('shallow slope visits multiple rows without a 45° diagonal', () => {
    expect(cellKeys(gridLineExamples.shallowSlope.toCellCollection())).toEqual([
      '0,0',
      '1,0',
      '2,1',
      '3,1',
      '4,1',
      '5,2',
      '6,2',
    ]);
  });

  test('steep slope steps mostly in j with occasional i bumps', () => {
    expect(cellKeys(gridLineExamples.steepSlope.toCellCollection())).toEqual([
      '0,0',
      '0,1',
      '1,2',
      '1,3',
      '1,4',
      '2,5',
      '2,6',
    ]);
  });

  test('gentle rise line steps through staggered rows', () => {
    expect(cellKeys(gridLineExamples.gentleRise.toCellCollection())).toEqual([
      '1,1',
      '2,1',
      '3,2',
      '4,2',
      '5,3',
      '6,3',
      '7,4',
    ]);
  });

  test('backward shallow line follows its own Bresenham path', () => {
    expect(cellKeys(gridLineExamples.backwardShallow.toCellCollection())).toEqual([
      '7,4',
      '6,4',
      '5,3',
      '4,3',
      '3,2',
      '2,2',
      '1,1',
    ]);
  });

  test('degenerate point is a single cell', () => {
    const collection = gridLineExamples.degeneratePoint.toCellCollection();
    expect(collection.size()).toBe(1);
    expect(collection.has(new GridCell2(3, 2))).toBe(true);
  });
});

describe('GridPolyline2', () => {
  test('deduplicates overlapping segment cells', () => {
    const polyline = new GridPolyline2([new GridCell2(0, 0), new GridCell2(2, 0), new GridCell2(2, 2)]);
    const collection = polyline.toCellCollection();
    expect(collection.has(new GridCell2(2, 0))).toBe(true);
    expect(collection.size()).toBeLessThan(7);
  });
});

describe('GridRectangle2', () => {
  test('fills inclusive bounds', () => {
    const rect = new GridRectangle2(new GridCell2(1, 1), new GridCell2(2, 2));
    expect(rect.toCellCollection().size()).toBe(4);
  });

  test('normalizes corner order', () => {
    const rect = new GridRectangle2(new GridCell2(3, 3), new GridCell2(1, 1));
    expect(rect.bottomLeft.equals(new GridCell2(1, 1))).toBe(true);
    expect(rect.topRight.equals(new GridCell2(3, 3))).toBe(true);
  });
});

describe('GridPolygon2', () => {
  test('fills L-shape interior', () => {
    const collection = gridPolygonExamples.lShape.toCellCollection();
    expect(collection.size()).toBeGreaterThan(6);
    expect(collection.has(new GridCell2(0, 1))).toBe(true);
  });

  test('concave notch excludes the re-entrant corner cell', () => {
    const collection = gridPolygonExamples.concaveNotch.toCellCollection();

    expect(collection.has(new GridCell2(1, 1))).toBe(true);
    expect(collection.has(new GridCell2(3, 1))).toBe(true);
    expect(collection.has(new GridCell2(1, 3))).toBe(true);
    expect(collection.has(new GridCell2(3, 3))).toBe(false);
  });

  test('U-shape leaves the cavity empty', () => {
    const collection = gridPolygonExamples.uShape.toCellCollection();

    expect(collection.has(new GridCell2(0, 2))).toBe(true);
    expect(collection.has(new GridCell2(3, 2))).toBe(true);
    expect(collection.has(new GridCell2(2, 2))).toBe(false);
    expect(collection.has(new GridCell2(2, 3))).toBe(false);
  });

  test('H-plate outline follows concave boundary segments', () => {
    const polygon = gridPolygonExamples.hPlate;

    expect(polygon.toCellCollection().size()).toBe(22);
    expect(polygon.outlineCellCollection().has(new GridCell2(2, 3))).toBe(true);
    expect(polygon.toCellCollection().has(new GridCell2(0, 2))).toBe(true);
    expect(polygon.toCellCollection().has(new GridCell2(4, 2))).toBe(true);
  });

  test('arrowhead polygon fills tip and shaft separately from wings', () => {
    const collection = gridPolygonExamples.arrowhead.toCellCollection();

    expect(collection.has(new GridCell2(2, 1))).toBe(true);
    expect(collection.has(new GridCell2(2, 3))).toBe(true);
    expect(collection.has(new GridCell2(0, 3))).toBe(false);
    expect(collection.has(new GridCell2(4, 3))).toBe(false);
  });
});

describe('CellCollection union', () => {
  test('unions multiple geometries', () => {
    const collection = GridCell2Collection.union(
      new GridLine2(new GridCell2(0, 0), new GridCell2(1, 0)).toCellCollection(),
      new GridRectangle2(new GridCell2(2, 0), new GridCell2(2, 0)).toCellCollection(),
    );
    expect(collection.size()).toBe(3);
  });
});

describe('grid2 set-op scenarios', () => {
  test('H-plate intersection is non-empty and smaller than operands', () => {
    const scenario = grid2IntersectionScenarios[0]!;
    const left = scenario.left.toCellCollection().size();
    const result = evaluateSetOpScenario(scenario).size();
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(left);
  });

  test('rectangle difference removes overlap', () => {
    const scenario = grid2DifferenceScenarios[1]!;
    const result = evaluateSetOpScenario(scenario).size();
    expect(result).toBeGreaterThan(0);
  });

  test('offset rectangles xor excludes overlap twice', () => {
    const scenario = grid2XorScenarios[0]!;
    const left = scenario.left.toCellCollection();
    const right = scenario.right.toCellCollection();
    const xorSize = evaluateSetOpScenario(scenario).size();
    const intersectionSize = GridCell2Collection.intersection(left, right).size();

    expect(xorSize).toBe(left.size() + right.size() - 2 * intersectionSize);
  });
});

describe('grid2 union iterate scenarios', () => {
  test('unionGridGeometries folds mixed types', () => {
    const geometries = grid2UnionIterateScenarios[0]!.geometries;
    const iterated = unionGridGeometries(geometries);
    const manual = GridCell2Collection.union(...geometries.map((geometry) => geometry.toCellCollection()));

    expect(iterated.size()).toBe(manual.size());
    expect(iterated.size()).toBeGreaterThan(0);
  });

  test('floor plan iterate is non-empty', () => {
    const scenario = grid2UnionIterateScenarios[0]!;
    const parts = scenario.geometries.map((geometry) => geometry.toCellCollection().size());
    const result = evaluateUnionIterateScenario(scenario).size();

    expect(result).toBeGreaterThan(Math.max(...parts));
  });

  test('variable grid union iterate uses custom cell sizes', () => {
    const scenario = grid2UnionIterateScenarios[2]!;
    expect(Object.keys(scenario.grid.u.customSizes()).length).toBeGreaterThan(0);
    expect(evaluateUnionIterateScenario(scenario).size()).toBeGreaterThan(0);
  });
});

describe('grid2 variable set-op scenarios', () => {
  test('striped grid intersection is non-empty', () => {
    const scenario = grid2VariableSetOpScenarios[3]!;
    expect(evaluateSetOpScenario(scenario).size()).toBeGreaterThan(0);
  });
});

describe('grid2 chain scenarios', () => {
  test('H ∩ spine − cross is non-empty and smaller than H-plate', () => {
    const scenario = grid2ChainScenarios[0]!;
    const hSize = scenario.operands[0]!.toCellCollection().size();
    const result = evaluateChainScenario(scenario).size();
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(hSize);
  });

  test('chain length matches operands minus one', () => {
    for (const scenario of grid2ChainScenarios) {
      expect(scenario.operations.length).toBe(scenario.operands.length - 1);
    }
  });
});

describe('grid2 scenarios', () => {
  test('horizontal line scenario', () => {
    const scenario = grid2LineScenarios[0]!;
    expect(evaluateGridScenario(scenario).size()).toBe(5);
  });

  test('L-shape polygon scenario', () => {
    const scenario = grid2PolylineScenarios[1]!;
    expect(evaluateGridScenario(scenario).size()).toBeGreaterThan(6);
  });
});
