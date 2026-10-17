import { describe, expect, test } from 'bun:test';
import { clusterSortedValues } from '../../src/analysis/clustering/center';
import { Epsilon } from '../../src/core/epsilon';
import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { DouglasPeucker } from '../../src/operations/douglas-peucker';
import { isAxisAlignedPolygonPath } from '../../src/operations/helpers/grid-polygon-path';
import { RectilinearGrid2 } from '../../src/operations/rectilinear-grid2';
import {
  exampleBuildingFootprintPolygon,
  exampleNotchPolygon,
  rectangleDetectionExamples,
} from '../../examples/grid/rectangle-detection-examples';
import { GridCell2 } from '../../src/grid/core/grid-cell2';
import { GridCell2Collection } from '../../src/grid/regions/grid-cell2-collection';

describe('clusterSortedValues', () => {
  test('merges coordinates within epsilon', () => {
    const epsilon = Epsilon.custom(1e-3);
    expect(clusterSortedValues([0, 0.0005, 1, 1.0004, 2], epsilon)).toEqual([0.00025, 1.0002, 2]);
  });

  test('returns empty / singleton unchanged', () => {
    const epsilon = Epsilon.custom(1e-3);
    expect(clusterSortedValues([], epsilon)).toEqual([]);
    expect(clusterSortedValues([4.2], epsilon)).toEqual([4.2]);
  });

  test('sorts before clustering', () => {
    const epsilon = Epsilon.custom(1e-3);
    expect(clusterSortedValues([2, 0.0005, 0, 1.0004, 1], epsilon)).toEqual([0.00025, 1.0002, 2]);
  });

  test('keeps values farther than epsilon apart', () => {
    const epsilon = Epsilon.custom(1e-3);
    expect(clusterSortedValues([0, 0.002, 1], epsilon)).toEqual([0, 0.002, 1]);
  });

  test('larger epsilon collapses a wider run into one average', () => {
    const epsilon = Epsilon.custom(0.1);
    // 0 + 0.05 → 0.025; 0.025 + 0.1 → 0.0625
    expect(clusterSortedValues([0, 0.05, 0.1], epsilon)).toEqual([0.0625]);
  });

  test('tighter epsilon refuses a merge that a looser one accepts', () => {
    const values = [0, 5e-4, 1];
    expect(clusterSortedValues(values, Epsilon.custom(1e-3))).toEqual([2.5e-4, 1]);
    expect(clusterSortedValues(values, Epsilon.custom(1e-4))).toEqual([0, 5e-4, 1]);
  });

  test('preferIn clusters near-duplicates at default tolerance', () => {
    const epsilon = Epsilon.preferIn;
    expect(clusterSortedValues([0, Epsilon.value * 0.5, 1], epsilon)).toEqual([Epsilon.value * 0.25, 1]);
  });

  test('negative and preferOut epsilons are rejected', () => {
    expect(() => clusterSortedValues([0, 1], Epsilon.preferOut)).toThrow();
    expect(() => clusterSortedValues([0, 1], Epsilon.custom(-1e-3))).toThrow();
  });

  test('chains pairwise merges into a running mean', () => {
    const epsilon = Epsilon.custom(1);
    // 0 + 0.5 → 0.25; 0.25 + 0.9 → 0.575; next 3 is outside
    expect(clusterSortedValues([0, 0.5, 0.9, 3], epsilon)).toEqual([0.575, 3]);
  });
});

describe('RectilinearGrid2.fromVertices', () => {
  test('builds frame at minimum clustered coordinates', () => {
    const epsilon = Epsilon.preferIn;
    const layout = RectilinearGrid2.fromVertices(
      [new Vec2(1, 2), new Vec2(4, 2), new Vec2(4, 5), new Vec2(1, 5)],
      epsilon,
    );

    expect(layout.grid.frame.origin.x).toBeCloseTo(1);
    expect(layout.grid.frame.origin.y).toBeCloseTo(2);
    expect(layout.extent.columnCount()).toBe(1);
    expect(layout.extent.rowCount()).toBe(1);
    expect(layout.grid.columnWidth(0)).toBeCloseTo(3);
    expect(layout.grid.rowHeight(0)).toBeCloseTo(3);
  });

  test('stores custom column widths from coordinate spans', () => {
    const epsilon = Epsilon.preferIn;
    const layout = RectilinearGrid2.fromVertices(
      [new Vec2(0, 0), new Vec2(2, 0), new Vec2(5, 0), new Vec2(5, 1), new Vec2(0, 1)],
      epsilon,
    );

    expect(layout.extent.columnCount()).toBe(2);
    expect(layout.grid.columnWidth(0)).toBe(2);
    expect(layout.grid.columnWidth(1)).toBe(3);
  });

  test('rejects non-positive epsilon', () => {
    expect(() => RectilinearGrid2.fromVertices([new Vec2(0, 0), new Vec2(1, 1)], Epsilon.preferOut)).toThrow();
  });
});

