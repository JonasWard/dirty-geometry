/**
 * Rectilinear grids fitted to world polygons: cluster vertex coordinates into a {@link Grid2}, occupy
 * its cells, trace a grid boundary per polygon and split the occupancy into a minimum set of rectangles.
 */
import { clusterSortedValues } from '../analysis/clustering/center';
import { pairwiseDifference } from '../analysis/aggregation/pairwise-difference';
import { Interval2 } from '../bounds/interval2';
import type { Epsilon } from '../core/epsilon';
import { Frame2 } from '../core/frame2';
import { Vec2 } from '../core/vec2';
import type { Polygon2 } from '../geometry/regions/polygon2';
import { Axis } from '../grid/core/grid-axis';
import { GridCell2 } from '../grid/core/grid-cell2';
import { Grid2 } from '../grid/core/grid2';
import { GridCell2Collection } from '../grid/regions/grid-cell2-collection';
import { GridPolygon2 } from '../grid/regions/grid-polygon2';
import { GridRectangle2 } from '../grid/regions/grid-rectangle2';
import { DouglasPeucker, type DouglasPeuckerTolerances } from './douglas-peucker';
import { resolveDouglasPeuckerTolerances } from './helpers/douglas-peucker-tolerances';
import {
  axisDirection,
  directionDelta,
  ensureAxisAlignedPolygonPath,
  isAxisAlignedPolygonPath,
} from './helpers/grid-polygon-path';

export type RectilinearGrid2Fit = {
  grid: Grid2;
  /** Occupied index lattice covering columns `[0, columnCount)` and rows `[0, rowCount)`. */
  extent: GridRectangle2;
};

export type RectilinearGridDetectionOptions = {
  /** When set, simplify each world polygon before grid construction. */
  simplify?: boolean | DouglasPeuckerTolerances;
};

export type RectilinearGridDetection = RectilinearGrid2Fit & {
  /** One axis-aligned grid boundary per non-empty source polygon. */
  gridPolygons: GridPolygon2[];
  /** Minimum rectangle cover of the union of occupied cells. */
  rectangles: GridRectangle2[];
  sourcePolygons: Polygon2[];
};

export class RectilinearGrid2 {
  private constructor() {}

  /**
   * Build a shared rectilinear grid from one or more world polygons, occupy cells whose
   * centers lie in any polygon, trace a grid boundary per polygon, and decompose the
   * union occupancy into rectangles.
   */
  static detect(
    polygons: readonly Polygon2[],
    epsilon: Epsilon,
    options: RectilinearGridDetectionOptions = {},
  ): RectilinearGridDetection {
    epsilon.isPositive('RectilinearGrid2', 'detect');

    if (polygons.length === 0) {
      throw new Error('RectilinearGrid2.detect requires at least one polygon');
    }

    const simplifyTolerances = resolveDouglasPeuckerTolerances(options.simplify);
    const sourcePolygons = polygons.map((polygon) =>
      simplifyTolerances ? DouglasPeucker.simplify(polygon, simplifyTolerances) : polygon,
    );

    const { grid, extent } = RectilinearGrid2.fromPolygons(sourcePolygons, epsilon);
    const extentCells = extent.toCellCollection();

    const occupiedByPolygon = sourcePolygons.map((polygon) =>
      extentCells.filter((cell) => polygon.containsPoint(grid.cellWorldCenter(cell))),
    );
    const occupied =
      occupiedByPolygon.length === 1 ? occupiedByPolygon[0]! : GridCell2Collection.union(...occupiedByPolygon);

    const gridPolygons = occupiedByPolygon
      .filter((cells) => cells.size() > 0)
      .map((cells) => buildGridPolygon(cells, extent));
    const rectangles = RectilinearGrid2.decompose(occupied);

    return {
      grid,
      extent,
      gridPolygons,
      rectangles,
      sourcePolygons,
    };
  }

  /** Build a rectilinear grid by clustering the vertex coordinates of one or more polygons. */
  static fromPolygons(polygons: readonly Polygon2[], epsilon: Epsilon): RectilinearGrid2Fit {
    if (polygons.length === 0) {
      throw new Error('RectilinearGrid2.fromPolygons requires at least one polygon');
    }

    return RectilinearGrid2.fromVertices(
      polygons.flatMap((polygon) => polygon.vertices),
      epsilon,
    );
  }

