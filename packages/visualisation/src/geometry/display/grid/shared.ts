import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import type { Grid2 } from '@dirty-geometry/vec2/grid/core/grid2';
import type { GridCell2 } from '@dirty-geometry/vec2/grid/core/grid-cell2';
import type { GridCell2Collection } from '@dirty-geometry/vec2/grid/regions/grid-cell2-collection';
import { Line2 } from '@dirty-geometry/vec2/geometry/primitives/line2';
import { vec2ToTuple } from '../../../core/frame';
import type { Point3 } from '../types';
import type { GeometryDisplayContext } from '../context';

export type GridDisplayContext = GeometryDisplayContext & {
  grid: Grid2;
};

export type GridLatticeDisplay = {
  segments: [Point3, Point3][];
};

export type GridCellFillDisplay = {
  quads: Point3[][];
};

export type GridMarkerDisplay = {
  points: Point3[];
};

/** Grid lattice line segments in grid-local coordinates. */
export function gridLocalLines(grid: Grid2, columnCount: number, rowCount: number): Line2[] {
  const segments: Line2[] = [];

  const minY = grid.cellY(0);
  const maxY = grid.cellY(rowCount);
  for (let i = 0; i <= columnCount; i++) {
    const x = grid.cellX(i);
    segments.push(new Line2(new Vec2(x, minY), new Vec2(x, maxY)));
  }

  const minX = grid.cellX(0);
  const maxX = grid.cellX(columnCount);
  for (let j = 0; j <= rowCount; j++) {
    const y = grid.cellY(j);
    segments.push(new Line2(new Vec2(minX, y), new Vec2(maxX, y)));
  }

  return segments;
}

/** Grid lattice line segments in world space. */
export function gridWorldLines(grid: Grid2, columnCount: number, rowCount: number): Line2[] {
  return gridLocalLines(grid, columnCount, rowCount).map((line) => line.transform(grid.frame.toMat3()));
}

export function fittedCellQuad(grid: Grid2, cell: GridCell2, fit: (point: Vec2) => Vec2, offset: Vec2): Point3[] {
  const corners = grid.cellWorldCorners(cell);
  const fitted = corners.map((corner) => vec2ToTuple(fit(corner), offset));
  return [...fitted, fitted[0]!];
}

export function fittedCellCenter(grid: Grid2, cell: GridCell2, fit: (point: Vec2) => Vec2, offset: Vec2): Point3 {
  return vec2ToTuple(fit(grid.cellWorldCenter(cell)), offset);
}

export function createGridLatticeDisplay(
  grid: Grid2,
  columnCount: number,
  rowCount: number,
  ctx: GeometryDisplayContext,
): GridLatticeDisplay {
  const segments = gridWorldLines(grid, columnCount, rowCount).map(({ from, to }) => {
    const fittedFrom = vec2ToTuple(ctx.fit(from), ctx.offset);
    const fittedTo = vec2ToTuple(ctx.fit(to), ctx.offset);
    return [fittedFrom, fittedTo] as [Point3, Point3];
  });

  return { segments };
}

export function createCellCollectionFillDisplay(
  grid: Grid2,
  collection: GridCell2Collection,
  ctx: GeometryDisplayContext,
): GridCellFillDisplay {
  const quads = collection.toArray().map((cell) => {
    const corners = fittedCellQuad(grid, cell, ctx.fit, ctx.offset);
    return corners.slice(0, 4);
  });

  return { quads };
}

export function createCellCollectionMarkerDisplay(
  grid: Grid2,
  collection: GridCell2Collection,
  ctx: GeometryDisplayContext,
): GridMarkerDisplay {
  return {
    points: collection.toArray().map((cell) => fittedCellCenter(grid, cell, ctx.fit, ctx.offset)),
  };
}

export function createGridCellMarkerDisplay(
  grid: Grid2,
  cells: readonly GridCell2[],
  ctx: GeometryDisplayContext,
): GridMarkerDisplay {
  return {
    points: cells.map((cell) => fittedCellCenter(grid, cell, ctx.fit, ctx.offset)),
  };
}