describe('RectilinearGrid2.decompose', () => {
  test('partitions aligned horizontal runs into a minimum cover', () => {
    const occupied = new GridCell2Collection([
      new GridCell2(0, 0),
      new GridCell2(0, 1),
      new GridCell2(1, 0),
      new GridCell2(1, 1),
      new GridCell2(2, 0),
    ]);

    expect(RectilinearGrid2.decompose(occupied)).toHaveLength(2);
  });
});

describe('RectilinearGrid2.detect', () => {
  test('building footprint yields a minimal two-rectangle cover', () => {
    const detection = RectilinearGrid2.detect([exampleBuildingFootprintPolygon], Epsilon.preferIn);

    expect(detection.extent.columnCount()).toBe(7);
    expect(detection.extent.rowCount()).toBe(5);
    expect(detection.rectangles).toHaveLength(2);

    const covered = detection.rectangles.reduce((sum, rectangle) => sum + rectangle.toCellCollection().size(), 0);
    expect(covered).toBe(30);
    expect(detection.gridPolygons).toHaveLength(1);
    expect(detection.gridPolygons[0]!.vertices.length).toBeGreaterThanOrEqual(3);
    expect(isAxisAlignedPolygonPath(detection.gridPolygons[0]!.vertices)).toBe(true);
  });

  test('notch polygon decomposes into two rectangles', () => {
    const detection = RectilinearGrid2.detect([exampleNotchPolygon], Epsilon.preferIn);

    expect(detection.extent.columnCount()).toBe(2);
    expect(detection.extent.rowCount()).toBe(2);
    expect(detection.rectangles).toHaveLength(2);

    const covered = detection.rectangles.reduce((sum, rectangle) => sum + rectangle.toCellCollection().size(), 0);
    expect(covered).toBe(3);
  });

  test('axis-aligned world rectangle maps to one grid rectangle', () => {
    const polygon = new Polygon2([new Vec2(0, 0), new Vec2(4, 0), new Vec2(4, 3), new Vec2(0, 3)]);
    const detection = RectilinearGrid2.detect([polygon], Epsilon.preferIn);

    expect(detection.rectangles).toHaveLength(1);
    expect(detection.rectangles[0]!.toCellCollection().size()).toBe(1);
    expect(isAxisAlignedPolygonPath(detection.gridPolygons[0]!.vertices)).toBe(true);
  });

  test('hessdorf floors detect shared grids from one or more polygons', () => {
    const floors = rectangleDetectionExamples.filter((example) => example.name.startsWith('Hessdorf'));
    expect(floors.length).toBeGreaterThanOrEqual(2);

    for (const floor of floors) {
      const detection = RectilinearGrid2.detect([...floor.polygons], Epsilon.preferIn, {
        simplify: DouglasPeucker.gridDefaults,
      });

      expect(detection.sourcePolygons.length).toBe(floor.polygons.length);
      expect(detection.gridPolygons.length).toBe(floor.polygons.length);
      expect(detection.extent.columnCount()).toBeGreaterThanOrEqual(1);
      expect(detection.extent.rowCount()).toBeGreaterThanOrEqual(1);
      expect(detection.rectangles.length).toBeGreaterThanOrEqual(1);

      const covered = detection.rectangles.reduce((sum, rectangle) => sum + rectangle.toCellCollection().size(), 0);
      expect(covered).toBeGreaterThan(0);
      for (const gridPolygon of detection.gridPolygons) {
        expect(isAxisAlignedPolygonPath(gridPolygon.vertices)).toBe(true);
      }
    }
  });

  test('optional Douglas-Peucker simplification reduces noisy vertices', () => {
    const noisy = new Polygon2([
      ...exampleBuildingFootprintPolygon.vertices,
      new Vec2(7.667001026666667, -0.4009999930858612 + 0.001),
    ]);
    const rawCount = noisy.vertices.length;
    const detection = RectilinearGrid2.detect([noisy], Epsilon.preferIn, {
      simplify: DouglasPeucker.gridDefaults,
    });

    expect(detection.sourcePolygons[0]!.vertices.length).toBeLessThanOrEqual(rawCount);
    expect(isAxisAlignedPolygonPath(detection.gridPolygons[0]!.vertices)).toBe(true);
  });

  test('multiple disjoint polygons share one grid and keep separate boundaries', () => {
    const left = new Polygon2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)]);
    const right = new Polygon2([new Vec2(5, 0), new Vec2(7, 0), new Vec2(7, 2), new Vec2(5, 2)]);
    const detection = RectilinearGrid2.detect([left, right], Epsilon.preferIn);

    expect(detection.sourcePolygons).toHaveLength(2);
    expect(detection.gridPolygons).toHaveLength(2);
    expect(detection.extent.columnCount()).toBeGreaterThanOrEqual(3);
    expect(detection.rectangles.length).toBeGreaterThanOrEqual(2);

    const covered = detection.rectangles.reduce((sum, rectangle) => sum + rectangle.toCellCollection().size(), 0);
    expect(covered).toBe(2);
    for (const gridPolygon of detection.gridPolygons) {
      expect(isAxisAlignedPolygonPath(gridPolygon.vertices)).toBe(true);
    }
  });
});