  /** Build a rectilinear grid by clustering vertex coordinates (within `epsilon`) into columns and rows. */
  static fromVertices(vertices: readonly Vec2[], epsilon: Epsilon): RectilinearGrid2Fit {
    if (vertices.length === 0) {
      throw new Error('RectilinearGrid2.fromVertices requires at least one vertex');
    }

    const xCoordinates = clusterSortedValues(
      vertices.map((vertex) => vertex.x),
      epsilon,
    );
    const yCoordinates = clusterSortedValues(
      vertices.map((vertex) => vertex.y),
      epsilon,
    );

    if (xCoordinates.length < 2 || yCoordinates.length < 2) {
      throw new Error('RectilinearGrid2.fromVertices requires at least two distinct x and y coordinates');
    }

    const columnSpans = pairwiseDifference(xCoordinates);
    const rowSpans = pairwiseDifference(yCoordinates);
    const columnCount = columnSpans.length;
    const rowCount = rowSpans.length;

    const grid = new Grid2({
      u: axisFromSpans(columnSpans, epsilon),
      v: axisFromSpans(rowSpans, epsilon),
      frame: new Frame2(new Vec2(xCoordinates[0]!, yCoordinates[0]!)),
      epsilon,
    });

    return {
      grid,
      extent: new GridRectangle2(new GridCell2(0, 0), new GridCell2(columnCount - 1, rowCount - 1)),
    };
  }

  /** Minimum partition of occupied cells into axis-aligned grid rectangles. */
  static decompose(occupied: GridCell2Collection): GridRectangle2[] {
    if (occupied.size() === 0) {
      return [];
    }

    const candidates = enumerateFilledRectangles(occupied, GridRectangle2.fromVertices(occupied.toArray()));
    const covering = indexRectanglesByCell(candidates);

    return findMinimumPartition(occupied, covering);
  }
}

function mostCommonSpanSize(sizes: readonly number[], epsilon: Epsilon): number {
  if (sizes.length === 0) {
    throw new Error('RectilinearGrid2.fromVertices requires at least one span');
  }

  const uniqueSizes = clusterSortedValues([...sizes], epsilon);
  let bestSize = uniqueSizes[0]!;
  let bestCount = 0;

  for (const unique of uniqueSizes) {
    const count = sizes.filter((size) => epsilon.areEqual(size, unique)).length;

    if (count > bestCount || (count === bestCount && unique < bestSize)) {
      bestCount = count;
      bestSize = unique;
    }
  }

  return bestSize;
}

function axisFromSpans(spans: readonly number[], epsilon: Epsilon): Axis {
  const defaultSize = mostCommonSpanSize(spans, epsilon);
  const sizes: Record<number, number> = {};

  for (let index = 0; index < spans.length; index++) {
    const size = spans[index]!;
    if (!epsilon.areEqual(size, defaultSize)) {
      sizes[index] = size;
    }
  }

  const domain = new Interval2(0, spans.length - 1);
  return Object.keys(sizes).length === 0 ? Axis.uniform(defaultSize, domain) : Axis.custom(defaultSize, sizes, domain);
}

function buildGridPolygon(occupied: GridCell2Collection, extent: GridRectangle2): GridPolygon2 {
  const start = findBoundaryStartCell(occupied, extent);
  if (!start) {
    throw new Error('Rectilinear polygon did not produce any occupied grid cells');
  }

  let vertices = traceAxisAlignedBoundaryCells(start, occupied, extent);
  if (vertices.length < 3) {
    return gridPolygonForBounds(GridRectangle2.fromVertices(occupied.toArray()));
  }

  vertices = ensureAxisAlignedPolygonPath(vertices);

  if (!isAxisAlignedPolygonPath(vertices)) {
    throw new Error('Grid polygon path contains non axis-aligned steps');
  }

  if (vertices.length < 3) {
    return gridPolygonForBounds(new GridRectangle2(vertices[0]!, vertices[0]!));
  }

  return new GridPolygon2(vertices);
}

function gridPolygonForBounds(bounds: GridRectangle2): GridPolygon2 {
  if (bounds.bottomLeft.equals(bounds.topRight)) {
    const cell = bounds.bottomLeft;
    return new GridPolygon2([cell, cell, cell]);
  }

  return bounds.gridPolygon();
}

function findBoundaryStartCell(occupied: GridCell2Collection, extent: GridRectangle2): GridCell2 | null {
  const cells = occupied.toArray().sort((a, b) => a.j - b.j || a.i - b.i);

  for (const cell of cells) {
    if (isBoundaryCell(cell, occupied, extent)) {
      return cell;
    }
  }

  return null;
}

function isBoundaryCell(cell: GridCell2, occupied: GridCell2Collection, extent: GridRectangle2): boolean {
  if (!occupied.has(cell)) {
    return false;
  }

  for (const neighbor of cell.neighbors(1, 'vonNeumann')) {
    if (!extent.contains(neighbor) || !occupied.has(neighbor)) {
      return true;
    }
  }

  return false;
}

function traceAxisAlignedBoundaryCells(
  start: GridCell2,
  occupied: GridCell2Collection,
  extent: GridRectangle2,
): GridCell2[] {
  const vertices: GridCell2[] = [start.clone()];
  let current = start;
  let previousDirection = 2;
  const guardLimit = occupied.size() * 4;

  for (let guard = 0; guard < guardLimit; guard++) {
    const next = nextAxisAlignedBoundaryCell(current, previousDirection, occupied, extent);
    if (!next) {
      break;
    }

    if (next.cell.equals(start) && vertices.length > 2) {
      break;
    }

    if (!vertices[vertices.length - 1]!.equals(next.cell)) {
      vertices.push(next.cell);
    }

    previousDirection = next.direction;
    current = next.cell;
  }

  return vertices;
}

function nextAxisAlignedBoundaryCell(
  current: GridCell2,
  previousDirection: number,
  occupied: GridCell2Collection,
  extent: GridRectangle2,
): { cell: GridCell2; direction: number } | null {
  for (let step = 0; step < 4; step++) {
    const direction = (previousDirection + 3 + step) % 4;
    const candidate = current.add(directionDelta(direction));

    if (!extent.contains(candidate) || !isBoundaryCell(candidate, occupied, extent)) {
      continue;
    }

    const directionFromCurrent = axisDirection(current, candidate);
    if (directionFromCurrent === null) {
      continue;
    }

    return { cell: candidate, direction: directionFromCurrent };
  }

  return null;
}

function enumerateFilledRectangles(occupied: GridCell2Collection, extent: GridRectangle2): GridRectangle2[] {
  const { bottomLeft, topRight } = extent;
  const rectangles: GridRectangle2[] = [];

  for (let minI = bottomLeft.i; minI <= topRight.i; minI++) {
    for (let minJ = bottomLeft.j; minJ <= topRight.j; minJ++) {
      for (let maxI = minI; maxI <= topRight.i; maxI++) {
        for (let maxJ = minJ; maxJ <= topRight.j; maxJ++) {
          const rectangle = new GridRectangle2(new GridCell2(minI, minJ), new GridCell2(maxI, maxJ));
          if (isFullyOccupied(rectangle, occupied)) {
            rectangles.push(rectangle);
          }
        }
      }
    }
  }

  return rectangles;
}

function isFullyOccupied(rectangle: GridRectangle2, occupied: GridCell2Collection): boolean {
  for (const cell of rectangle.cells()) {
    if (!occupied.has(cell)) {
      return false;
    }
  }
  return true;
}

/** Map each cell hash to the candidate rectangles that cover it. */
function indexRectanglesByCell(rectangles: readonly GridRectangle2[]): Map<number, GridRectangle2[]> {
  const covering = new Map<number, GridRectangle2[]>();

  for (const rectangle of rectangles) {
    for (const cell of rectangle.cells()) {
      const list = covering.get(cell.hash()) ?? [];
      list.push(rectangle);
      covering.set(cell.hash(), list);
    }
  }

  return covering;
}

function findMinimumPartition(
  occupied: GridCell2Collection,
  covering: ReadonlyMap<number, readonly GridRectangle2[]>,
): GridRectangle2[] {
  let best: GridRectangle2[] | null = null;

  function search(remaining: GridCell2Collection, current: GridRectangle2[]): void {
    if (remaining.size() === 0) {
      if (!best || current.length < best.length) {
        best = [...current];
      }
      return;
    }

    if (best && current.length >= best.length) {
      return;
    }

    const seed = remaining.toArray()[0]!;
    for (const rectangle of covering.get(seed.hash()) ?? []) {
      if (!isFullyOccupied(rectangle, remaining)) {
        continue;
      }

      current.push(rectangle);
      search(remaining.subtract(rectangle.toCellCollection()), current);
      current.pop();
    }
  }

  search(occupied, []);
  return best ?? [];
}
